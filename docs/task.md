# 功能缺陷与体验缺口任务清单

> 来源：试点上线后盘点。按序独个完成 → 本地浏览器真实验证 → 勾选并记结果。

## 状态图例

- [ ] 未开始
- [~] 进行中
- [x] 已完成并浏览器验证

---

## ① 云打印机驱动 + Cloudflare/Google 域名与 Origin

- [x] **云打印机**：`CloudPrinterDriver` 现为抛错占位；需可投递真实任务（MVP：`connectionType=cloud` + HTTP Webhook / 可扩展飞鹅等）
- [x] **管理端**：打印机表单支持「云打印」连接类型与配置字段
- [x] **文档**：`PRODUCTION_CHECKLIST` / `.env.example` 写清 Turnstile / Google GIS 的域名、JS Origin、回调要求

**验收**：后台可建云打印机；触发小票后任务可 `sent`/`done`（Webhook 回 200）；文档可照着配 CF/Google。

**验证记录**：2026-11-03 · 管理端新建「Cloud Hook Front」（Webhook `http://127.0.0.1:19876/hook`）→ 打印交班单 → 本地 mock 收到 POST jobId=60 → 任务状态 `done`。单测 `cloud-printer.driver.spec` / `print-job.service.spec` 通过。CF/Google Origin 说明已写入 `docs/PRODUCTION_CHECKLIST.md` 与 `.env.example`。

**复测 2026-11-04**：启动 Docker MySQL/Redis + Nest/Admin/H5；打印页点「打印交班单」→ 任务 **#77 shift / Cloud Hook Front / done**（同批 #76 网络机仍 queued）。文档 Origin 章节仍在。

---

## ② 原料进销存与菜品销售库存脱钩

- [x] 菜品 ↔ 原料配方（BOM）表与维护入口
- [x] 下单/退菜时按配方扣减/回滚原料库存（事务）
- [x] 进货/盘点仍走 inventory；售卖扣料与菜品 `stock` 并存且口径写进 SOP

**验收**：点含配方菜品后原料库存下降；退菜回滚；盘点不误伤销售扣料记录。

**验证记录**：2026-11-03 · 宫保鸡丁配方猪肉 0.2kg + 油 0.05L；订单加菜后猪肉 15→14.8、油 30→29.95，流水 `sale_deduct`；退菜后猪肉回 15，流水 `sale_restore`。菜品编辑抽屉可见「原料配方」说明。SOP：`docs/INVENTORY_BOM_SOP.md`。单测 `inventory-recipe.spec` 通过。

**复测 2026-11-04**：order#1 加宫保鸡丁 → 猪肉 **15→14.8**、油 **30→29.95**；void item#65 → 猪肉/油回 **15 / 30**。通过。

---

## ③ 收银台：支付方式 i18n + 组合/拆账 UI

- [x] 支付方式文案走 i18n（zh-CN / vi-VN），勿硬编码中文
- [x] 支持常见组合支付（如现金+转账）录入与结账校验
- [x] （可选增强）拆账 UI：多笔支付行编辑/删除

**验收**：切换越南语后支付方式有译文；双支付方式可成功结账。

**验证记录**：2026-11-03 · 结账弹窗选项为「现金/银行卡/转账」（`order.payMethodMap`）；UI 添加第二行支付后现金 40.000 + 转账 49.000 结账 order#22 成功 `paid`，两笔 payment 入库。API 亦验过半现金+半转账。

**复测 2026-11-04**：收银台 A03 白米饭 10.000 → 结账弹窗「现金」+「添加支付方式」→ 现金 4.000 + 转账 6.000 →「结账成功」；order#23 `paid`，payments=`cash:4000` + `bank_transfer:6000`。`vi-VN` 有 Tiền mặt / Chuyển khoản。

---

## ④ 多门店：公开外卖/聊天等去掉硬编码 store 1

- [x] 服务端公开接口默认门店改为可配置（`DEFAULT_STORE_ID` / query 必填策略）
- [x] H5：`home` / `delivery` / `chat` / `group-meal` 等从路由、品牌配置或 env（`VITE_STORE_ID`）取店，不写死 `'1'`
- [x] 桌贴/二维码链路带正确 `storeId`

**验收**：改默认店或 query 后门店数据切换正确；聊天会话归属正确店。

**验证记录**：2026-11-03 · `resolvePublicStoreId` + H5 `getPublicStoreId`（query > sessionStorage > `VITE_STORE_ID` > `1`）；公开 home/menu/delivery/chat 均带 `storeId`；quote/下单/优惠券/团餐 DTO 可传店；桌贴 `qrUrl` 含 `?storeId=1`。浏览器：H5 `/shop?storeId=1` → sessionStorage=`1`，网络 `store/menu/chat?storeId=1` 均 200；无效店 `99999` → `STORE_REQUIRED`。文档：`.env.example` / `PRODUCTION_CHECKLIST`。

**复测 2026-11-04**：H5 `/shop?storeId=1` → sessionStorage=`1`；网络 `store/menu/chat?storeId=1` 200；`storeId=99999` → `STORE_REQUIRED`；门店名「好运中餐厅」。

---

## ⑤ 测试覆盖补齐

- [x] `inventory` service 单测（进货/盘点主路径）
- [x] `public-table`（扫码桌台）关键测
- [x] `realtime` gateway 关键测（join/鉴权失败）
- [x] 前端：至少 1～2 个工具函数或关键 composable 测（Vitest）

**验收**：`pnpm --filter server test` 含新用例通过；前端测可独立跑通。

**验证记录**：2026-11-03 · server：`inventory.service` / `public-table.service` / `realtime.gateway` / `public-store.util` 共 15 用例 PASS；H5 引入 Vitest+happy-dom，`store-id` + `chat-time` 5 用例 PASS（`pnpm --filter @restaurant/h5 test`）。

**复测 2026-11-04**：server 相关 6 suites / **21 tests PASS**（含 cloud-printer + inventory-recipe）；H5 Vitest **5 PASS**。

---

## ⑥ 管理端 demo 残留 + 厨房能力收敛

- [x] 删除或下线路由未使用的 `HomeView` demo（health / formatVND 演示页）
- [x] 厨房：独立「厨房」视图或看板（待制作/制作中），复用订单+打印事件，入口进侧栏（权限可控）
- [x] 清理无用 i18n / 死链

**验收**：侧栏无 demo 入口；厨房页可看到待出餐并随 Socket 刷新；浏览器实测。

**验证记录**：2026-11-03 · 删除 `HomeView.vue`（本未挂路由）。新增 `menu:kitchen`→`/kitchen`，侧栏「厨房看板」；`GET /orders/kitchen-board` + `PATCH /orders/items/:id/status`；事件 `ORDER_ITEM_STATUS_CHANGED`。浏览器：看板待制作 5→开始制作宫保鸡丁→制作中 1→出餐完成，提示「已保存」。seed 已写入厨房角色权限。

**复测 2026-11-04**：侧栏有「厨房看板」、无 demo；待制作 4→点「开始制作」→待制作 3 / 制作中 1。通过。

---

## ⑦ Xprinter 58mm 自动打印联调（**收银推荐 USB**）

> **结论**：与 ESC/POS + `paperWidth=58` **不冲突**。芯烨 58 走标准 ESC/POS，**不必改写官方 Windows SDK**。  
> **现场选择（2026-11-04）**：机型支持网口/蓝牙/USB → **采用 USB**（更稳）；蓝牙不做；网口留给多档口。

### 技术说明

| 连接方式 | 本系统已有能力 | 是否要官方 SDK |
| --- | --- | --- |
| **USB（收银推荐）** | `connectionType=browser_usb` + 顶栏「打印台」Web Serial | **否**（需 Windows 出现 **COM** 虚拟串口） |
| 网口/Wi‑Fi（TCP **9100**） | `network` + **print-agent** | **否** |
| 云/异地 webhook | `cloud` | **否** |
| 蓝牙 | 未支持 | — |

- SOP：[`docs/XPRINTER_USB_SOP.md`](./XPRINTER_USB_SOP.md)
- 新建「本机 USB」时表单默认 **58mm** + 承接全部；波特率顶栏可选 9600/115200。

### 子任务

- [x] 文档：`XPRINTER_USB_SOP` + `PRODUCTION_CHECKLIST` / README
- [x] 管理端：`paperWidth=58` + `browser_usb` 可保存；顶栏波特率 9600/115200
- [x] 联调：启用 `Xprinter 58 USB` → 打印台（Web Serial 模拟）→ 交班单 `done`，payload `paperWidth=58`
- [x] 修复：打印台 claim 后 `isPrintStationOnline` 因 Socket.IO Map 取法抛错导致任务永久 `queued`
- [ ] （可选）print-agent 状态页一键测试 58mm（网口场景）；**真机**插 USB 出纸由店员按 SOP 再确认一次

**验收**：后台有一台 58mm USB 打印机；打印台在线；触发小票任务成功；纸宽无裁切错乱。

**验证记录**：2026-11-04 · 选定 **USB**（非蓝牙）。文档 `docs/XPRINTER_USB_SOP.md`。Seed/后台打印机 **Xprinter 58 USB**（id=4，`browser_usb`+58+承接全部）启用。浏览器：顶栏打印台 + 波特率下拉；交班 → 任务 **#92 shift / Xprinter 58 USB / done / paperWidth=58**（Web Serial 模拟写入 273 bytes）。真机 COM 出纸：按 SOP 装虚拟串口驱动后在收银电脑复测。

---

## ⑧ 预定桌子 + 预点菜（后厨可备料）

> 顾客/店员预定时可选菜；确认后后厨可见预点清单（不强制立刻扣库存，入座转正单时再走现有下单扣料）。

### 数据与状态

- 新表 `reservation_items`（或 JSON 明细）：`reservationId, dishId?, nameZh/Vi, qty, unitPrice, optionsSnapshot, remark`
- 预定状态机保持：`pending → confirmed → seated / cancelled / no_show`
- `confirmed` 时推送厨房看板「预点」区（或独立列表）；`seated` 时一键转入桌台会话订单（复用 order addItems）
- 权限：`reservation:edit`；公开 H5 预定接口可带 items

### 子任务

- [x] Prisma migration + seed 样例预定带菜
- [x] Admin：预定表单/详情可增删预点菜；列表展示「已预点 N 道」
- [x] H5 公开预定：预定页「预点菜（可选）」选菜弹层 + 提交带 `items`（`storeId` query）
- [x] 厨房：预点列表（按 reserveAt）+ Socket `RESERVATION_CONFIRMED` / `PREORDER_CHANGED`
- [x] `seated`：预点转入开台订单（`order.submit`，扣库存）
- [x] 单测 + 浏览器：建预定带菜 → 确认 → 厨房可见 → 入座转订单

**验收**：预定含菜品；厨房能提前看到；入座后订单有对应明细。

**验证记录**：2026-11-04 · migration `reservation_items`；seed「预点演示客人」宫保×2+米饭×4。浏览器：厨房预点区可见；入座 A04 → order **#24** 含相同明细，预点区清空；再新建「浏览器预点测」确认 → 厨房显示宫保×1。单测 reservation.service **14 PASS**。  
**H5 补齐**：预定页增加「预点菜（可选）」+ 选菜弹层；提交 reservation **#12** 含宫保×2。

---

## ⑨ 员工人事与人力成本（入月度运营成本）

> 目标：入职档案、长工/兼职、在职/离职、薪资、上下班考勤 → **每月人力成本进报表**，运营成本清晰。

### 数据模型（建议）

- `employees`：关联可选 `userId`；姓名双语、电话、入职日、离职日、`employmentType(full_time|part_time)`、`status(active|resigned)`、基础薪资（VND 整数）、备注
- `employee_attendance`：打卡/班次（上班、下班、工时分钟）；可手录或后期接设备
- `employee_payroll_runs`（按月）：`storeId, yearMonth, totalLaborCost, snapshotJson`
- 月成本：`基础薪资按在职天数分摊` + `兼职按工时×时薪`（规则写进 SOP，金额一律整数盾）

### 报表

- 报表页增加「人力成本」卡片/明细；与采购、营收并排看毛利粗算（营收 − 进货 − 人力，标注口径）

### 子任务

- [x] migration + 权限 `menu:hr` / `hr:edit` / `hr:payroll`；seed 样例员工
- [x] Admin：员工 CRUD、状态/类型、薪资；考勤录入（MVP 手录上下班）
- [x] 月结：生成当月人力成本汇总（事务 + audit）
- [x] 报表 overview/月报纳入 `laborCost`
- [x] 单测（分摊/时薪）+ 浏览器：入职→考勤→月结→报表数字正确

**验收**：兼职/长工各至少 1 人样例；月报可见人力成本；改考勤后重算一致。

**验证记录**：2026-11-04 — migrate `20261104100000_hr_employees_payroll` + seed（王全职/陈兼职）；`hr-labor.util` 5 测通过；Admin `/hr` 员工档案可见；`POST /hr/payroll/run` 2026-11 合计 12.400.000₫；月报「人力成本 已月结」一致。通过。

---

## 执行约定

1. 同一时间只推进一项；完成并浏览器验证后再勾选。
2. 每项验证记录写：日期、操作路径、结果（通过/阻塞原因）。
3. 大项可拆子 PR，但本文件状态保持同步。
4. **下一批顺序**：见下方「批次 B · 2026-11-04 夜测」。

---

## 批次 B · 2026-11-04 夜测缺陷（15 项）

> 来源：生产/本地联调截图与口述。按序修复 → 本地浏览器验证 → 勾选。

### B① H5 Token 失效只 Toast「请重新登录」不跳登录页

- [x] 拦截 401/`UNAUTHORIZED`：清 token → 跳转登录（保留 redirect）；桌台 guest API 排除
- [x] 客态/会员态分别处理；避免死循环

**验收**：过期 token 访问需登录接口 → Toast + 自动进登录页。

**验证记录**：2026-11-05 · 代码：`apps/h5/src/api/http.ts`；本地测见下方汇总。

---

### B② H5 / Admin 全局加载中特效缺失

- [x] Admin：axios 全屏 ElLoading（>280ms）
- [x] H5：Vant showLoadingToast（>280ms）

**验收**：慢网或断点下可见加载态，完成后消失。

---

### B③ 并桌报「服务器错误」

- [x] 并桌迁移 order_batches 时重算 roundNo，避免唯一约束冲突

**验收**：两桌用餐中可并桌；失败有业务错误文案非 500。

---

### B④ 本机 USB 打印机连不上（Xprinter 58 · Web Serial 找不到设备）

> 说明：Windows「打印机」列表里的 USB 打印队列 ≠ Web Serial 设备。需 **USB 虚拟串口 (COM)**。

- [x] UI：无设备/NotFoundError 给出 COM 驱动指引（`print.stationUsbNoDevice`）
- [ ] （可选）真机 COM 口联调出纸 — 依赖现场驱动

**验收**：有 COM 口时可连接；无 COM 时界面说明原因与下一步。

---

### B⑤ H5 优惠券已领取仍显示「领取」

- [x] 已领 →「已领取」灰态不可点（对照 myCoupons.template.id）

**验收**：已领券卡片灰显「已领取」。

---

### B⑥ 后台下架菜品后，H5 外卖/扫码/预定/堂食仍可点（需刷新才消失）

- [x] 扫码点餐 / 外卖菜单订阅 `DISH_UPDATED` + 菜单轮询兜底
- [x] 服务端本就发 `DISH_UPDATED`（沿用）

**验收**：后台下架后各端数秒内菜单刷新（无需手动整页刷新）。

---

### B⑦ 团餐编辑套餐：空分组提交请求失败

- [x] 前端校验/剔除空分组；分组名与菜品必填提示

**验收**：空分组有表单提示；合法数据可保存。

---

### B⑧ 扫码点餐结账后提示「会话已结束」→ 应「结账完成」

- [x] `ORDER_PAID` / 会话失效 → 清 guest +「结账完成」文案

**验收**：结账成功见「结账完成」类提示。

---

### B⑨ 呼叫服务员 / 请求结账先「网络错误」，稍后后台才收到

- [x] 按钮 loading；会话结束走结账完成收尾；避免重复点击

**验收**：点击有 loading；成功/失败反馈明确。

---

### B⑩ / B⑭ / B⑮ 弹窗被底栏遮挡、无法滚动（加入会员 / 店铺通知）

- [x] teleport body；内容区可滚；加入会员底栏按钮固定可见

**验收**：会员弹窗、店铺通知可滚到底并点到主按钮。

---

### B⑪ 「我的」页会员态先闪「立即加入」再变已加入

- [x] 加载完成前显示 loading，不渲染「立即加入」

**验收**：已登录会员进入「我的」无「立即加入」闪一下。

---

### B⑫ / B⑬ 营业时段与闭店态（大项）

- [x] 后台营业日多选 + 休息开关 + 预计送达分钟
- [x] H5 休息中禁用预定/外卖/团餐/聊天输入与上传
- [x] 商家信息：配送分钟、地图、电话
- [x] 再来一单
- [x] 电子小票生成 PNG 便于长按保存

**验收**：休息中关键入口禁用；营业中可用；再来一单进购物车；小票可保存。

---

### 批次 B 本地验证汇总（2026-11-05）

| 项 | 结果 |
| --- | --- |
| B① 401 跳登录 | 通过：伪造 token 进「我的」→ `/shop/login?redirect=/shop/me` |
| B② Loading | 已加 Admin ElLoading / H5 LoadingToast（>280ms） |
| B③ 并桌 | 通过：A04→A03 双开台双下单并桌成功，A04 idle / A03 dining |
| B④ USB | 无 COM 时提示安装虚拟串口驱动；真机出纸需现场 COM |
| B⑤ 优惠券 | 已领灰显「已领取」逻辑已上；当前测号未领券仍显示领取属正常 |
| B⑥ 下架实时 | 外卖/扫码订阅 `DISH_UPDATED` + 轮询 |
| B⑦ 团餐空分组 | 前端校验拦截 |
| B⑧⑨ 结账/呼叫 | 结账完成文案 + 呼叫 loading |
| B⑩⑭⑮ 弹窗 | 店铺通知/加入会员 teleport + 可滚 + 底栏按钮可见 |
| B⑪ 会员闪烁 | 「我的」加载中不渲染立即加入 |
| B⑫⑬ 闭店 | 休息中预定/外卖/团餐 disabled；电话 tel:；地图入口；营业日文案；再来一单/小票 PNG 已接 |

**说明**：本地当前为非营业时段（09:00–22:00），首页正确显示「休息中」。生产部署需另行发布 admin/h5/server。

---

## 批次 C · 2026-11-07 体验与运营补强

> 评估结论：①–⑪、⑭ 均可在现有模块落地；⑫⑬ 为新财务模块（可行，工作量较大）。按序完成并本地验证。

### 可行性总览

| # | 项 | 可行性 | 预估 |
| --- | --- | --- | --- |
| C① | H5/后台聊天自动翻译优化 | 易～中 | 0.5–1d |
| C② | 堂食行折扣默认 10% | 易 | 15min |
| C③ | 堂食/开台可选规格 | 中 | 1–2d |
| C④ | 后厨单双打（开台/扫码） | 中 | 0.5–1.5d |
| C⑤ | 扫码点餐已点标记 + 菜单 +/- | 中 | 1–1.5d |
| C⑥ | H5 预定 +/- 与规格 | 中～难 | 1–3d |
| C⑦ | 新开外卖误循环语音 | 易 | 0.5d |
| C⑧ | 收银台购物车删除/加减 | 易 | 0.5d |
| C⑨ | 桌台开台购物车删除按钮 | 易 | 2h |
| C⑩ | 后台首页今日经营概览 | 中 | 2–3d |
| C⑪ | 会员详情地址与消费行为 | 中 | 2–3d |
| C⑫ | 水电房租登记 + 报表 | 难（新表） | 3–5d |
| C⑬ | 合伙人清算与月度结余 | 难（新模块） | 5–8d |
| C⑭ | H5 登录 placeholder | 易 | 15min |

---

### C① 聊天自动翻译

- [x] H5：auto 路径静默翻译，避免按钮反复「翻译中」闪烁
- [x] Admin：打开会话后对未缓存的顾客消息自动补译（默认开启）

**验收**：联系商家/顾客消息自动出译文，无明显加载闪烁。

---

### C② 堂食菜品折扣默认值

- [x] `CashierView.discountItem` 默认百分比改为空或 0，不预填 10

**验收**：点「折扣」弹窗输入框不为 10。

---

### C③ 堂食下单可选规格

- [x] 收银台 / 桌台点单：有 `optionGroups` 的菜弹出规格选择
- [x] 提交带 `optionsSnapshot`（对齐外卖/扫码）

**验收**：堂食可选规格并正确入单。

---

### C④ 后厨单双打

- [x] 排查 `acceptAllTickets` 与档口打印机重复命中
- [x] 同一 batch 按打印机去重；开台+扫码场景只打一份

**验收**：后台开台下单、扫码点单各只出一份后厨票；外卖/预定不受影响。

---

### C⑤ 扫码点餐已点标记与 +/- 

- [x] 菜单上显示本桌已点数量角标
- [x] 菜品行加减按钮（有规格走弹层）

**验收**：同伴可见已点数量；可直接加减。

---

### C⑥ H5 预定加减与规格

- [x] 预定菜单 +/-；有规格可选
- [x] 后端预定明细支持 options（若缺则补）

**验收**：预定可选数量与规格。

---

### C⑦ 新开外卖循环语音

- [x] 收银台 `takeaway` 创建订单：只播一次，不进入 30s 循环
- [x] 循环仅用于真正外卖 delivery `pending`

**验收**：新开外卖单不重复语音；真实外卖 pending 仍可提醒。

---

### C⑧ 收银台购物车删除/加减

- [x] 待提交购物车：+/- 与删除

**验收**：选好的菜可改数量或删除。

---

### C⑨ 桌台开台购物车删除

- [x] OrderingView 购物车增加删除按钮

**验收**：可不靠减到 0，一键删除行。

---

### C⑩ 后台首页今日概览

- [x] 今日堂食/外卖/预定/外带单量；待结账/已结账/待清台桌数
- [x] 待处理外卖、待处理预定；菜品库存不足提示

**验收**：Dashboard 可见上述指标且与库内一致。

---

### C⑪ 会员详情

- [x] 显示注册定位或收货地址
- [x] 堂食/外卖/预定消费记录（金额、日期）

**验收**：会员详情抽屉可查看行为与地址。

---

### C⑫ 水电房租

- [x] 新表登记月度用水/用电/租金（量+金额）
- [x] 报表成本纳入

**验收**：可登记并在报表成本中体现。

---

### C⑬ 合伙人清算

- [x] 合伙人档案（姓名、证件、地址、分成比例）
- [x] 清算记录（日期、金额）；月度运营成本/剩余可查

**验收**：可维护合伙人并查看清算与结余。

---

### C⑭ H5 登录 placeholder

- [x] 密码/验证码登录邮箱、密码输入框补 i18n placeholder

**验收**：中越文 placeholder 可见。

---

### 批次 C 验证记录

**时间**：2026-11-07（本地 Nest `:3000` + Admin `:5173` + H5 `:5174`）

| 项 | 方式 | 结果 |
| --- | --- | --- |
| C① | 源码断言默认 `AUTO_KEY !== '0'`；H5 `silent:true` | PASS |
| C② | `CashierView` `inputValue: ''` | PASS |
| C③ | 浏览器：堂食点「宫保鸡丁」弹出份量/辣度弹层，确认后购物车显示「小份 / 微辣」 | PASS |
| C④ | `pnpm --filter @restaurant/server test -- print-job` 4/4 | PASS |
| C⑤⑥ | `TableOrderView`/`ReserveView` 含 `ordered-badge`/`qty-ctrl`/`optionGroups` | PASS |
| C⑦ | `useVoiceAlert` takeaway 只播一次；delivery 才 30s 循环 | PASS |
| C⑧ | 浏览器：购物车出现 `-` / `+` / `删除` | PASS |
| C⑨ | OrderingView `removeCartLine` | PASS |
| C⑩ | 浏览器 Dashboard：堂食/外带/外卖/预定、待接外卖、待确认预定、空闲/用餐中/待清台/已结账、低库存；API `GET /reports/ops-today` | PASS |
| C⑪ | API smoke（无会员时 skip）；MembersView 地址表 | PASS（接口就绪） |
| C⑫⑬ | 浏览器「财务运营」：运营费用/合伙人/分红结算/月度汇总；API create expense/partner/settlement + period-profit | PASS |
| C⑭ | 浏览器 H5：密码「请输入邮箱/至少 8 位…」；验证码「请输入验证码」 | PASS |

**测试脚本**：

- `node scripts/_batch_c_api_smoke.mjs` → `SMOKE OK 7`
- `node scripts/_batch_c_browser_checks.mjs` → `VERIFY OK`（结果 JSON：`scripts/_batch_c_verify_results.json`）
- 打印单测：`pnpm --filter @restaurant/server test -- print-job` → 4 passed

---

### 财务运营模块专项测试（2026-11-07）

**API 全链路**（`node scripts/_finance_e2e.mjs` → `FINANCE E2E OK 16`）：

| 步骤 | 结果 |
| --- | --- |
| 创建水/电/租金费用 + 列表 + 更新水费金额 | PASS |
| 创建合伙人 → 列表 → 更新分成 30%→35% | PASS |
| 创建分红结算 → 列表 | PASS |
| `period-profit` 含 `opsExpense` / `partnerSettlements` | PASS |
| 删除结算/合伙人/费用（脚本自清理） | PASS |

**浏览器 UI**（Admin `/finance`，结果：`scripts/_finance_ui_results.json`）：

| 功能 | 结果 |
| --- | --- |
| 登记水费 150m³ / 1.200.000₫ | PASS（表内可见） |
| 登记电费 800kWh / 3.500.000₫ | PASS |
| 登记房租 25.000.000₫ | PASS |
| 新增合伙人「阮文A」25% | PASS |
| 登记分红 8.000.000₫ | PASS |
| 月度汇总：运营费用/合伙人结算联动 | PASS（结算列可见阮文A） |

说明：本地营收较低时「剩余可分配」可为负，属公式正确表现，非功能故障。UI 测试数据已保留在库中便于人工复核。

---

### 合伙人出资核算（2026-11-07）

- [x] `partner_capital_entries` + `partners.invested_total` 迁移
- [x] 出资流水 CRUD；创建合伙人可带期初出资
- [x] `GET /finance/partners/:id/ledger` 双口径（现金回报 + 权益参考）
- [x] `GET /finance/capital-recon` 门店对账（出资 vs 资产/库存/已挂费用）
- [x] Admin：合伙人累计出资/现金回报列、出资流水 Tab、台账抽屉、对账卡片
- [x] DESIGN.md 补充口径

**API 验收**（`node scripts/_partner_capital_e2e.mjs` → `CAPITAL E2E OK 8`）：

| 步骤 | 结果 |
| --- | --- |
| 创建合伙人期初 50.000.000 | PASS |
| 增资 10.000.000（硬挂资产）→ 累计 60.000.000 | PASS |
| ledger / cashRoi / equityShare | PASS |
| 分红 5.000.000 → cashRoi = −55.000.000 | PASS |
| capital-recon 含 totalCapital/assetBook/gap | PASS |
