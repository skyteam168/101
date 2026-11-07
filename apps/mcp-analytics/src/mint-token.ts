/**
 * 为本机 / 线上 MCP 签发：
 * - RESTAURANT_TOKEN：调用业务 API 的 JWT
 * - MCP_API_KEY：对外 HTTP MCP 的 Bearer 密钥（给 AI 平台填）
 *
 * 用法: pnpm --filter @restaurant/mcp-analytics mint-token
 */
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const serverEnv = resolve(root, 'apps/server/.env');
const outEnv = resolve(root, 'apps/mcp-analytics/.env');

function parseEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64url');
}

function signHs256(secret: string, header: object, payload: object): string {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const digest = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${digest}`;
}

async function main() {
  const env = parseEnv(serverEnv);
  const prev = parseEnv(outEnv);
  const secret = env.JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(`未找到 JWT_SECRET（期望 ${serverEnv}）`);
  }

  const userId = process.env.MCP_USER_ID || '1';
  const username = process.env.MCP_USERNAME || 'admin';
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 7 * 24 * 3600;

  const token = signHs256(
    secret,
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: userId,
      username,
      typ: 'access',
      iat: now,
      exp,
    },
  );

  const apiBase =
    process.env.RESTAURANT_API_BASE ||
    prev.RESTAURANT_API_BASE ||
    `http://127.0.0.1:${env.PORT || '3000'}/api`;

  const mcpApiKey =
    process.env.MCP_API_KEY ||
    prev.MCP_API_KEY ||
    randomBytes(24).toString('base64url');

  const lines = [
    '# MCP 配置（勿提交仓库）',
    `RESTAURANT_API_BASE=${apiBase}`,
    `RESTAURANT_TOKEN=${token}`,
    `MCP_API_KEY=${mcpApiKey}`,
    'MCP_HTTP_PORT=3100',
    'MCP_HTTP_HOST=0.0.0.0',
    'MCP_ALLOWED_HOSTS=www.nhahang101.top,localhost,127.0.0.1',
    '',
  ];
  writeFileSync(outEnv, lines.join('\n'), 'utf8');
  console.log(`已写入 ${outEnv}`);
  console.log(`API: ${apiBase}`);
  console.log(`RESTAURANT_TOKEN 前缀: ${token.slice(0, 24)}...`);
  console.log(`MCP_API_KEY: ${mcpApiKey}`);
  console.log(`JWT 过期: ${new Date(exp * 1000).toISOString()}`);
  console.log('');
  console.log('线上导入示例：');
  console.log('  类型: 在线服务 (HTTP)');
  console.log('  服务地址: https://www.nhahang101.top/mcp');
  console.log(`  请求头: Authorization: Bearer ${mcpApiKey}`);
  console.log('  登录方式: 不用登录（密钥已放请求头）或「填写密钥」');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
