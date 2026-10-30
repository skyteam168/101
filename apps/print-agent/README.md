# 门店打印代理 (print-agent)

餐饮管理系统的本地打印代理程序。运行于门店电脑，通过 Socket.IO 连接云端服务器，接收打印任务后通过 TCP 9100 端口发送 ESC/POS 指令到网络热敏打印机。

---

## 目录结构

```
apps/print-agent/
├── src/
│   ├── index.ts         # 主入口：启动流程编排
│   ├── config.ts        # 读取 config.json
│   ├── socket.ts        # Socket.IO 客户端（自动重连）
│   ├── render.ts        # @napi-rs/canvas 渲染各模板为位图
│   ├── escpos.ts        # ESC/POS 二进制指令（GS v 0 光栅 + 切纸 + 蜂鸣）
│   ├── tcp-print.ts     # TCP socket 发送到打印机 IP:9100
│   └── status-server.ts # 本地 HTTP 状态页（默认 http://127.0.0.1:17890）
├── assets/
│   └── fonts/           # 放置 NotoSansSC-Regular.otf 等字体（见 README）
├── config.example.json  # 配置模板
└── README.md
```

---

## 快速开始

### 1. 安装依赖

```bash
# 在 monorepo 根目录执行
pnpm install
```

### 2. 准备字体

将 `NotoSansSC-Regular.otf` 放入 `assets/fonts/`（见 [assets/fonts/README.md](assets/fonts/README.md)）。

Windows 部署时，若系统已安装微软雅黑（`msyh.ttc`），可跳过此步骤。

### 3. 创建配置

```bash
cp config.example.json config.json
```

编辑 `config.json`：

```json
{
  "serverUrl": "http://your-server:3000",
  "agentId": "agent-store-01",
  "agentSecret": "your-secret-here",
  "localStatusPort": 17890
}
```

| 字段 | 说明 |
|------|------|
| `serverUrl` | 云端 NestJS 服务器地址 |
| `agentId` | 本代理的唯一标识（对应 `print_agents.id`） |
| `agentSecret` | 鉴权密钥（与数据库 `secret_hash` 对应） |
| `localStatusPort` | 本地状态页端口，默认 17890 |

### 4. 开发模式运行

```bash
pnpm --filter @restaurant/print-agent dev
```

### 5. 查看状态页

打开浏览器访问 [http://127.0.0.1:17890](http://127.0.0.1:17890)，可查看：
- Socket.IO 连接状态
- 最近 20 条打印记录
- 测试打印（输入打印机 IP 直接发送测试单）

---

## 打包为 Windows 可执行文件 (.exe)

使用 [pkg](https://github.com/vercel/pkg) 将 Node.js 应用打包为独立 `.exe`，无需目标机器安装 Node.js。

```bash
# 先编译 TypeScript
pnpm --filter @restaurant/print-agent build

# 打包为 Windows x64 exe（需要全局安装 pkg 或使用 pnpm exec pkg）
pnpm --filter @restaurant/print-agent pkg:win
```

生成文件：`apps/print-agent/dist-pkg/print-agent.exe`

> **注意**：`@napi-rs/canvas` 是原生模块（N-API .node 文件）。pkg 打包时需要通过 `--assets` 参数将 `.node` 文件一并嵌入，或者在目标机器上使用 Node.js 直接运行 `dist/index.js`。
>
> 推荐方案：在目标 Windows 机器上安装 Node.js 20 + 依赖，然后使用 `nssm` / `node-windows` 或任务计划程序注册为服务。

---

## 开机自启（Windows）

### 方案 A：任务计划程序（推荐）

1. 打开"任务计划程序" → 创建基本任务
2. 触发器：选择"计算机启动时"
3. 操作：选择"启动程序"
   - 程序：`C:\path\to\print-agent.exe`（或 `node.exe`）
   - 参数（若用 node）：`C:\path\to\dist\index.js`
   - 起始目录：`C:\path\to\print-agent`（含 `config.json`）
4. 勾选"用最高权限运行"

### 方案 B：使用 NSSM 注册为 Windows 服务

```powershell
# 下载 nssm.exe，然后：
nssm install PrintAgent "C:\path\to\print-agent.exe"
nssm set PrintAgent AppDirectory "C:\path\to\print-agent"
nssm set PrintAgent Start SERVICE_AUTO_START
nssm start PrintAgent
```

### 方案 C：使用 pm2（推荐开发环境）

```bash
npm install -g pm2 pm2-windows-startup
pm2 start dist/index.js --name print-agent --cwd C:\path\to\print-agent
pm2 save
pm2-windows-startup install
```

---

## 打印模板说明

| 模板 | 用途 | 关键字段 |
|------|------|---------|
| `kitchen` | 厨房单 | tableCode（大字）、items（中越双语） |
| `front` | 前台单 | 同厨房单 |
| `add` | 加菜单 | 横幅"加菜 / THÊM MÓN 第N轮" |
| `void` | 退菜单 | 横幅"退菜 / HỦY MÓN"，带原因 |
| `cancel` | 取消单 | 横幅"取消订单 / HỦY ĐƠN"，带原因 |
| `receipt` | 收据 | 明细、合计、支付方式 |
| `delivery` | 外卖单 | 客户地址、菜品、费用 |
| `shift` | 交班报表 | 总营业额、支付明细 |
| `test` | 测试打印 | 仅打印代理 ID 和时间 |

---

## 支持的纸宽

| 参数值 | 像素宽 | 实际纸宽 |
|--------|--------|---------|
| `58` | 384 px | 58mm 热敏纸 |
| `80` | 576 px | 80mm 热敏纸 |

---

## 故障排查

| 问题 | 排查方向 |
|------|---------|
| 中文乱码 / 方块 | 检查 `assets/fonts/` 是否有 NotoSansSC 字体；Windows 确认 msyh.ttc 存在 |
| 连不上服务器 | 检查 `serverUrl` 和防火墙；状态页查看 Socket 错误信息 |
| 打印机无响应 | Ping 打印机 IP；确认端口 9100 可达；状态页"测试打印"验证 |
| `config.json not found` | 确保在 `apps/print-agent/` 目录下运行，或将 config.json 放在执行目录 |
