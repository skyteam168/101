# 101 · 饭店餐饮管理系统

pnpm monorepo：管理后台 / H5 / NestJS 后端 / 打印代理。

> 阶段 1–10 已完成。近期增强：美团配色、工作台首页、桌台卡片、采购进货/盘点/日消耗。

设计文档：[`docs/DESIGN.md`](docs/DESIGN.md)

## 环境要求

- Node.js 20+
- pnpm 10+
- Docker Desktop（本地 MySQL 8 + Redis 7）

## 本地启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动 MySQL + Redis（MySQL 映射宿主机 3307，避免与本机 3306 冲突）
pnpm db:up

# 3. 构建 shared，生成 Prisma Client，执行迁移与 seed
pnpm --filter @restaurant/shared build
pnpm db:generate
pnpm --filter @restaurant/server exec prisma migrate dev --name init
pnpm db:seed

# 4. 并行启动 admin(5173) / h5(5174) / server(3000)
pnpm dev
```

| 服务 | 地址 |
| --- | --- |
| Admin | http://localhost:5173 |
| H5 | http://localhost:5174 |
| 手机扫桌贴 | 在 `apps/server/.env` 设置 `H5_BASE_URL=http://<电脑局域网IP>:5174`，手机与电脑同一 Wi‑Fi；改完需重启 server |
| API | http://localhost:3000/api |
| Swagger | http://localhost:3000/api/docs |
| 公开菜单 | http://localhost:3000/api/public/menu?channel=dine_in |
| 上传静态资源 | http://localhost:3000/uploads/... |
| 门店设置（播报） | http://localhost:5173/system/settings |

**阶段 6 语音播报**：登录后台后点击「开启语音提醒」解锁音频；顶栏可静音。新堂食 / 加菜 / 外卖（未接单每 30 秒重复）/ 呼叫服务员 / 请求结账 / 取消 / 打印失败会 ding + TTS（无对应语音则播 `public/audio` 预录），并弹出右下角通知。播报语言与各类开关在「系统 → 门店设置」。

**阶段 7 打印**：后台「打印」管理档口 / 打印机 / 代理 / 任务；订单事件自动生成前台总单与按档口厨房分单（可开「一菜一切」）。Seed 代理 `id=1` 密钥 `dev-agent-secret`。门店代理：

```bash
# 复制配置后启动（状态页 http://localhost:17890）
cp apps/print-agent/config.example.json apps/print-agent/config.json
pnpm --filter @restaurant/print-agent dev
```

Windows exe 打包与开机自启见 [`apps/print-agent/README.md`](apps/print-agent/README.md)。

**阶段 8 外卖**：顾客端 http://localhost:5174/shop （邮箱验证码注册/登录，未配 SMTP 时接口返回 `devCode` 且服务端打日志）。后台「外卖」看板接单/拒单/出餐/配送/完成；门店设置可配营业时间、起送价、半径、运费阶梯、坐标、收款码。接单后触发打印任务。

**阶段 9 资产**：后台「资产」台账（分类/位置/状态筛选，原值与直线法净值）、详情履历时间线、入库/领用/调拨/送修/修好/报废/变卖/盘点；报废需 `asset:scrap`、变卖需 `asset:sell`。支持 Excel 导入导出与二维码标签 PDF。报表含分类汇总、当月维修费/报废损失/变卖收入、30 天保修到期提醒。Seed 含商用冰箱等演示资产。

**阶段 10 营业统计**：后台「报表」需 `report:view`。营业日按门店「切日小时」+ 时区 `Asia/Ho_Chi_Minh` 计算。概览含营业额/订单数/客单价/人均/翻台率/均用餐时长，以及趋势、渠道与支付占比、时段分布、菜品排行、操作人折扣退菜取消；支持日报/月报、Excel 导出、收银开班交班与打印交班小票。切日时刻定时写入 `daily_summaries` 加速历史查询。

**UI / 采购增强**：全站美团黄主色；侧栏带图标；工作台含今日指标、快捷入口、桌台概况；桌台卡片区分空闲/用餐/清台并显示人数。后台「采购库存」：供应商档案（名称/联系人/电话/地址）、原料档案、按营业日进货（下拉选供应商）、下班盘点（消耗=期初+进货−实存）与日消耗报表。

**会员 / 营销 / 收银台（第一波）**：会员等级、积分/储值、禁登与软删除；H5 可注销账号。营销：优惠券模板发放、自动优惠规则、外卖结算选券。收银台 `/cashier`：选桌、选会员、临时菜、行打折/赠送、抹零/免单、结账。

默认账号：

| 账号 | 密码 | 角色 | 说明 |
| --- | --- | --- | --- |
| `admin` | `Admin@123` | 超级管理员 | 可见角色权限与审计日志菜单（登录/操作日志只读） |
| `cashier` | `Cashier@123` | 收银员 | 看不到角色管理；调 `/api/rbac/roles` 返回 403 |

后台登录页：http://localhost:5173/login

复制环境变量：`apps/server/.env.example` → `apps/server/.env`（仓库已带开发用 `.env`，默认连 `127.0.0.1:3307`）。

上线 H5 防机器人与 Google 登录：在 `.env` 配置 Cloudflare Turnstile `CF_TURNSTILE_SITE_KEY` / `CF_TURNSTILE_SECRET_KEY`，以及 `GOOGLE_CLIENT_ID`（Google Cloud OAuth Web 客户端，授权 JS 来源含 H5 域名）。站点走 Cloudflare 代理可拿到 `CF-Connecting-IP`；未配置 Secret 时本地跳过 Turnstile。顾客注册/密码与验证码登录/Google/改密/登出写入 `customer_login_logs`，员工写入 `login_logs`。

若本机已占用 3306，开发 compose 使用 **3307→3306**。首次迁移需要 `restaurant` 用户具备建库权限（`deploy/mysql/init/01-grants.sql` 会在新卷初始化时自动执行）。

## 常用脚本

```bash
pnpm db:down          # 停止数据库容器
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # 重新灌入种子数据
pnpm test             # 各包测试
pnpm --filter @restaurant/print-agent dev
```

## 目录

```
apps/admin          Vue3 + Element Plus
apps/h5             Vue3 + Vant4
apps/server         NestJS10 + Prisma
apps/print-agent    门店打印代理（脚手架）
packages/shared     枚举 / 事件名 / formatVND / localeField
deploy/             docker-compose.dev.yml
docs/DESIGN.md      架构与数据模型
```
