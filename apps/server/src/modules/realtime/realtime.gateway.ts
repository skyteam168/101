import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import { PrintAgentStatus } from '@prisma/client';
import { Events } from '@restaurant/shared';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

type SocketAuth = {
  typ: 'staff' | 'guest' | 'customer' | 'agent';
  storeId?: string;
  sessionId?: string;
  customerId?: string;
  userId?: string;
  nickname?: string;
  agentId?: string;
};

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/',
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  afterInit(server: Server) {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://127.0.0.1:6379';
    try {
      const pub = new Redis(url, { maxRetriesPerRequest: null });
      const sub = pub.duplicate();
      server.adapter(createAdapter(pub, sub));
      this.logger.log('Socket.IO Redis adapter attached');
    } catch (e) {
      this.logger.warn(`Redis adapter init failed, using memory: ${(e as Error).message}`);
    }
  }

  /** agentId → socket ids */
  private readonly agentSockets = new Map<string, Set<string>>();

  async handleConnection(client: Socket) {
    try {
      // 打印代理：auth { typ:'agent', agentId, secret }
      const authTyp = client.handshake.auth?.typ as string | undefined;
      if (authTyp === 'agent') {
        await this.handleAgentConnect(client);
        return;
      }

      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '');
      if (!token) {
        this.logger.debug(`socket ${client.id} connected without token`);
        return;
      }
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
      });
      const typ = payload.typ as string;
      if (typ === 'access') {
        const userId = String(payload.sub);
        const user = await this.prisma.user.findUnique({ where: { id: BigInt(userId) } });
        if (!user) return;
        const auth: SocketAuth = {
          typ: 'staff',
          userId,
          storeId: user.storeId?.toString(),
        };
        client.data.auth = auth;
        if (auth.storeId) {
          await client.join(`store:${auth.storeId}:front`);
          await client.join(`store:${auth.storeId}:kitchen`);
          await client.join(`store:${auth.storeId}`);
        }
        this.logger.debug(`staff ${userId} joined store rooms`);
        return;
      }
      if (typ === 'guest') {
        const auth: SocketAuth = {
          typ: 'guest',
          sessionId: String(payload.sessionId),
          storeId: String(payload.storeId),
          nickname: String(payload.nickname ?? ''),
        };
        client.data.auth = auth;
        await client.join(`table:${auth.sessionId}`);
        this.logger.debug(`guest joined table:${auth.sessionId}`);
        return;
      }
      if (typ === 'customer') {
        const auth: SocketAuth = {
          typ: 'customer',
          customerId: String(payload.sub),
        };
        client.data.auth = auth;
        await client.join(`customer:${auth.customerId}`);
      }
    } catch (e) {
      this.logger.debug(`socket auth failed ${client.id}: ${(e as Error).message}`);
    }
  }

  private async handleAgentConnect(client: Socket) {
    const agentId = String(client.handshake.auth?.agentId || '');
    const secret = String(client.handshake.auth?.secret || '');
    if (!agentId || !secret) {
      client.disconnect(true);
      return;
    }
    const agent = await this.prisma.printAgent.findUnique({ where: { id: BigInt(agentId) } });
    if (!agent) {
      client.disconnect(true);
      return;
    }
    const ok = await bcrypt.compare(secret, agent.secretHash);
    if (!ok) {
      this.logger.warn(`agent ${agentId} bad secret`);
      client.disconnect(true);
      return;
    }
    const auth: SocketAuth = {
      typ: 'agent',
      agentId,
      storeId: agent.storeId.toString(),
    };
    client.data.auth = auth;
    await client.join(`agent:${agentId}`);
    let set = this.agentSockets.get(agentId);
    if (!set) {
      set = new Set();
      this.agentSockets.set(agentId, set);
    }
    set.add(client.id);
    await this.prisma.printAgent.update({
      where: { id: agent.id },
      data: { status: PrintAgentStatus.online, lastSeenAt: new Date() },
    });
    this.logger.log(`print agent ${agentId} online`);
    this.events.emit('print.agent.online', { agentId, storeId: agent.storeId.toString() });
  }

  handleDisconnect(client: Socket) {
    const auth = client.data.auth as SocketAuth | undefined;
    if (auth?.typ !== 'agent' || !auth.agentId) return;
    const set = this.agentSockets.get(auth.agentId);
    if (set) {
      set.delete(client.id);
      if (set.size === 0) {
        this.agentSockets.delete(auth.agentId);
        void this.prisma.printAgent
          .update({
            where: { id: BigInt(auth.agentId) },
            data: { status: PrintAgentStatus.offline },
          })
          .catch(() => undefined);
        this.logger.log(`print agent ${auth.agentId} offline`);
      }
    }
  }

  isAgentOnline(agentId: string) {
    return (this.agentSockets.get(agentId)?.size || 0) > 0;
  }

  emitToAgent(agentId: string, event: string, payload: unknown) {
    this.server.to(`agent:${agentId}`).emit(event, payload);
  }

  @SubscribeMessage(Events.PRINT_ACK)
  async onPrintAck(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { jobId?: string; status?: string; error?: string },
  ) {
    const auth = client.data.auth as SocketAuth | undefined;
    if (auth?.typ !== 'agent' || !body?.jobId) return { ok: false };
    this.events.emit(Events.PRINT_ACK, {
      agentId: auth.agentId,
      jobId: String(body.jobId),
      status: body.status === 'done' ? 'done' : 'failed',
      error: body.error,
    });
    return { ok: true };
  }

  /** 显式加入房间（兼容旧客户端；员工/顾客仍受 auth 校验） */
  @SubscribeMessage('join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: string },
  ) {
    const room = body?.room;
    if (!room) return { ok: false };
    const auth = client.data.auth as SocketAuth | undefined;
    if (room.startsWith('store:') && auth?.typ === 'staff') {
      await client.join(room);
      return { ok: true, room };
    }
    if (room.startsWith('table:') && auth?.typ === 'guest' && room === `table:${auth.sessionId}`) {
      await client.join(room);
      return { ok: true, room };
    }
    if (room.startsWith('customer:') && auth?.typ === 'customer' && room === `customer:${auth.customerId}`) {
      await client.join(room);
      return { ok: true, room };
    }
    // 无 token 的开发兼容：仅允许 store:*:front（菜单页旧逻辑）
    if (!auth && /^store:\d+:(front|kitchen)$/.test(room)) {
      await client.join(room);
      return { ok: true, room };
    }
    return { ok: false };
  }

  emitToStore(storeId: string, event: string, payload: unknown) {
    this.server.to(`store:${storeId}:front`).emit(event, payload);
    this.server.to(`store:${storeId}`).emit(event, payload);
  }

  emitToKitchen(storeId: string, event: string, payload: unknown) {
    this.server.to(`store:${storeId}:kitchen`).emit(event, payload);
  }

  emitToTable(sessionId: string, event: string, payload: unknown) {
    this.server.to(`table:${sessionId}`).emit(event, payload);
  }

  emitToCustomer(customerId: string, event: string, payload: unknown) {
    this.server.to(`customer:${customerId}`).emit(event, payload);
  }

  emitDishUpdated(storeId: string, payload: unknown) {
    this.emitToStore(storeId, Events.DISH_UPDATED, payload);
  }

  emitCartUpdated(sessionId: string, payload: unknown) {
    this.emitToTable(sessionId, Events.CART_UPDATED, payload);
  }
}
