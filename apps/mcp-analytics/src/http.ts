#!/usr/bin/env node
/**
 * 线上 Streamable HTTP MCP：供「在线服务 (HTTP)」接入
 * 地址示例：https://www.nhahang101.top/mcp
 * 请求头：Authorization: Bearer <MCP_API_KEY>
 */
import { randomUUID } from 'node:crypto';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response, NextFunction } from 'express';
import { loadConfig } from './config.js';
import { createAnalyticsServer } from './create-server.js';

type Session = {
  transport: StreamableHTTPServerTransport;
  open: number;
  lastActive: number;
};

const IDLE_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 64;

async function main() {
  const cfg = loadConfig({ requireMcpKey: true });
  const sessions = new Map<string, Session>();

  const app = createMcpExpressApp({
    host: cfg.httpHost,
    allowedHosts: cfg.allowedHosts,
  });

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      name: 'restaurant-analytics',
      mode: 'http',
      apiBase: cfg.apiBase,
      sessions: sessions.size,
    });
  });

  const requireMcpKey = (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    const key = m?.[1]?.trim() || '';
    if (!key || key !== cfg.mcpApiKey) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: invalid MCP_API_KEY' },
        id: null,
      });
      return;
    }
    next();
  };

  const trackResponse = (session: Session, res: Response) => {
    if (!res.socket || res.destroyed) return;
    session.open++;
    session.lastActive = Date.now();
    res.on('close', () => {
      session.open--;
      session.lastActive = Date.now();
    });
  };

  setInterval(() => {
    const cutoff = Date.now() - IDLE_MS;
    for (const [id, s] of sessions) {
      if (s.open === 0 && s.lastActive < cutoff) {
        s.transport.close().catch(() => undefined);
        sessions.delete(id);
      }
    }
  }, 60_000).unref();

  const mcpPost = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    try {
      const existing = sessionId ? sessions.get(sessionId) : undefined;
      if (existing) {
        trackResponse(existing, res);
        await existing.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        if (sessions.size >= MAX_SESSIONS) {
          res.status(503).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Too many open sessions' },
            id: null,
          });
          return;
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, open: 0, lastActive: Date.now() });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };

        const server = createAnalyticsServer(cfg);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (sessionId) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found' },
          id: null,
        });
        return;
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
    } catch (err) {
      console.error('[restaurant-mcp-http] POST error', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  };

  const mcpGetOrDelete = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      res.status(400).send('Missing session ID');
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Session not found' },
        id: null,
      });
      return;
    }
    trackResponse(session, res);
    await session.transport.handleRequest(req, res);
  };

  app.post('/mcp', requireMcpKey, mcpPost);
  app.get('/mcp', requireMcpKey, mcpGetOrDelete);
  app.delete('/mcp', requireMcpKey, mcpGetOrDelete);

  app.listen(cfg.httpPort, cfg.httpHost, () => {
    console.error(
      `[restaurant-mcp-http] listening http://${cfg.httpHost}:${cfg.httpPort}/mcp apiBase=${cfg.apiBase}`,
    );
  });
}

main().catch((err) => {
  console.error('[restaurant-mcp-http] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
