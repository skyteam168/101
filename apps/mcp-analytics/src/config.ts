import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type McpConfig = {
  apiBase: string;
  token: string;
  /** HTTP MCP 对外密钥；客户端 Authorization: Bearer <key> */
  mcpApiKey: string;
  httpPort: number;
  httpHost: string;
  allowedHosts: string[];
};

/** 从环境变量读取；可选加载 apps/mcp-analytics/.env（不覆盖已有 env） */
export function loadConfig(opts?: { requireMcpKey?: boolean }): McpConfig {
  loadDotEnvQuiet(resolve(packageRoot(), '.env'));

  const apiBase =
    process.env.RESTAURANT_API_BASE?.trim() ||
    process.env.API_BASE?.trim() ||
    'http://127.0.0.1:3000/api';

  const token =
    process.env.RESTAURANT_TOKEN?.trim() ||
    process.env.RESTAURANT_API_TOKEN?.trim() ||
    '';

  if (!token) {
    throw new Error(
      '缺少 RESTAURANT_TOKEN。请先运行: pnpm --filter @restaurant/mcp-analytics mint-token',
    );
  }

  const mcpApiKey = process.env.MCP_API_KEY?.trim() || '';
  if (opts?.requireMcpKey && !mcpApiKey) {
    throw new Error('HTTP 模式需要 MCP_API_KEY（对外密钥，勿与 JWT 混用）');
  }

  const allowedHosts = (process.env.MCP_ALLOWED_HOSTS || 'www.nhahang101.top,localhost,127.0.0.1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    apiBase: apiBase.replace(/\/$/, ''),
    token,
    mcpApiKey,
    httpPort: Number(process.env.MCP_HTTP_PORT || 3100),
    httpHost: process.env.MCP_HTTP_HOST || '0.0.0.0',
    allowedHosts,
  };
}

export function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..');
}

function loadDotEnvQuiet(path: string): void {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}
