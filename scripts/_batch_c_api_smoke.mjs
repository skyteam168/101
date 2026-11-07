/**
 * Batch C API smoke (JWT signed locally).
 * node scripts/_batch_c_api_smoke.mjs
 */
import { createRequire } from 'module';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/server/package.json'));
const { PrismaClient } = require('@prisma/client');
const env = Object.fromEntries(
  readFileSync(resolve(root, 'apps/server/.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);
function b64url(o) {
  return Buffer.from(JSON.stringify(o))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
function tok(u) {
  const h = b64url({ alg: 'HS256', typ: 'JWT' });
  const n = Math.floor(Date.now() / 1000);
  const p = b64url({
    sub: u.id.toString(),
    username: u.username,
    typ: 'access',
    iat: n,
    exp: n + 7200,
  });
  const s = createHmac('sha256', env.JWT_SECRET)
    .update(`${h}.${p}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${h}.${p}.${s}`;
}

const BASE = 'http://127.0.0.1:3000/api';
const prisma = new PrismaClient();
const results = [];

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
}

const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
const token = tok(admin);

{
  const r = await api('GET', '/reports/ops-today', token);
  check('C10 ops-today', r.status === 200 && r.data.code === 0, JSON.stringify(r.data.data || {}).slice(0, 180));
}

{
  const list = await api('GET', '/members?pageSize=1', token);
  const rows = list.data?.data?.list || list.data?.data || list.data || [];
  const id = Array.isArray(rows) ? rows[0]?.id : rows?.id;
  if (id) {
    const r = await api('GET', `/members/${id}/detail`, token);
    check('C11 member detail', r.status === 200 && r.data.code === 0, String(r.status));
  } else {
    check('C11 member detail', true, 'skip no members');
  }
}

{
  const ym = new Date().toISOString().slice(0, 7);
  const r = await api('POST', '/finance/expenses', token, {
    yearMonth: ym,
    type: 'rent',
    amount: 1000000,
    remark: 'batch-c-smoke',
  });
  check('C12 create expense', r.status === 200 || r.status === 201, String(r.status));
  const id = r.data?.data?.id;
  if (id) {
    const d = await api('DELETE', `/finance/expenses/${id}`, token);
    check('C12 delete expense', d.status === 200 || d.status === 201 || d.data?.code === 0, String(d.status));
  }
}

{
  const r = await api('POST', '/finance/partners', token, {
    name: 'Smoke Partner',
    idNumber: 'P123',
    address: 'HN',
    sharePercent: 1000,
  });
  check('C13 create partner', r.status === 200 || r.status === 201, JSON.stringify(r.data).slice(0, 120));
  const id = r.data?.data?.id;
  if (id) {
    const s = await api('POST', '/finance/settlements', token, {
      partnerId: id,
      yearMonth: new Date().toISOString().slice(0, 7),
      settleDate: new Date().toISOString().slice(0, 10),
      amount: 50000,
      note: 'smoke',
    });
    check('C13 create settlement', s.status === 200 || s.status === 201, String(s.status));
    await api('DELETE', `/finance/partners/${id}`, token);
  }
}

{
  const r = await api('GET', '/reports/period-profit?period=month&anchor=2026-11', token);
  check('period-profit', r.status === 200 && r.data.code === 0, String(r.status));
}

await prisma.$disconnect();
const failed = results.filter((x) => !x.ok);
if (failed.length) process.exit(1);
console.log('SMOKE OK', results.length);
