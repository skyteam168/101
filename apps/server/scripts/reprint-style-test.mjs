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
const token = login.accessToken;

// 用最近成功的前台/加菜任务各重打一张
const jobs = await prisma.printJob.findMany({
  where: {
    kind: { in: ['order_front', 'add'] },
    status: 'done',
  },
  orderBy: { id: 'desc' },
  take: 2,
});

for (const job of jobs) {
  const reprinted = await api('POST', `/print/jobs/${job.id}/reprint`, {}, token);
  console.log('reprint', {
    from: job.id.toString(),
    kind: job.kind,
    newId: reprinted?.id,
    status: reprinted?.status,
  });
}

await new Promise((r) => setTimeout(r, 5000));
const latest = await prisma.printJob.findMany({
  orderBy: { id: 'desc' },
  take: 4,
  include: { printer: true },
});
console.log(
  latest.map((j) => ({
    id: j.id.toString(),
    kind: j.kind,
    status: j.status,
    error: j.error,
    ip: j.printer?.ip,
  })),
);
await prisma.$disconnect();
