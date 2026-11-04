# 收银电脑 USB + 打印台汇聚 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留网口 IP + print-agent；本期新增浏览器 USB（Web Serial）打印台：平板只下单，收银电脑后台常开并连接 USB 热敏机统一出纸；小票抬头区分堂食/外卖/后厨。

**Architecture:** `print_jobs` 仍由服务端创建；`connectionType=browser_usb` 的打印机经 Socket 推到已 claim 的打印台员工页；Admin 用 Web Serial 写 ESC/POS 光栅并 `print.ack`。`acceptAllTickets=true` 时一台机承接 front+kitchen。

**Tech decisions:** Chrome/Edge + Web Serial；位图光栅复用 agent 思路；不做蓝牙本期；网口路径零破坏。

---

## File map

- `packages/shared`：events / PrintJobMessage
- `apps/server/prisma`：Printer.connectionType / acceptAllTickets
- `apps/server/.../print*` + `realtime.gateway`：分发 / claim / staff ack
- `apps/admin`：打印台 composable、光栅、PrintView/Layout UI、i18n

---

### Task 1: Schema + shared

- [x] Prisma enum `PrinterConnectionType` + fields；migration
- [x] Events `PRINT_BROWSER_JOB`；`PrintJobMessage.printer` 允许无 ip（browser）
- [x] 更新 DESIGN 打印小节一句

### Task 2: Server dispatch

- [x] `createAndPush` / `dispatchJob` 支持 browser_usb（无 agent）
- [x] `printersFor(role)` 含 `acceptAllTickets`；cancel/receipt/void 去重
- [x] 小票 title 加【堂食】【后厨】【外卖】
- [x] Gateway：`print.station.claim/release`、staff 可 `PRINT_ACK`、`emitToPrintStation`、claim 后 flush 队列
- [x] 单测：browser 分发 / acceptAllTickets

### Task 3: Admin 打印台

- [x] `ticket-escpos.ts` + `web-serial-print.ts` + `usePrintStation.ts`
- [x] PrintView 连接方式 / 承接全部；Layout 打印台开关与状态
- [x] zh-CN / vi-VN 文案
- [x] seed 增加示例 USB 打印机（默认 inactive）

### Task 4: Verify

- [x] shared build + server 相关单测；README 一句说明
