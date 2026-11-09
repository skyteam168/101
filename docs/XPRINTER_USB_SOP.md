# Xprinter 58mm USB 静默打印 SOP

> 推荐小店收银电脑用 **USB + print-agent Windows RAW**（静默、不依赖虚拟 COM）。旧版浏览器 Web Serial 仅作兜底。

## 1. 硬件与驱动

1. 机型：芯烨（Xprinter）**58mm** 热敏，USB 接收银电脑。
2. Windows「打印机与扫描仪」中应出现队列（如 `XP-58`）。可用系统自带或厂商驱动；**不必**再装虚拟串口 / COM。
3. 勿与「浏览器打印台 / Web Serial」同时抢同一台机。

## 2. 后台配置（管理端 → 打印）

1. 确保有打印代理（seed 默认 `id=1`，密钥本地 `dev-agent-secret`）。
2. **打印机** → 新建/编辑：
   - 连接方式：**USB 静默（代理）**（`agent_usb`）
   - **Windows 打印机名**：与系统队列完全一致（如 `XP-58`）
   - 纸宽：**58mm**；角色：前台；建议打开 **承接全部**
   - 绑定上述代理；**启用**
3. 测 USB 时先停用网口演示机，避免交班单打到多台。

## 3. 收银电脑运行 print-agent

```bash
cp apps/print-agent/config.example.json apps/print-agent/config.json
# serverUrl / agentId / agentSecret 与后台一致
pnpm --filter @restaurant/print-agent dev
```

状态页：http://localhost:17890 → 选「本机 USB」→ 填队列名 → 测试打印。

开机自启 / exe 打包见 `apps/print-agent/README.md`。

## 4. 自动打印链路

```
业务事件 → Nest 建 print_jobs(connectionType=agent_usb)
         → AgentDriver Socket 推送
         → print-agent 渲染 ESC/POS
         → Windows WritePrinter(RAW) → USB 出纸
         → print.ack → 任务 done
```

无需开 Admin 顶栏「打印台」，无需选 COM。

## 5. 联调检查清单

- [ ] Windows 打印机列表可见目标队列名（须与后台填写**完全一致**，含「副本 1」等后缀）
- [ ] 打印机 `agent_usb` + 队列名 + 代理 + 启用
- [ ] print-agent 状态页 Socket 已连接
- [ ] 状态页或后台「打印交班单」后任务 `sent`→`done`，纸上中越文可读
- [ ] 若队列状态为 `Error / PendingDeletion`：清打印队列或删重建打印机后再测；可用 `apps/print-agent/scripts/reset-printer.ps1`

## 6. 与其他方式对比

| 方式 | 本系统 | 说明 |
| --- | --- | --- |
| **USB 静默（推荐）** | print-agent + Windows RAW | 本文 |
| 网口/Wi‑Fi TCP 9100 | print-agent | 多档口厨房 |
| 浏览器 Web Serial | 顶栏打印台 | 需虚拟 COM，不稳定，仅兜底 |
| 蓝牙 | **未做** | — |

## 7. 旧版浏览器打印台（不推荐）

连接方式「本机 USB（浏览器）」仍可用：需 COM 虚拟串口 + Chrome/Edge 顶栏连接。故障时优先改回 **USB 静默（代理）**。
