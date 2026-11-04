# 试点店上线 Checklist（P0）

面向单店部署。勾完再给商家正式用。

## 1. 环境变量（`apps/server/.env`）

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET`：≥32 位随机串（勿用 `change-me` / `dev-secret`）；启动时会强制校验
- [ ] `CORS_ORIGIN`：写成 Admin/H5 真实域名，禁止 `*`
- [ ] `CF_TURNSTILE_SITE_KEY` / `CF_TURNSTILE_SECRET_KEY`：已在 Cloudflare Turnstile **绑定生产域名**（见下方「域名与 Origin」）
- [ ] `SMTP_HOST`（及账号密码）或后台门店 SMTP 已启用；生产未配邮件时验证码接口会失败且不返回 `devCode`
- [ ] `ENABLE_SWAGGER` 不要设为 `true`（生产默认关闭 `/api/docs`）
- [ ] `H5_BASE_URL`：顾客扫码用的公网/局域网 H5 地址
- [ ] `DEFAULT_STORE_ID`：公开外卖/首页/聊天默认门店（多店必改）；H5 可配 `VITE_STORE_ID` 或 URL `?storeId=`
- [ ] `DATABASE_URL` / `REDIS_URL` 指向生产实例
- [ ] （可选）`GOOGLE_CLIENT_ID`，且 Google 控制台 **Authorized JavaScript origins** 与 H5 Origin 一致
- [ ] （可选云打印）`CLOUD_PRINT_WEBHOOK_SECRET`；管理端打印机选「云打印」并填可公网访问的 Webhook URL

生成示例：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 域名与 Origin（Turnstile / Google）

**Cloudflare Turnstile**

1. Dashboard → Turnstile → Add widget；**Domains** 填 `h5.example.com`、`admin.example.com`（生产域名，勿只填 `localhost`）。
2. Site Key → 服务端 `CF_TURNSTILE_SITE_KEY` 与前端 `VITE_CF_TURNSTILE_SITE_KEY`；Secret → 仅服务端 `CF_TURNSTILE_SECRET_KEY`。
3. 页面必须在已登记域名下打开；跨域 iframe / 错误 Hostname 会导致 widget 不渲染或校验失败。

**Google Identity Services**

1. Google Cloud Console → Credentials → OAuth 2.0 Client ID（Web application）。
2. **Authorized JavaScript origins** 填完整 Origin（协议+主机+端口），与地址栏一致，例如 `https://h5.example.com`、本地 `http://localhost:5174`。不要带 path。
3. Client ID 同时写入服务端 `GOOGLE_CLIENT_ID` 与 H5 `VITE_GOOGLE_CLIENT_ID`。
4. 改 Origin 后等数分钟再生效；`origin_mismatch` / `idpiframe_initialization_failed` 多半是 Origin 未登记或 http/https 不一致。

**CORS**

- `CORS_ORIGIN` 写成 Admin/H5 真实 Origin 列表（逗号分隔），与上表域名一致，禁止生产用 `*`。

## 2. 账号与打印密钥

- [ ] 首次登录后立刻修改 `admin` / `cashier` 默认密码（seed：`Admin@123` / `Cashier@123` 仅开发）
- [ ] seed 使用 `PRINT_AGENT_SEED_SECRET`（≥16，禁止 `dev-agent-secret`），并写入 `apps/print-agent/config.json` 的 `agentSecret`
- [ ] 收银角色已含退菜/取消：`order:void-item`、`order:cancel`（重新 `pnpm db:seed` 或后台角色授权）

## 3. 门店业务配置

- [ ] 门店坐标、配送半径、起送价、营业时间
- [ ] 银行转账收款码（外卖暂无 MoMo/VNPay）
- [ ] 热敏打印已实测其一：
  - **Xprinter 58mm USB（推荐收银）**：管理端打印机选「本机 USB」+ 纸宽 58 + 顶栏「打印台」连 COM；步骤见 [`docs/XPRINTER_USB_SOP.md`](./XPRINTER_USB_SOP.md)
  - 网口/Wi‑Fi：print-agent → TCP 9100
  - 云打印：连接方式「云打印」+ Webhook
- [ ] 菜品图、分类、价格双语检查

## 4. 部署与运维底线

- [ ] HTTPS（Nginx / Cloudflare）
- [ ] `prisma migrate deploy`（勿在生产用 `migrate dev`）
- [ ] MySQL 日备；`uploads/` 持久化卷
- [ ] 进程守护（systemd / pm2）；单实例部署（USB 打印认领与内存事件依赖单机）

## 5. 退款（P1 已落地）

- [ ] 执行迁移含 `order_refunds`（`pnpm --filter server exec prisma migrate deploy`）
- [ ] 店长角色含 `order:refund`（重新 seed 或后台授权）
- [ ] 按 [`docs/REFUND_SOP.md`](./REFUND_SOP.md) 培训：堂食已结账 / 外卖已完成走「退款」；错账改单仍用「反结账」（有退款记录后禁止反结账）

退款小票：退款成功自动入队前台 `refund` 任务；订单详情可重打。可选后续：MoMo/VNPay 原路退。
