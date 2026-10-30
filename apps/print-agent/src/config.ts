import fs from 'fs';
import path from 'path';

/** 打印代理配置结构 */
export interface AgentConfig {
  serverUrl: string;
  agentId: string;
  agentSecret: string;
  /** 本地状态页端口，默认 17890 */
  localStatusPort: number;
}

/**
 * 从工作目录下的 config.json 加载配置。
 * 若文件不存在则抛出友好错误。
 */
export function loadConfig(): AgentConfig {
  const configPath = path.resolve(process.cwd(), 'config.json');
  if (!fs.existsSync(configPath)) {
    const examplePath = path.resolve(__dirname, '../config.example.json');
    throw new Error(
      `配置文件未找到: ${configPath}\n` +
        `请复制 config.example.json 为 config.json 并填写 serverUrl / agentId / agentSecret。\n` +
        `示例文件: ${examplePath}`,
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (e) {
    throw new Error(`读取 config.json 失败: ${(e as Error).message}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('config.json 格式错误，请确保是合法的 JSON 文件');
  }

  if (!data.serverUrl) throw new Error('config.json 缺少 serverUrl');
  if (!data.agentId) throw new Error('config.json 缺少 agentId');
  if (!data.agentSecret) throw new Error('config.json 缺少 agentSecret');

  return {
    serverUrl: String(data.serverUrl),
    agentId: String(data.agentId),
    agentSecret: String(data.agentSecret),
    localStatusPort: typeof data.localStatusPort === 'number' ? data.localStatusPort : 17890,
  };
}
