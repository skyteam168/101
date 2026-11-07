#!/usr/bin/env node
/**
 * 餐饮管理系统 — 本机 stdio MCP
 * 线上请用: node dist/http.js（Streamable HTTP）
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createAnalyticsServer } from './create-server.js';

async function main() {
  const cfg = loadConfig();
  const server = createAnalyticsServer(cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[restaurant-mcp] stdio ready apiBase=${cfg.apiBase} (online use: dist/http.js)`,
  );
}

main().catch((err) => {
  console.error('[restaurant-mcp] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
