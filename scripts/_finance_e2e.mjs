/**
 * Finance module end-to-end functional test.
 * node scripts/_finance_e2e.mjs
 */
import { createRequire } from 'module';
import { createHmac } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
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
  const n = Math.floor(Date.now()/1000);
  const p = b64url({ sub: u.id.toString(), username: u.username, typ: 'access', iat: n, exp: n + 7200 });
  const s = createHmac('sha256', env.JWT_SECRET).update(`${h}.${p}`).digest('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${h}.${p}.${s}`;
}

const BASE = 'http://127.0.0.1:3000/api';
const prisma = new PrismaClient();
const results = [];
const stamp = Date.now().toString().slice(-6);
const YM = '2026-11';

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
}

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

const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
const token = tok(admin);
const ctx = { expenseIds: [], partnerId: null, settlementId: null };

// ---- 1. 运营费用：水/电/租金 各建一条 ----
for (const row of [
  { type: 'water', quantity: 120, unit: 'm3', amount: 850000, remark: `E2E水费-${stamp}` },
  { type: 'electricity', quantity: 980, unit: 'kWh', amount: 3200000, remark: `E2E电费-${stamp}` },
  { type: 'rent', quantity: 1, unit: 'month', amount: 25000000, remark: `E2E租金-${stamp}` },
]) {
  const r = await api('POST', '/finance/expenses', token, { yearMonth: YM, ...row });
  const ok = (r.status === 200 || r.status === 201) && r.data?.code === 0 && r.data?.data?.id;
  if (ok) ctx.expenseIds.push(r.data.data.id);
  check(`expense create ${row.type}`, ok, JSON.stringify(r.data?.data || r.data).slice(0, 160));
}

{
  const r = await api('GET', `/finance/expenses?yearMonth=${YM}`, token);
  const list = r.data?.data || [];
  const found = ctx.expenseIds.every((id) => list.some((x) => String(x.id) === String(id)));
  check('expense list contains created', r.status === 200 && found, `count=${list.length}`);
}

{
  const id = ctx.expenseIds[0];
  const r = await api('PATCH', `/finance/expenses/${id}`, token, {
    yearMonth: YM,
    type: 'water',
    quantity: 125,
    unit: 'm3',
    amount: 900000,
    remark: `E2E水费改-${stamp}`,
  });
  check(
    'expense update water',
    r.status === 200 && r.data?.code === 0 && Number(r.data?.data?.amount) === 900000,
    String(r.data?.data?.amount),
  );
}

// ---- 2. 合伙人：创建 → 列表 → 更新 ----
{
  const r = await api('POST', '/finance/partners', token, {
    name: `测试合伙人${stamp}`,
    idNumber: `ID${stamp}`,
    address: 'Ha Noi, VN',
    sharePercent: 3000, // 30.00%
    status: 'active',
    remark: 'E2E partner',
  });
  ctx.partnerId = r.data?.data?.id;
  check(
    'partner create',
    (r.status === 200 || r.status === 201) && !!ctx.partnerId,
    JSON.stringify(r.data?.data || r.data).slice(0, 180),
  );
}

{
  const r = await api('GET', '/finance/partners', token);
  const list = r.data?.data || [];
  const hit = list.find((p) => String(p.id) === String(ctx.partnerId));
  check(
    'partner list',
    !!hit && hit.name.includes(stamp) && Number(hit.sharePercent) === 3000,
    hit ? `${hit.name} ${hit.sharePercent}` : 'missing',
  );
}

{
  const r = await api('PATCH', `/finance/partners/${ctx.partnerId}`, token, {
    name: `测试合伙人${stamp}`,
    idNumber: `ID${stamp}`,
    address: 'Da Nang, VN',
    sharePercent: 3500,
    status: 'active',
    remark: 'E2E partner updated',
  });
  check(
    'partner update share 35%',
    r.status === 200 && Number(r.data?.data?.sharePercent) === 3500,
    String(r.data?.data?.sharePercent),
  );
}

// ---- 3. 分红结算：创建 → 列表 ----
{
  const r = await api('POST', '/finance/settlements', token, {
    partnerId: String(ctx.partnerId),
    settleDate: '2026-11-07',
    yearMonth: YM,
    amount: 5000000,
    note: `E2E分红-${stamp}`,
  });
  ctx.settlementId = r.data?.data?.id;
  check(
    'settlement create',
    (r.status === 200 || r.status === 201) && !!ctx.settlementId,
    JSON.stringify(r.data?.data || r.data).slice(0, 180),
  );
}

{
  const r = await api('GET', `/finance/settlements?yearMonth=${YM}`, token);
  const list = r.data?.data || [];
  const hit = list.find((s) => String(s.id) === String(ctx.settlementId));
  check(
    'settlement list',
    !!hit && Number(hit.amount) === 5000000,
    hit ? `${hit.partnerName} ${hit.amount}` : 'missing',
  );
}

// ---- 4. 月度汇总 / period-profit 反映费用与分红 ----
{
  const r = await api('GET', `/reports/period-profit?period=month&anchor=${YM}`, token);
  const d = r.data?.data;
  const ok =
    r.status === 200 &&
    r.data?.code === 0 &&
    d &&
    typeof d.opsExpense === 'number' &&
    typeof d.partnerSettlements === 'number' &&
    typeof d.remainingAfterPartners === 'number' &&
    d.opsExpense >= 900000 &&
    d.partnerSettlements >= 5000000;
  check(
    'period-profit includes expense+settlement',
    ok,
    d
      ? `ops=${d.opsExpense} settle=${d.partnerSettlements} remain=${d.remainingAfterPartners}`
      : JSON.stringify(r.data).slice(0, 120),
  );
}

// ---- 5. 清理本轮数据（避免污染）----
if (ctx.settlementId) {
  const r = await api('DELETE', `/finance/settlements/${ctx.settlementId}`, token);
  check('settlement delete', r.status === 200 && r.data?.code === 0, String(r.status));
}
if (ctx.partnerId) {
  const r = await api('DELETE', `/finance/partners/${ctx.partnerId}`, token);
  check('partner delete', r.status === 200 && r.data?.code === 0, String(r.status));
}
for (const id of ctx.expenseIds) {
  const r = await api('DELETE', `/finance/expenses/${id}`, token);
  check(`expense delete ${id}`, r.status === 200 && r.data?.code === 0, String(r.status));
}

await prisma.$disconnect();

const out = resolve(root, 'scripts/_finance_e2e_results.json');
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), stamp, results }, null, 2));
const failed = results.filter((x) => !x.ok);
console.log(failed.length ? `FINANCE E2E FAIL ${failed.length}` : `FINANCE E2E OK ${results.length}`);
console.log('wrote', out);
process.exit(failed.length ? 1 : 0);
