# 饭店餐饮管理系统 · 架构设计与 Cursor 提示词

2026-10-30

## 概述

结论：用一个 pnpm 单仓库，拆成 4 个应用（管理后台、手机 H5、后端服务、门店打印代理），后端用 NestJS + Prisma + MySQL 8 + Redis + Socket.IO，部署在阿里云新加坡或香港区域的一台 ECS 上（Docker Compose）。打印不走浏览器，而是由门店电脑上的"打印代理"接收云端任务，同时发给前台和厨房的网络热敏打印机。

本文覆盖：堂食（服务员点餐 + 桌台二维码多人扫码点餐）、翻台、加菜/退菜/取消、外卖 H5、语音播报、自动打印、菜品上下架/库存/价格、RBAC、中越双语、越南盾、资产全生命周期、营业统计。

## 系统架构

单体后端 + 模块化分层。所有客户端经 Nginx 连到同一个 NestJS 服务；云端不直接连打印机，而是由店内的打印代理主动连上来取任务。

### 技术栈

| 层 | 选型 |
| --- | --- |
| 管理后台（PC） | Vue 3 + Vite + TypeScript + Element Plus + Pinia + vue-i18n + ECharts |
| 手机 H5 | Vue 3 + Vite + TypeScript + Vant 4 + Pinia + vue-i18n |
| 后端 | Node.js 20 + NestJS 10 + Prisma |
| 数据库 | MySQL 8 |
| 缓存/实时 | Redis 7 + Socket.IO |
| 打印 | 网口：print-agent → TCP 9100；小店可选收银电脑浏览器 Web Serial（USB）打印台 |

### 代码仓库结构

```
restaurant-system/
├─ apps/admin, h5, server, print-agent
├─ packages/shared
├─ deploy/
└─ .cursor/rules/
```

## 功能模块划分

auth / rbac / user / store-setting / menu / table / order / delivery / kitchen / print / realtime / asset / report / audit

## 数据模型

核心是三层：**桌台 → 开台会话 → 订单 → 轮次 → 菜品明细**。堂食和外卖共用一张 orders 表，用 `type` 区分。所有表都有 `id`、`created_at`、`updated_at`，业务表留 `store_id`。

**金额规则**：越南盾没有小数，所有金额字段用 `BIGINT` 存整数"盾"，禁止用 FLOAT。下单时把菜名、单价快照写进明细。

| 分组 | 表 | 关键字段 |
| --- | --- | --- |
| 权限 | users | username, password_hash, display_name, phone, lang(zh/vi), status |
| 权限 | roles / permissions | roles: code, name_zh, name_vi, is_system；permissions: code（如 `order:cancel`）, type(menu/button/api), parent_id, path, sort |
| 权限 | user_roles / role_permissions | 多对多关联 |
| 门店 | stores / settings | name_zh, name_vi, address, phone, service_charge_rate, tax_rate, delivery_radius_km, delivery_fee_rules(JSON), qr_order_need_confirm |
| 菜品 | categories | name_zh, name_vi, sort, is_active, kitchen_station_id |
| 菜品 | dishes | category_id, name_zh, name_vi, desc_zh, desc_vi, image, price, takeaway_price, unit, status(on/off), stock(NULL=不限), daily_stock, sold_today, sort, is_dine_in, is_delivery |
| 菜品 | dish_options | dish_id, group_name_zh/vi, option_name_zh/vi, extra_price, required, multi |
| 桌台 | areas / tables | areas: name_zh/vi；tables: area_id, code（A01）, seats, status(idle/dining/cleaning), qr_token, current_session_id |
| 桌台 | table_sessions | table_id, open_at, close_at, guest_count, pin(4位), session_token, waiter_id, status(open/closed) |
| 订单 | orders | order_no, type(dine_in/takeaway/delivery), source(waiter/qr/h5/pos), table_session_id, customer_id, address_snapshot(JSON), status, subtotal, discount, service_charge, delivery_fee, total, paid_amount, payment_status, remark, cancel_reason, created_by |
| 订单 | order_batches | order_id, round_no, source, created_by/guest_nickname, print_status |
| 订单 | order_items | order_id, batch_id, dish_id, name_zh, name_vi, unit_price, qty, options_snapshot(JSON), amount, status(pending/cooking/served/voided), void_reason, guest_nickname |
| 订单 | payments | order_id, method(cash/card/bank_transfer/momo/vnpay), amount, received, change, operator_id |
| 订单 | order_refunds | order_id, amount(正数), method, reason, operator_id；已收款后退款，扣减 paid_amount，payment_status→partial/refunded；事件 ORDER_REFUNDED → 前台退款小票 PrintJobKind.refund |
| 外卖 | customers | email(唯一), password_hash, name, phone, lang, email_verified_at |
| 外卖 | customer_addresses | customer_id, contact_name, phone, address_text, detail, lat, lng, is_default |
| 打印 | printers | name, ip, port(9100), paper_width(58/80), role(front/kitchen), connection_type(network/browser_usb), accept_all_tickets, station_id, agent_id, is_active |
| 打印 | kitchen_stations | name_zh/vi（热菜/凉菜/饮品/烧烤） |
| 打印 | print_jobs | printer_id, order_id, batch_id, kind(order_front/order_kitchen/add/void/receipt/cancel), payload(JSON), status(queued/sent/done/failed), retries, error |
| 打印 | print_agents | name, secret_hash, last_seen_at, status |
| 资产 | asset_categories | name_zh/vi, depreciation_months |
| 资产 | assets | asset_no, category_id, name_zh/vi, spec, unit, location, supplier, purchase_date, unit_price, qty_total, qty_in_use, qty_idle, qty_repair, qty_disposed, warranty_until, photo |
| 资产 | asset_events | asset_id, type(in/assign/transfer/repair/repair_done/scrap/sell/check), qty, amount, from_location, to_location, reason, operator_id, happened_at |
| 采购 | suppliers | name_zh/vi, contact_name, phone, address, note, is_active |
| 采购 | ingredients | name_zh/vi, kind(vegetable/seasoning/other), unit, stock_qty, last_cost, is_active |
| 采购 | dish_recipes | dish_id + ingredient_id 唯一；qty=每份消耗（BOM） |
| 采购 | ingredient_movements | sale_deduct/sale_restore/purchase/stocktake_set；盘点不删售卖流水 |
| 采购 | purchases / purchase_items | business_date, supplier_id, supplier(名称快照), total_amount；明细 ingredient_id, qty, unit_price, amount |
| 采购 | stocktakes / stocktake_items | business_date 唯一；opening/purchased/counted/consumption + 金额 |
| 系统 | login_logs | store_id?, user_id?, username, result(success/fail/logout), fail_reason?, ip, user_agent；索引按时间/用户名/结果 |
| 系统 | audit_logs | store_id?, user_id?, username/display_name 快照, module, action, target_type, target_id, before/after(JSON), ip, user_agent?, request_id? |

**订单状态**：堂食 `open（用餐中）→ paid（已结账）` 或 `cancelled`；外卖 `pending（待接单）→ accepted → cooking → delivering → completed`，任何完成前状态可 `cancelled`/`rejected`。

## RBAC、多语言与越南盾

### RBAC

预置角色：超级管理员、管理员/店长、收银员、服务员、厨房。

权限点示例：`menu:dish:edit`、`table:open`、`order:create`、`order:add-item`、`order:void-item`、`order:cancel`、`order:discount`、`order:checkout`、`order:refund`、`delivery:accept`、`print:reprint`、`asset:scrap`、`asset:sell`、`report:view`、`system:role`、`audit:view`。

### 审计日志

- **登录日志**（`login_logs`）：后台员工登录成功 / 失败（库内区分 `USER_NOT_FOUND` / `BAD_PASSWORD` / `DISABLED`，对外仍统一 `AUTH_INVALID_CREDENTIALS`）/ 登出；写失败不阻断登录。
- **顾客登录日志**（`customer_login_logs`）：H5 注册 / 密码登录 / 验证码登录 / Google / 改密 / 登出；记 email、真实 IP、UA、失败原因；配合 Cloudflare Turnstile（`CF_TURNSTILE_*`）与 Google GIS（`GOOGLE_CLIENT_ID`）。
- **顾客账号**：`password_hash` 可空（纯 Google）；`google_sub` 唯一；同邮箱 Google 登录自动合并。
- **真实 IP**：优先 `CF-Connecting-IP`，其次 `X-Forwarded-For` 最左端；去掉 `::ffff:`；Express `trust proxy`。
- **操作日志**（`audit_logs`）：Service 层显式埋点敏感写操作（订单退菜/取消/改价/折扣/结账/退款、用户与角色、门店设置、菜品/套餐、采购盘点、资产流转、外卖接拒、会员封禁、发券等）；禁止记录明文密码。
- 查询 API：`GET /api/audit/login-logs`、`GET /api/audit/operation-logs`，需 `audit:view`；Admin 菜单「系统 → 审计日志」`/system/audit`。日志只增不改不删。
- HTTP 访问日志带真实 IP；员工/顾客认证写 Nest Logger，便于上线排错。

### 多语言

界面文字用 vue-i18n；业务数据用 `name_zh` + `name_vi`；前端 `useLocaleField(row, 'name')`；错误返回业务错误码。

### 越南盾

存储 BIGINT 整数；显示用 `formatVND(n)`。

## 关键流程

1. 桌台二维码与多人扫码点餐（会话、PIN、共享购物车 Redis、轮次下单、库存事务扣减）
2. 服务员点餐与翻台（idle/dining/cleaning）
3. 加菜、退菜、改单、取消、结账（audit_logs）
4. 语音播报（Socket.IO + speechSynthesis）
5. 前台 + 厨房自动打印（print-agent TCP 9100）

## 外卖 H5、资产管理与营业统计

详见原文分阶段提示词中的完整说明。外卖状态机、资产事件、营业日统计口径以此文档为准。

## 合伙人出资与账目核算

口径：**混合硬挂 + 双口径盈亏**（现金回报为主，权益份额为参考）。

| 表 | 关键字段 |
| --- | --- |
| partners | invested_total（累计出资缓存，越南盾整数） |
| partner_capital_entries | partner_id, entry_date, type(initial/increase/decrease), amount, category(rent/renovation/equipment/furniture/deposit/working_capital/other), ref_type?, ref_id?, note, created_by |

### 核算公式

- 个人累计出资 = Σ(initial+increase) − Σ(decrease)
- 现金回报 `cashRoi` = 累计分红 − 累计出资
- 权益参考：`equityShare = (资产账面 + 原料库存) × sharePercent/10000`；`equityGap = equityShare − invested`
- 门店对账差额 `gap` = 累计出资 − (资产账面 + 原料库存 + 已硬挂的运营费用)；日常采购不强制硬挂

### API

- `GET/POST/PATCH/DELETE /finance/capital-entries`
- `GET /finance/partners/:id/ledger`
- `GET /finance/capital-recon`
- 创建合伙人可带 `initialCapital` 一并写入期初流水

### Migrate

`20261107100000_partner_capital`

## 第二波功能（套餐 + 预定）

### 新增数据表

| 表 | 关键字段 |
| --- | --- |
| combos | storeId, nameZh, nameVi, descZh?, descVi?, image?, price(BigInt), takeawayPrice(BigInt), status(on/off), sort, isDineIn, isDelivery |
| combo_groups | comboId, nameZh, nameVi, minSelect, maxSelect, sort |
| combo_group_items | groupId, dishId, extraPrice(BigInt,默认0), isDefault, sort |
| reservations | storeId, customerName, phone, guestCount, reserveAt, tableId?, areaId?, customerId?, status(pending/confirmed/seated/cancelled/no_show), deposit(BigInt), remark?, createdBy?, seatedSessionId? |
| reservation_items | reservationId, dishId?, nameZh/Vi, qty, unitPrice(BigInt), optionsSnapshot?, remark?（确认后厨房可见；入座转入订单再扣料） |

### order_items 新增字段
- `comboId`（可空 BigInt）：点套餐时填写，与 dishId 互斥；`optionsSnapshot` 存选中各组明细

### 权限点
- `combo:view` / `combo:edit`
- `reservation:view` / `reservation:edit`
- 菜单：`menu:combo`（/combos）、`menu:reservation`（/reservations）

### 预定状态机
`pending` → `confirmed` → `seated`（同时开台）  
任何非 seated/cancelled 状态 → `cancelled` 或 `no_show`

### Migrate 名称
`20261030093601_add_combo_reservation`

## 分阶段落地

阶段 0 规则 → 1 脚手架+数据库 → 2 登录RBAC → 3 菜品 → 4 桌台堂食 → 5 扫码H5 → 6 语音 → 7 打印 → 8 外卖 → 9 资产 → 10 报表 → 11 部署。
