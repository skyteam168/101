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
4. **下一批顺序**：⑦ 打印联调 → ⑧ 预定预点菜 → ⑨ 员工人力成本。
