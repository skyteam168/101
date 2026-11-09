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
  // 统一响应包装 { code, data, message }
  return json?.data !== undefined ? json.data : json;
}

const dishes = await prisma.dish.findMany({
  where: { status: 'on', isDineIn: true },
  orderBy: { id: 'asc' },
  take: 5,
  select: { id: true, nameZh: true, price: true },
});
const table = await prisma.table.findFirst({
  where: { status: 'idle' },
  orderBy: { id: 'asc' },
  select: { id: true, code: true, status: true },
});
const printer = await prisma.printer.findFirst({ where: { id: 4n } });

console.log(
  'context',
  JSON.stringify(
    {
      dishes: dishes.map((d) => ({
        id: d.id.toString(),
        name: d.nameZh,
        price: d.price.toString(),
      })),
      table: table && {
        id: table.id.toString(),
        code: table.code,
        status: table.status,
      },
      printer: printer && {
        id: printer.id.toString(),
        ip: printer.ip,
        type: printer.connectionType,
        active: printer.isActive,
      },
    },
    null,
    2,
  ),
);

if (!dishes.length || !table) throw new Error('缺少可用菜品或空闲桌台');

const login = await api('POST', '/auth/login', {
  username: 'admin',
  password: 'Admin@123',
});
const token = login.accessToken;
if (!token) throw new Error(`登录无 token: ${JSON.stringify(login)}`);

const opened = await api('POST', `/tables/${table.id}/open`, { guestCount: 3 }, token);
console.log('opened', opened.code, opened.status, 'session', opened.session?.id);

const firstItems = dishes.slice(0, 3).map((d, i) => ({
  dishId: d.id.toString(),
  qty: i === 0 ? 2 : 1,
}));

const submitted = await api(
  'POST',
  '/orders/submit',
  {
    tableId: table.id.toString(),
    items: firstItems,
    remark: undefined,
  },
  token,
);
const orderId = submitted.id?.toString?.() || submitted.orderId?.toString?.();
console.log(
  'submitted',
  JSON.stringify(
    {
      orderId,
      orderNo: submitted.orderNo,
      total: submitted.total,
      items: firstItems.map((it, i) => ({ ...it, name: dishes[i].nameZh })),
    },
    null,
    2,
  ),
);
if (!orderId) throw new Error(`无法解析订单: ${JSON.stringify(submitted)}`);

// 再加一轮菜（加菜单）
const more = await api(
  'POST',
  `/orders/${orderId}/items`,
  {
    items: [
      {
        dishId: dishes[Math.min(3, dishes.length - 1)].id.toString(),
        qty: 1,
      },
    ],
  },
  token,
);
console.log('addedRound2', more?.batches?.length ?? more?.id ?? 'ok');

await new Promise((r) => setTimeout(r, 4000));
const jobs = await prisma.printJob.findMany({
  where: { orderId: BigInt(orderId) },
  orderBy: { id: 'asc' },
  include: { printer: true },
});
console.log(
  'jobs',
  JSON.stringify(
    jobs.map((j) => ({
      id: j.id.toString(),
      kind: j.kind,
      status: j.status,
      error: j.error,
      printer: j.printer?.name,
      ip: j.printer?.ip,
      type: j.printer?.connectionType,
    })),
    null,
    2,
  ),
);

await prisma.$disconnect();
