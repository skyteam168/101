/** 不经 MCP 协议，直接测 API 客户端与鉴权 */
import { RestaurantApiClient } from './api-client.js';
import { loadConfig } from './config.js';

async function main() {
  const cfg = loadConfig();
  const api = new RestaurantApiClient(cfg.apiBase, cfg.token);
  console.log('apiBase=', cfg.apiBase);

  const ops = await api.get<Record<string, unknown>>('reports/ops-today');
  console.log('ops-today businessDate=', ops.businessDate);
  console.log('orderCounts=', JSON.stringify(ops.orderCounts));

  const overview = await api.get<Record<string, unknown>>('reports/overview');
  console.log('overview revenue=', overview.revenue, 'orders=', overview.orderCount);

  console.log('SMOKE_OK');
}

main().catch((e) => {
  console.error('SMOKE_FAIL', e instanceof Error ? e.message : e);
  process.exit(1);
});
