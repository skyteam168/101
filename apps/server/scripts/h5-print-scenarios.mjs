/**
 * 联调：外卖 / 预订入座预点 / 扫码点餐 → 小票打印
 * 用法：pnpm --filter @restaurant/server exec node scripts/h5-print-scenarios.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_BASE || 'http://127.0.0.1:3000/api';

async function api(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return json?.data !== undefined ? json.data : json;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function recentJobs(sinceId, label) {
  await sleep(4500);
  const jobs = await prisma.printJob.findMany({
    where: { id: { gt: sinceId } },
    orderBy: { id: 'asc' },
    include: { printer: true },
  });
  console.log(
    `\n[${label}] jobs`,
    jobs.map((j) => ({
      id: j.id.toString(),
      kind: j.kind,
      status: j.status,
      error: j.error,
      template: j.payload?.template,
      title: j.payload?.data?.titleZh,
      items: (j.payload?.data?.items || []).map((i) => i.nameZh).join(','),
      printer: j.printer?.name,
    })),
  );
  return jobs;
}

const login = await api('POST', '/auth/login', {
  username: 'admin',
  password: 'Admin@123',
});
const token = login.accessToken;
if (!token) throw new Error('login failed');

const dishes = await prisma.dish.findMany({
  where: { status: 'on', isDineIn: true },
  orderBy: { id: 'asc' },
  take: 3,
});
if (dishes.length < 2) throw new Error('need dishes');

const maxBefore = await prisma.printJob.findFirst({ orderBy: { id: 'desc' } });
let since = maxBefore?.id ?? 0n;

// ── 1) 外卖（H5 下单链路等价：创建外卖单 + 接单触发打印）──
console.log('\n=== 1) 外卖 takeaway/delivery 打印 ===');
const takeaway = await api(
  'POST',
  '/orders/takeaway',
  {
    items: [
      { dishId: dishes[0].id.toString(), qty: 1 },
      { dishId: dishes[1].id.toString(), qty: 1 },
    ],
    remark: '外卖打印联调',
  },
  token,
);
console.log('takeaway order', takeaway.id || takeaway.orderId, takeaway.orderNo);
const twJobs = await recentJobs(since, '外卖');
since = twJobs.at(-1)?.id ?? since;

// ── 2) 扫码点餐（开台 + 提交，等同 H5 桌台 session submit）──
console.log('\n=== 2) 扫码点餐 打印 ===');
const table = await prisma.table.findFirst({
  where: { status: 'idle' },
  orderBy: { id: 'asc' },
});
if (!table) throw new Error('no idle table');
const opened = await api(
  'POST',
  `/tables/${table.id}/open`,
  { guestCount: 2 },
  token,
);
console.log('opened', opened.code, 'session', opened.session?.id);
const submitted = await api(
  'POST',
  '/orders/submit',
  {
    tableId: table.id.toString(),
    items: [
      { dishId: dishes[0].id.toString(), qty: 1 },
      { dishId: dishes[2]?.id?.toString() || dishes[1].id.toString(), qty: 1 },
    ],
    remark: '扫码点餐打印联调',
  },
  token,
);
console.log('scan order', submitted.id || submitted.orderId, submitted.orderNo);
const scanJobs = await recentJobs(since, '扫码点餐');
since = scanJobs.at(-1)?.id ?? since;

// ── 3) 预订入座带预点（会 submit 出堂食单并打印）──
console.log('\n=== 3) 预订入座预点 打印 ===');
const idle2 = await prisma.table.findFirst({
  where: { status: 'idle', id: { not: table.id } },
  orderBy: { id: 'asc' },
});
if (!idle2) throw new Error('need second idle table for reservation');

const reserveAt = new Date(Date.now() + 3600_000).toISOString();
const reservation = await api(
  'POST',
  '/reservations',
  {
    customerName: '预订打印测试',
    phone: '0900000002',
    guestCount: 2,
    reserveAt,
    tableId: idle2.id.toString(),
    items: [
      { dishId: dishes[0].id.toString(), qty: 1 },
      { dishId: dishes[1].id.toString(), qty: 1 },
    ],
    remark: '预订预点打印联调',
  },
  token,
);
console.log('reservation', reservation.id, reservation.status);
if (reservation.status === 'pending') {
  await api('POST', `/reservations/${reservation.id}/confirm`, {}, token);
  console.log('reservation confirmed');
}
const seated = await api(
  'POST',
  `/reservations/${reservation.id}/seat`,
  { tableId: idle2.id.toString(), guestCount: 2 },
  token,
);
console.log('seated', seated.id, 'orderId', seated.orderId || seated.order?.id);
const resJobs = await recentJobs(since, '预订入座');

console.log('\n=== 完成 ===');
console.log({
  takeawayJobs: twJobs.length,
  scanJobs: scanJobs.length,
  reservationJobs: resJobs.length,
});

await prisma.$disconnect();
