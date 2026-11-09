import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = 'http://127.0.0.1:3000/api';

async function api(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json?.data !== undefined ? json.data : json;
}

const login = await api('POST', '/auth/login', {
  username: 'admin',
  password: 'Admin@123',
});

// 清掉测试订单备注里的「联调」字样
const order = await prisma.order.findFirst({
  where: { orderNo: 'D20261109200228214' },
});
if (order) {
  await prisma.order.update({
    where: { id: order.id },
    data: { remark: null },
  });
  console.log('cleared order remark', order.id.toString());
}

const front = await prisma.printJob.findFirst({
  where: { kind: 'order_front', status: 'done' },
  orderBy: { id: 'desc' },
});
if (!front) throw new Error('no front job');

const payload = front.payload;
if (payload && typeof payload === 'object' && payload.data) {
  payload.data.remark = undefined;
  delete payload.data.remark;
  await prisma.printJob.update({
    where: { id: front.id },
    data: { payload },
  });
  console.log('cleared job payload remark', front.id.toString());
}

const reprinted = await api(
  'POST',
  `/print/jobs/${front.id}/reprint`,
  {},
  login.accessToken,
);
await new Promise((r) => setTimeout(r, 4500));
const job = await prisma.printJob.findUnique({ where: { id: BigInt(reprinted.id) } });
console.log({
  from: front.id.toString(),
  newId: reprinted.id,
  status: job?.status,
  error: job?.error,
  remark: job?.payload?.data?.remark ?? null,
});
await prisma.$disconnect();
