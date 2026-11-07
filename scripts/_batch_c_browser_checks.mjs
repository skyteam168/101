/**
 * Batch C verify helpers (Nest/Vite must be up).
 * node scripts/_batch_c_browser_checks.mjs
 */
import { createRequire } from 'module';
import { createHmac } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
}

const prisma = new PrismaClient();
const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
const token = tok(admin);

async function get(path) {
  const res = await fetch('http://127.0.0.1:3000/api' + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

{
  const r = await get('/reports/ops-today');
  const d = r.data?.data;
  check(
    'C10 ops-today shape',
    r.status === 200 &&
      d &&
      typeof d.orderCounts?.dine_in === 'number' &&
      typeof d.tables?.cleaning === 'number' &&
      Array.isArray(d.lowStockDishes),
    JSON.stringify(d?.orderCounts),
  );
}

{
  const r = await get('/finance/expenses');
  check('C12 finance expenses', r.status === 200 && r.data.code === 0);
}
{
  const r = await get('/finance/partners');
  check('C13 finance partners', r.status === 200 && r.data.code === 0);
}
{
  const r = await get('/reports/period-profit?period=month&anchor=2026-11');
  check(
    'C13 period-profit',
    r.status === 200 && r.data.code === 0 && typeof r.data.data?.remainingAfterPartners === 'number',
    String(r.data?.data?.remainingAfterPartners),
  );
}

{
  const cashier = readFileSync(
    resolve(root, 'apps/admin/src/views/cashier/CashierView.vue'),
    'utf8',
  );
  check('C2 discount inputValue empty', /inputValue:\s*['"]{2}/.test(cashier));
  check(
    'C3/C8 useDishOptions + remove',
    /useDishOptions/.test(cashier) && /removeCartLine|common\.delete/.test(cashier),
  );
}
{
  const ordering = readFileSync(
    resolve(root, 'apps/admin/src/views/tables/OrderingView.vue'),
    'utf8',
  );
  check(
    'C3/C9 ordering options+delete',
    /useDishOptions/.test(ordering) && /removeCartLine/.test(ordering),
  );
}
{
  const print = readFileSync(
    resolve(root, 'apps/server/src/modules/print/print-job.service.ts'),
    'utf8',
  );
  check('C4 kitchen target dedupe', /resolveKitchenTargets|dedupe|acceptAllTickets/.test(print));
}
{
  const table = readFileSync(
    resolve(root, 'apps/h5/src/views/table/TableOrderView.vue'),
    'utf8',
  );
  check(
    'C5 ordered badge + qty',
    /ordered-badge/.test(table) && /qty-ctrl/.test(table) && /orderedQtyOf/.test(table),
  );
}
{
  const reserve = readFileSync(
    resolve(root, 'apps/h5/src/views/reserve/ReserveView.vue'),
    'utf8',
  );
  check('C6 reserve qty+options', /qty-ctrl/.test(reserve) && /optionGroups/.test(reserve));
}
{
  const voice = readFileSync(
    resolve(root, 'apps/admin/src/composables/useVoiceAlert.ts'),
    'utf8',
  );
  check('C7 takeaway not loop', /takeaway/.test(voice) && /delivery/.test(voice));
}
{
  const adminChat = readFileSync(
    resolve(root, 'apps/admin/src/views/chat/ChatView.vue'),
    'utf8',
  );
  const h5Chat = readFileSync(resolve(root, 'apps/h5/src/views/shop/ChatView.vue'), 'utf8');
  check(
    'C1 autoTranslate default on',
    /AUTO_KEY\) !== '0'/.test(adminChat) && /AUTO_KEY\) !== '0'/.test(h5Chat),
  );
  check('C1 silent autoFill H5', /silent:\s*true/.test(h5Chat));
}
{
  const login = readFileSync(
    resolve(root, 'apps/h5/src/views/shop/AuthLoginView.vue'),
    'utf8',
  );
  check(
    'C14 placeholders',
    /emailPlaceholder/.test(login) &&
      /passwordPlaceholder/.test(login) &&
      /codePlaceholder/.test(login),
  );
}

for (const [name, url] of [
  ['admin dashboard', 'http://127.0.0.1:5173/dashboard'],
  ['admin finance', 'http://127.0.0.1:5173/finance'],
  ['h5 login', 'http://127.0.0.1:5174/shop/login'],
]) {
  try {
    const res = await fetch(url);
    check(name + ' HTTP', res.status === 200, String(res.status));
  } catch (e) {
    check(name + ' HTTP', false, String(e));
  }
}

{
  const r = spawnSync('npx', ['jest', '--passWithNoTests', 'print-job'], {
    cwd: resolve(root, 'apps/server'),
    encoding: 'utf8',
    shell: true,
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  check('C4 print-job unit', r.status === 0 && /Tests:\s+4 passed/.test(out), out.slice(-240));
}

await prisma.$disconnect();

const outPath = resolve(root, 'scripts/_batch_c_verify_results.json');
writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((x) => !x.ok);
console.log(failed.length ? `VERIFY FAIL ${failed.length}` : `VERIFY OK ${results.length}`);
console.log('wrote', outPath);
process.exit(failed.length ? 1 : 0);
