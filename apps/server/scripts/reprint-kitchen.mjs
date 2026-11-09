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
const kitchen = await prisma.printJob.findFirst({
  where: { kind: 'order_kitchen', status: 'done' },
  orderBy: { id: 'desc' },
});
if (!kitchen) throw new Error('no kitchen job');
const reprinted = await api(
  'POST',
  `/print/jobs/${kitchen.id}/reprint`,
  {},
  login.accessToken,
);
await new Promise((r) => setTimeout(r, 4000));
const job = await prisma.printJob.findUnique({ where: { id: BigInt(reprinted.id) } });
console.log({ from: kitchen.id.toString(), newId: reprinted.id, status: job?.status, error: job?.error });
await prisma.$disconnect();
