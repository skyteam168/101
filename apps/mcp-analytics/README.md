# @restaurant/mcp-analytics

只读经营分析 MCP。支持：

1. **本机 stdio**（Cursor 本地进程）
2. **线上 Streamable HTTP**（「在线服务 HTTP」填公网地址）

## 线上接入（推荐）

服务部署后：

| 项 | 值 |
|----|-----|
| 类型 | **在线服务 (HTTP)** |
| 服务地址 | `https://www.nhahang101.top/mcp` |
| 请求头 | `Authorization: Bearer <MCP_API_KEY>` |
| 登录方式 | **不用登录**（密钥放请求头）或「填写密钥」 |

健康检查：`https://www.nhahang101.top/mcp-health`

### 部署

```bash
pnpm --filter @restaurant/mcp-analytics build
python scripts/deploy_mcp.py
```

脚本会：拉代码、上传 dist、生成/保留 `MCP_API_KEY`、PM2 启动 `restaurant-mcp`、写入 nginx `/mcp`。

本机直接跑 HTTP：

```bash
pnpm --filter @restaurant/mcp-analytics mint-token
pnpm --filter @restaurant/mcp-analytics dev:http
# → http://127.0.0.1:3100/mcp
```

## 本机 stdio（仅开发机）

```json
{
  "mcpServers": {
    "restaurant-analytics": {
      "command": "pnpm",
      "args": [
        "--dir",
        "G:/gitee/restanrant/apps/mcp-analytics",
        "exec",
        "tsx",
        "src/index.ts"
      ]
    }
  }
}
```

## 工具（只读）

`get_ops_today` · `get_revenue_overview` · `get_revenue_trend` · `get_period_profit` · `get_daily_report` · `get_table_floor` · `list_ops_expenses` · `get_capital_recon`

金额为越南盾整数。不含结账/退款/财务写入。
