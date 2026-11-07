import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RestaurantApiClient } from './api-client.js';

function ok(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `错误: ${message}` }],
    isError: true as const,
  };
}

/** 注册只读分析工具（禁止任何写操作） */
export function registerTools(server: McpServer, api: RestaurantApiClient): void {
  server.registerTool(
    'get_ops_today',
    {
      title: '今日运营概览',
      description:
        '获取今日运营：分渠道订单数、桌台状态、待接外卖/预定、低库存菜品。对应 Dashboard 工作台。',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await api.get('reports/ops-today'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'get_revenue_overview',
    {
      title: '营业概览',
      description:
        '按营业日或区间获取营收、单量、客流、客单价、渠道/支付结构、小时分布、Top 菜、操作员折扣退菜。金额为越南盾整数。',
      inputSchema: {
        date: z
          .string()
          .optional()
          .describe('单日 YYYY-MM-DD；与 from/to 二选一，默认今日营业日'),
        from: z.string().optional().describe('区间起 YYYY-MM-DD'),
        to: z.string().optional().describe('区间止 YYYY-MM-DD'),
      },
    },
    async ({ date, from, to }) => {
      try {
        return ok(await api.get('reports/overview', { date, from, to }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'get_revenue_trend',
    {
      title: '营收趋势',
      description: '按日返回营收与订单量趋势点。',
      inputSchema: {
        from: z.string().optional().describe('起 YYYY-MM-DD'),
        to: z.string().optional().describe('止 YYYY-MM-DD'),
      },
    },
    async ({ from, to }) => {
      try {
        return ok(await api.get('reports/trend', { from, to }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'get_period_profit',
    {
      title: '期间损益',
      description:
        '月/季/半年/年损益：营收、进货成本、人工、盘点消耗、运营费用、合伙人分红等粗算。',
      inputSchema: {
        period: z
          .enum(['month', 'quarter', 'half', 'year'])
          .describe('期间类型'),
        anchor: z
          .string()
          .describe('锚定：month/quarter/half 用 YYYY-MM；year 可用 YYYY 或 YYYY-MM'),
      },
    },
    async ({ period, anchor }) => {
      try {
        return ok(await api.get('reports/period-profit', { period, anchor }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'get_daily_report',
    {
      title: '日报明细',
      description: '指定区间的日报汇总数据。',
      inputSchema: {
        from: z.string().optional().describe('起 YYYY-MM-DD'),
        to: z.string().optional().describe('止 YYYY-MM-DD'),
        date: z.string().optional().describe('单日 YYYY-MM-DD'),
      },
    },
    async ({ from, to, date }) => {
      try {
        return ok(await api.get('reports/daily', { from, to, date }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'get_table_floor',
    {
      title: '楼面桌台状态',
      description: '实时楼面：各区域桌台状态（空闲/用餐/清台等）。',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await api.get('tables/floor'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'list_ops_expenses',
    {
      title: '运营费用列表',
      description: '只读列出运营费用记录（财务模块）。不含写入。',
      inputSchema: {
        yearMonth: z
          .string()
          .optional()
          .describe('账期 YYYY-MM，例如 2026-11'),
      },
    },
    async ({ yearMonth }) => {
      try {
        return ok(await api.get('finance/expenses', { yearMonth }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'get_capital_recon',
    {
      title: '合伙人资本对账',
      description: '门店资本对账汇总（只读）。勿输出证件号等敏感字段给终端用户时请自行脱敏。',
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await api.get('finance/capital-recon'));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
