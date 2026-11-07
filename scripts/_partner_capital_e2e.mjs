/**
 * Partner capital e2e: initial 50M + increase 10M + settle + ledger + recon
 * node scripts/_partner_capital_e2e.mjs
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
const stamp = Date.now().toString().slice(-6);

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
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
let partnerId = null;
let entryIncreaseId = null;
let settlementId = null;
let assetId = null;

{
  const asset = await prisma.asset.findFirst({ orderBy: { id: 'asc' } });
  assetId = asset?.id?.toString() || null;
}

{
  const r = await api('POST', '/finance/partners', token, {
    name: `出资测试${stamp}`,
    idNumber: `CAP${stamp}`,
    address: 'HN',
    sharePercent: 4000,
    status: 'active',
    initialCapital: 50_000_000,
    initialCapitalDate: '2026-11-01',
    initialCapitalCategory: 'working_capital',
    initialCapitalNote: '期初开店',
  });
  partnerId = r.data?.data?.id;
  check(
    'create partner with initial 50M',
    (r.status === 200 || r.status === 201) &&
      partnerId &&
      Number(r.data?.data?.investedTotal) === 50_000_000,
    JSON.stringify(r.data?.data || r.data).slice(0, 200),
  );
}

{
  const r = await api('POST', '/finance/capital-entries', token, {
    partnerId,
    entryDate: '2026-11-05',
    type: 'increase',
    amount: 10_000_000,
    category: 'equipment',
    refType: assetId ? 'asset' : undefined,
    refId: assetId || undefined,
    note: '增资买设备',
  });
  entryIncreaseId = r.data?.data?.id;
  check(
    'increase 10M' + (assetId ? ' linked asset' : ''),
    (r.status === 200 || r.status === 201) && !!entryIncreaseId,
    JSON.stringify(r.data?.data || r.data).slice(0, 180),
  );
}

{
  const r = await api('GET', `/finance/partners/${partnerId}/ledger`, token);
  const d = r.data?.data;
  check(
    'ledger invested=60M',
    r.status === 200 &&
      d &&
      d.invested === 60_000_000 &&
      d.capitalEntries?.length >= 2 &&
      typeof d.cashRoi === 'number' &&
      typeof d.equityShare === 'number',
    d
      ? `invested=${d.invested} div=${d.dividends} cashRoi=${d.cashRoi} equity=${d.equityShare}`
      : String(r.status),
  );
}

{
  const r = await api('POST', '/finance/settlements', token, {
    partnerId,
    settleDate: '2026-11-07',
    yearMonth: '2026-11',
    amount: 5_000_000,
    note: '测试分红',
  });
  settlementId = r.data?.data?.id;
  check('settlement 5M', (r.status === 200 || r.status === 201) && !!settlementId);
}

{
  const r = await api('GET', `/finance/partners/${partnerId}/ledger`, token);
  const d = r.data?.data;
  check(
    'cashRoi = 5M - 60M = -55M',
    d && d.dividends === 5_000_000 && d.cashRoi === -55_000_000,
    d ? `cashRoi=${d.cashRoi}` : 'missing',
  );
}

{
  const r = await api('GET', '/finance/capital-recon', token);
  const d = r.data?.data;
  check(
    'capital-recon shape',
    r.status === 200 &&
      d &&
      typeof d.totalCapital === 'number' &&
      typeof d.assetBook === 'number' &&
      typeof d.gap === 'number' &&
      d.totalCapital >= 60_000_000,
    d
      ? `total=${d.totalCapital} asset=${d.assetBook} inv=${d.inventoryValue} gap=${d.gap}`
      : String(r.status),
  );
}

{
  const r = await api('GET', '/finance/partners', token);
  const hit = (r.data?.data || []).find((p) => String(p.id) === String(partnerId));
  check(
    'list partners shows invested+roi',
    hit && hit.investedTotal === 60_000_000 && hit.cashRoi === -55_000_000,
    hit ? JSON.stringify({ i: hit.investedTotal, r: hit.cashRoi }) : 'missing',
  );
}

// cleanup
if (settlementId) await api('DELETE', `/finance/settlements/${settlementId}`, token);
if (entryIncreaseId) await api('DELETE', `/finance/capital-entries/${entryIncreaseId}`, token);
{
  const list = await api('GET', `/finance/capital-entries?partnerId=${partnerId}`, token);
  for (const e of list.data?.data || []) {
    await api('DELETE', `/finance/capital-entries/${e.id}`, token);
  }
}
if (partnerId) {
  const r = await api('DELETE', `/finance/partners/${partnerId}`, token);
  check('cleanup partner', r.status === 200);
}

await prisma.$disconnect();
const out = resolve(root, 'scripts/_partner_capital_e2e_results.json');
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), stamp, results }, null, 2));
const failed = results.filter((x) => !x.ok);
console.log(failed.length ? `CAPITAL E2E FAIL ${failed.length}` : `CAPITAL E2E OK ${results.length}`);
console.log('wrote', out);
process.exit(failed.length ? 1 : 0);
