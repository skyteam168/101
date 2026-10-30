/**
 * status-server.ts
 * 本地 HTTP 状态页面：展示连接状态、最近打印任务、支持触发测试打印。
 */
import http from 'http';
import { AgentConfig } from './config';
import { SocketState } from './socket';

// ─────────────────────────── 任务记录 ───────────────────────────

export interface JobRecord {
  jobId: string;
  template: string;
  printerIp: string;
  status: 'done' | 'failed' | 'pending';
  error?: string;
  at: Date;
  durationMs?: number;
}

const MAX_JOBS = 20;
const recentJobs: JobRecord[] = [];

export function addJobRecord(record: JobRecord): void {
  recentJobs.unshift(record);
  if (recentJobs.length > MAX_JOBS) recentJobs.pop();
}

export function getRecentJobs(): JobRecord[] {
  return [...recentJobs];
}

// ─────────────────────────── HTML 渲染 ───────────────────────────

function statusBadge(s: SocketState['status']): string {
  const map: Record<string, [string, string]> = {
    connected: ['#4caf50', '● 已连接'],
    connecting: ['#ff9800', '◌ 连接中'],
    disconnected: ['#9e9e9e', '○ 未连接'],
    error: ['#f44336', '✗ 错误'],
  };
  const [color, label] = map[s] ?? ['#9e9e9e', s];
  return `<span style="color:${color};font-weight:bold">${label}</span>`;
}

function jobStatusBadge(s: JobRecord['status']): string {
  if (s === 'done') return '<span style="color:#4caf50">✓ 成功</span>';
  if (s === 'failed') return '<span style="color:#f44336">✗ 失败</span>';
  return '<span style="color:#ff9800">⋯ 处理中</span>';
}

function renderHtml(config: AgentConfig, socketState: SocketState): string {
  const jobs = getRecentJobs();
  const jobRows = jobs.length
    ? jobs
        .map(
          (j) => `
      <tr>
        <td>${j.at.toLocaleTimeString('zh-CN', { hour12: false })}</td>
        <td><code>${j.jobId.slice(-8)}</code></td>
        <td>${j.template}</td>
        <td>${j.printerIp}</td>
        <td>${jobStatusBadge(j.status)}</td>
        <td style="color:#f44336;font-size:12px">${j.error ?? ''}</td>
        <td>${j.durationMs != null ? j.durationMs + ' ms' : ''}</td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="7" style="text-align:center;color:#888">暂无打印记录</td></tr>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>打印代理状态 · ${config.agentId}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:"Microsoft YaHei",Arial,sans-serif;background:#f5f5f5;color:#333;padding:24px}
    h1{font-size:22px;margin-bottom:16px;color:#1565c0}
    .card{background:#fff;border-radius:8px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .card h2{font-size:16px;margin-bottom:12px;color:#555;border-bottom:1px solid #eee;padding-bottom:8px}
    .info-row{display:flex;margin-bottom:8px;font-size:14px}
    .info-row .label{width:120px;color:#888;flex-shrink:0}
    .info-row .val{font-weight:500}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#f0f4ff;padding:8px 10px;text-align:left;color:#555;font-weight:600}
    td{padding:7px 10px;border-bottom:1px solid #f0f0f0}
    tr:hover td{background:#fafafa}
    .btn{display:inline-block;padding:10px 22px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;transition:.15s}
    .btn-primary{background:#1565c0;color:#fff}
    .btn-primary:hover{background:#1976d2}
    .btn-primary:disabled{background:#90a4ae;cursor:not-allowed}
    #testResult{margin-top:12px;font-size:13px;padding:8px 12px;border-radius:4px;display:none}
    .ok{background:#e8f5e9;color:#2e7d32}
    .err{background:#ffebee;color:#b71c1c}
    select,input{padding:8px 10px;border:1px solid #ddd;border-radius:4px;font-size:14px;margin-right:8px;vertical-align:middle}
  </style>
  <meta http-equiv="refresh" content="10">
</head>
<body>
  <h1>🖨 打印代理状态监控</h1>

  <!-- 连接状态 -->
  <div class="card">
    <h2>连接状态</h2>
    <div class="info-row"><span class="label">代理 ID</span><span class="val">${config.agentId}</span></div>
    <div class="info-row"><span class="label">服务器</span><span class="val">${config.serverUrl}</span></div>
    <div class="info-row"><span class="label">Socket 状态</span><span class="val">${statusBadge(socketState.status)}</span></div>
    <div class="info-row"><span class="label">自</span><span class="val">${socketState.since.toLocaleString('zh-CN', { hour12: false })}</span></div>
    ${socketState.error ? `<div class="info-row"><span class="label">错误</span><span class="val" style="color:#f44336">${socketState.error}</span></div>` : ''}
    ${socketState.reconnectAttempts > 0 ? `<div class="info-row"><span class="label">重连次数</span><span class="val">${socketState.reconnectAttempts}</span></div>` : ''}
  </div>

  <!-- 测试打印 -->
  <div class="card">
    <h2>测试打印</h2>
    <p style="font-size:13px;color:#666;margin-bottom:12px">输入打印机 IP 和端口，发送测试打印单。</p>
    <input id="testIp" placeholder="打印机 IP，如 192.168.1.100" style="width:220px">
    <input id="testPort" placeholder="端口" value="9100" style="width:80px">
    <select id="testWidth">
      <option value="58">58mm (384px)</option>
      <option value="80">80mm (576px)</option>
    </select>
    <button class="btn btn-primary" onclick="doTestPrint()">发送测试打印</button>
    <div id="testResult"></div>
  </div>

  <!-- 最近任务 -->
  <div class="card">
    <h2>最近打印任务（最多 ${MAX_JOBS} 条，10秒自动刷新）</h2>
    <table>
      <thead>
        <tr>
          <th>时间</th>
          <th>Job ID (末8位)</th>
          <th>模板</th>
          <th>打印机 IP</th>
          <th>状态</th>
          <th>错误信息</th>
          <th>耗时</th>
        </tr>
      </thead>
      <tbody>${jobRows}</tbody>
    </table>
  </div>

  <script>
    async function doTestPrint() {
      const ip = document.getElementById('testIp').value.trim();
      const port = parseInt(document.getElementById('testPort').value) || 9100;
      const paperWidth = parseInt(document.getElementById('testWidth').value);
      const btn = event.target;
      const resultEl = document.getElementById('testResult');
      if (!ip) { alert('请输入打印机 IP'); return; }
      btn.disabled = true;
      btn.textContent = '发送中…';
      resultEl.style.display = 'none';
      try {
        const res = await fetch('/api/test-print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, port, paperWidth })
        });
        const json = await res.json();
        resultEl.className = json.ok ? 'ok' : 'err';
        resultEl.textContent = json.ok ? '✓ 测试打印成功' : ('✗ 失败: ' + json.error);
        resultEl.style.display = 'block';
      } catch(e) {
        resultEl.className = 'err';
        resultEl.textContent = '✗ 请求失败: ' + e.message;
        resultEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = '发送测试打印';
      }
    }
  </script>
</body>
</html>`;
}

// ─────────────────────────── HTTP 服务 ───────────────────────────

export type TestPrintFn = (ip: string, port: number, paperWidth: 58 | 80) => Promise<void>;

/**
 * 启动本地 HTTP 状态服务器。
 *
 * @param config       代理配置
 * @param getState     获取当前 Socket 状态的函数
 * @param testPrintFn  触发测试打印的函数
 */
export function startStatusServer(
  config: AgentConfig,
  getState: () => SocketState,
  testPrintFn: TestPrintFn,
): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';

    // 状态页
    if (req.method === 'GET' && url === '/') {
      const html = renderHtml(config, getState());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // JSON API: 状态
    if (req.method === 'GET' && url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          socketState: getState(),
          recentJobs: getRecentJobs(),
        }),
      );
      return;
    }

    // 触发测试打印
    if (req.method === 'POST' && url === '/api/test-print') {
      let body = '';
      req.on('data', (chunk) => (body += chunk.toString()));
      req.on('end', async () => {
        let payload: { ip?: string; port?: number; paperWidth?: number };
        try {
          payload = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
          return;
        }

        const { ip, port = 9100, paperWidth = 58 } = payload;
        if (!ip) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: '缺少 ip 参数' }));
          return;
        }

        try {
          await testPrintFn(ip, port, paperWidth as 58 | 80);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(err) }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(config.localStatusPort, '127.0.0.1', () => {
    console.log(`[status] 状态页面已启动 → http://127.0.0.1:${config.localStatusPort}`);
  });

  server.on('error', (err) => {
    console.error(`[status] HTTP 服务器错误: ${err.message}`);
  });

  return server;
}
