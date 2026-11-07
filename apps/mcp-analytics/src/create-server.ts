import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RestaurantApiClient } from './api-client.js';
import type { McpConfig } from './config.js';
import { registerTools } from './tools.js';

export function createAnalyticsServer(cfg: McpConfig): McpServer {
  const api = new RestaurantApiClient(cfg.apiBase, cfg.token);
  const server = new McpServer({
    name: 'restaurant-analytics',
    version: '0.1.0',
  });
  registerTools(server, api);
  return server;
}
