# 安全审计报告（2026-11-05）

范围：生产站 `www.nhahang101.top` + 仓库 `apps/server` / `apps/admin` / `apps/h5` / `packages/shared`。  
方法：代码审计（鉴权、公开面、IDOR、上传、SSRF、注入）+ 生产被动探测（无破坏性爆破）。  
原则：只报告可验证问题；不做 exploit PoC。

## 审计入口（优先级）

1. 鉴权与公开接口（`@Public` / JWT / Guest / Customer / Turnstile）
2. 实时通道（Socket.IO 房间隔离）
3. 业务 IDOR（订单 / 地址 / 桌台会话 / store 作用域）
4. 服务端出站请求（云打印 Webhook、AI apiBase）
5. 上传与静态资源
6. 生产表面（Swagger、安全头、默认口令、密钥入库）

---

## 发现汇总

| 级别 | 数量 | 说明 |
|------|------|------|
| Critical | 1（已修） | 未授权 Socket 可进门店 front/kitchen 窃听业务事件 |
| High | 2（1 已修 / 1 待运维） | 员工可跨店 join；云打印/AI SSRF 面（已加强 URL 校验） |
| Medium | 4 | 同桌改他人购物车、MIME 信任、健康检查暴露、公开接口信息面 |
| Low / Info | 若干 | 见下文 |

---

## Critical / High

### C1. 未登录可加入 `store:{id}:front|kitchen` 并接收订单事件 — **已修复**

- **位置**：`apps/server/src/modules/realtime/realtime.gateway.ts` `onJoin`
- **原逻辑**：无 token 时允许 `store:\d+:(front|kitchen)`（注释写 front，实际含 kitchen）
- **影响**：任意访客可订阅新单、退菜、结账、外卖、聊天等实时事件，泄露经营与顾客侧敏感动态
- **修复**：匿名/顾客/桌台访客仅可加入 `store:{id}:menu`；`emitDishUpdated` 广播到 `menu`；H5 点餐页改为 join `menu`

### H1. 员工 Socket 可加入任意门店房间 — **已修复**

- **位置**：同上 `onJoin`，原 `room.startsWith('store:') && staff` 无 storeId 校验
- **影响**：多店场景下可窃听他店；单店风险较低但仍属越权
- **修复**：仅允许 `store:{auth.storeId}` 及其子房间

### H2. 出站 URL 未拦内网 — **已加固（代码）**

- **位置**：`packages/shared/src/safe-url.ts`；用于云打印 Webhook、门店外链、AI `apiBase`
- **原问题**：`isSafeExternalHttpUrl` 只校验 http(s)，可写 `http://127.0.0.1` / `169.254.169.254`
- **影响**：具备打印/门店配置权限的账号可诱导服务器对内网发请求（SSRF）
- **修复**：拒绝 localhost / RFC1918 / 链路本地 / CGNAT；保存 AI `apiBase` 时强制校验

---

## Medium

### M1. 同桌访客可改他人购物车行

- **位置**：`public-table.service.ts` `patchCartItem` 未校验 `line.guestId === guest.guestId`
- **评估**：共享桌扫码点餐常见产品行为；若需「只能改自己的」，应加归属校验
- **建议**：产品确认后加 owner 校验或权限开关

### M2. 上传类型主要信任客户端 `mimetype`

- **位置**：`upload-image.util.ts`
- **建议**：后续用文件头魔数校验；限制 SVG 已做

### M3. `/api/health` 公开返回 DB 状态

- **现状**：`{ status:'ok', db:'up' }`，便于运维也便于探测
- **建议**：生产改为仅内网或返回最小 `ok`

### M4. 公开菜单/门店信息面较大

- **现状**：`/api/public/menu`、`/api/public/home` 无鉴权属业务需要
- **建议**：保持；注意勿在公开接口回传内部备注、成本价、员工手机等（当前未见成本价）

---

## Low / Info（生产抽检）

| 项 | 结果 |
|----|------|
| Swagger `/api/docs` | 404（已关） |
| `/.env` | 404 |
| 后台 API 无 Token | 401 |
| 安全响应头 | `X-Frame-Options: DENY`、`nosniff`、API CSP `default-src 'none'` |
| 员工/顾客登录无 Turnstile | `TURNSTILE_REQUIRED`（生产强制） |
| 默认口令 `Admin@123` | 被 Turnstile 挡住，未完成口令验证 → **运维仍须确认已改密** |
| Prisma `$queryRaw` | 资产锁表使用参数绑定，未见拼接注入 |
| 顾客订单详情 | `detailForCustomer` 校验 `customerId` |
| 管理端 store 作用域 | 多数 controller 用 `user.storeId` |
| 登录锁定 | Redis 账号/IP 锁定已实现 |
| 部署脚本含服务器口令 | `scripts/deploy_*.py` 已 gitignore；**勿提交、勿进公开仓库** |

---

## 已落地代码改动（本轮）

1. Socket 房间隔离 + `store:{id}:menu` 公开菜品频道  
2. 外链/Webhook/AI Base SSRF 主机黑名单  
3. AI `apiBase` 保存校验  
4. H5 `ShopHomeView` / `TableOrderView` 改 join `menu`

## 建议下一步（未改代码）

1. **运维**：确认生产 admin/cashier 非 seed 默认密码；轮换曾出现在本机脚本中的 SSH/DB 口令  
2. **上传**：魔数校验 + 体积上限统一审计  
3. **健康检查**：收紧暴露面  
4. **同桌购物车**：产品确认是否限制 owner  
5. **定期**：依赖 `pnpm audit`、OSS/CF WAF 规则、备份与密钥轮换

## 验证清单（修复上线后）

- [ ] 未登录 Socket `join store:1:front` → `ok:false`
- [ ] 未登录 `join store:1:menu` → 可收 `dish.updated`
- [ ] 员工 token 无法 `join store:其他店:front`
- [ ] H5 点餐页菜品上下架仍实时刷新
- [ ] 云打印 Webhook 填内网 IP 被拒
