# Xprinter 58mm USB 打印台 SOP

> 推荐小店收银电脑用 **USB**（比蓝牙稳；网口适合后厨多档口）。本系统 **不装官方 Windows SDK**，走 Chrome/Edge **Web Serial** 写标准 ESC/POS。

## 1. 硬件与驱动前提

1. 机型：芯烨（Xprinter）**58mm** 热敏（如 XP-58 系列），USB 线接收银电脑。
2. Windows「设备管理器」里应出现 **COM 口**（如 `USB-SERIAL CH340 (COMx)` 或厂商虚拟串口）。  
   - 若只显示「USB 打印支持 / USB Printing Support」而 **没有 COM**：需安装芯烨官网的 **USB 虚拟串口驱动**，否则浏览器 Web Serial **选不到**设备。
3. 不要同时用「Windows 默认打印队列」抢占同一 USB；打印台模式是直写串口。
4. 浏览器：**Chrome 或 Edge**（需 `navigator.serial`）。勿用普通 Firefox。管理端须 **HTTPS 或 localhost**。

## 2. 后台配置（管理端 → 打印）

1. **打印机** → 新建（或编辑 seed「收银USB小票机」）：
   - 名称：如 `Xprinter 58 USB`
   - 连接方式：**本机 USB**（`browser_usb`）
   - 纸宽：**58mm**
   - 角色：前台；小店建议打开 **承接全部**（前台+厨房同一台出纸）
   - **启用**
2. 若仍保留网口演示机：测 USB 时先把网口前台机关掉，避免交班单打到多台。
3. 无需填 IP / 代理；云打印 Webhook 与 USB 无关。

## 3. 收银电脑「打印台」

1. 用有打印权限的账号登录管理端（常开标签页）。
2. 顶栏打开 **打印台** → 点 **连接 USB** → 在系统弹窗里选对应 **COM / Xprinter**。
3. 状态点变绿 = 已认领；之后下单/交班小票会经 Socket 推到本页，自动出纸。
4. 波特率：多数 XP-58 为 **9600**（默认）；乱码/无反应可试 **115200**（顶栏打印台旁可选）。
5. 平板/手机只下单；**出纸只在已开打印台的收银电脑**。

## 4. 自动打印链路（无需 SDK）

```
业务事件 → Nest 建 print_jobs(paperWidth=58)
         → BrowserDriver 推送到已 claim 的打印台
         → Admin encodeTicketEscPos → Web Serial 写 USB
         → print.ack → 任务 done
```

## 5. 联调检查清单

- [ ] 设备管理器可见 COM
- [ ] 打印机 `browser_usb` + `58` + 启用
- [ ] 顶栏打印台在线（绿点）
- [ ] 「打印交班单」或下单后任务 `sent`→`done`，纸宽约 58mm、中越文可读
- [ ] 切纸/蜂鸣因机型而异，非必须

## 6. 与网口 / 蓝牙

| 方式 | 本系统 | 说明 |
| --- | --- | --- |
| **USB（推荐收银）** | 打印台 Web Serial | 本文 |
| 网口/Wi‑Fi TCP 9100 | print-agent | 多档口更合适 |
| 蓝牙 | **未做** | 不稳定，暂不支持 |

故障仍无 COM / 选不到口：先装虚拟串口驱动，再重插 USB、刷新页面后「连接 USB」。
