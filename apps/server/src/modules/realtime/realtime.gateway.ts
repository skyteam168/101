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
import { printerDeviceStatusStore } from '../print/printer-device-status.store';

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

  /** storeId → 打印台员工 socket（收银电脑 USB） */
  private readonly printStationByStore = new Map<
    string,
    { socketId: string; userId: string; printerIds: string[] }
  >();

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
    // 同一 agentId 只保留最新连接，避免开发机/收银机双开抢任务互相 ACK 失败
    const prev = this.agentSockets.get(agentId);
    if (prev?.size) {
      for (const oldId of [...prev]) {
        if (oldId === client.id) continue;
        const oldSock =
          this.server?.sockets?.sockets?.get?.(oldId) ??
          (this.server as { socket?: (id: string) => { disconnect: (close?: boolean) => void } | undefined } | undefined)?.socket?.(
            oldId,
          );
        try {
          oldSock?.disconnect(true);
        } catch {
          /* ignore */
        }
        prev.delete(oldId);
      }
    }
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
    // 下发需监控的 Windows 队列名，供代理探测真实通断电状态
    const watch = await this.prisma.printer.findMany({
      where: {
        agentId: agent.id,
        isActive: true,
        connectionType: 'agent_usb',
      },
      select: { id: true, name: true, ip: true },
    });
    client.emit('print.agent.watch', {
      printers: watch.map((p) => ({
        id: p.id.toString(),
        queueName: (p.ip || p.name || '').trim(),
      })),
    });
  }

  handleDisconnect(client: Socket) {
    const auth = client.data.auth as SocketAuth | undefined;
    if (auth?.typ === 'staff' && auth.storeId) {
      const claim = this.printStationByStore.get(auth.storeId);
      if (claim?.socketId === client.id) {
        this.printStationByStore.delete(auth.storeId);
        this.emitToStore(auth.storeId, Events.PRINT_STATION_STATUS, {
          storeId: auth.storeId,
          online: false,
        });
        this.logger.log(`print station released (disconnect) store=${auth.storeId}`);
      }
    }
    if (auth?.typ !== 'agent' || !auth.agentId) return;
    const set = this.agentSockets.get(auth.agentId);
    if (set) {
      set.delete(client.id);
      if (set.size === 0) {
        this.agentSockets.delete(auth.agentId);
        printerDeviceStatusStore.clearAgent(auth.agentId);
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

  @SubscribeMessage(Events.PRINT_AGENT_HEARTBEAT)
  onAgentHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      printers?: Array<{ queueName?: string; ok?: boolean; detail?: string }>;
    },
  ) {
    const auth = client.data.auth as SocketAuth | undefined;
    if (auth?.typ !== 'agent' || !auth.agentId) return { ok: false };
    const list = Array.isArray(body?.printers) ? body.printers : [];
    printerDeviceStatusStore.upsert(
      auth.agentId,
      list.map((p) => ({
        queueName: String(p.queueName || ''),
        ok: !!p.ok,
        detail: p.detail ? String(p.detail) : undefined,
      })),
    );
    void this.prisma.printAgent
      .update({
        where: { id: BigInt(auth.agentId) },
        data: { lastSeenAt: new Date(), status: PrintAgentStatus.online },
      })
      .catch(() => undefined);
    return { ok: true };
  }

  @SubscribeMessage(Events.PRINT_ACK)
  async onPrintAck(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { jobId?: string; status?: string; error?: string },
  ) {
    const auth = client.data.auth as SocketAuth | undefined;
    if (!body?.jobId) return { ok: false };
    // 打印代理或已认领的打印台员工均可回执
    if (auth?.typ === 'agent') {
      this.events.emit(Events.PRINT_ACK, {
        agentId: auth.agentId,
        jobId: String(body.jobId),
        status: body.status === 'done' ? 'done' : 'failed',
        error: body.error,
      });
      return { ok: true };
    }
    if (auth?.typ === 'staff' && auth.storeId) {
      const claim = this.printStationByStore.get(auth.storeId);
      if (!claim || claim.socketId !== client.id) return { ok: false };
      this.events.emit(Events.PRINT_ACK, {
        storeId: auth.storeId,
        jobId: String(body.jobId),
        status: body.status === 'done' ? 'done' : 'failed',
        error: body.error,
      });
      return { ok: true };
    }
    return { ok: false };
  }

  @SubscribeMessage(Events.PRINT_STATION_CLAIM)
  async onPrintStationClaim(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { printerIds?: string[] },
  ) {
    const auth = client.data.auth as SocketAuth | undefined;
    if (auth?.typ !== 'staff' || !auth.storeId || !auth.userId) {
      return { ok: false, message: 'UNAUTHORIZED' };
    }
    const storeId = auth.storeId;
    const printerIds = (body?.printerIds || []).map(String);
    this.printStationByStore.set(storeId, {
      socketId: client.id,
      userId: auth.userId,
      printerIds,
    });
    await client.join(`store:${storeId}:print-station`);
    this.emitToStore(storeId, Events.PRINT_STATION_STATUS, {
      storeId,
      online: true,
      userId: auth.userId,
      printerIds,
    });
    this.events.emit(Events.PRINT_STATION_CLAIM, { storeId, userId: auth.userId, printerIds });
    this.logger.log(`print station claimed store=${storeId} user=${auth.userId}`);
    return { ok: true, storeId };
  }

  @SubscribeMessage(Events.PRINT_STATION_RELEASE)
  async onPrintStationRelease(@ConnectedSocket() client: Socket) {
    const auth = client.data.auth as SocketAuth | undefined;
    if (auth?.typ !== 'staff' || !auth.storeId) return { ok: false };
    const claim = this.printStationByStore.get(auth.storeId);
    if (claim?.socketId === client.id) {
      this.printStationByStore.delete(auth.storeId);
      this.emitToStore(auth.storeId, Events.PRINT_STATION_STATUS, {
        storeId: auth.storeId,
        online: false,
      });
      this.events.emit(Events.PRINT_STATION_RELEASE, { storeId: auth.storeId });
    }
    return { ok: true };
  }

  isPrintStationOnline(storeId: string) {
    const claim = this.printStationByStore.get(storeId);
    if (!claim) return false;
    // Nest/Socket.IO 下 sockets Map 取法因版本略有差异；认领表在 disconnect 时已清理
    const byId =
      this.server?.sockets?.sockets?.get?.(claim.socketId) ??
      (this.server as { socket?: (id: string) => unknown } | undefined)?.socket?.(
        claim.socketId,
      );
    if (byId) return true;
    // Map 不可用时仍以认领为准（避免 flush/dispatch 整段抛错导致任务永久 queued）
    return this.printStationByStore.has(storeId);
  }

  emitToPrintStation(storeId: string, event: string, payload: unknown) {
    const claim = this.printStationByStore.get(storeId);
    if (claim) {
      this.server.to(claim.socketId).emit(event, payload);
      return;
    }
    this.server.to(`store:${storeId}:print-station`).emit(event, payload);
  }

  /** 员工只能加入本店房间：store:{storeId} 或 store:{storeId}:* */
  private staffOwnsStoreRoom(storeId: string, room: string): boolean {
    return room === `store:${storeId}` || room.startsWith(`store:${storeId}:`);
  }

  /**
   * 显式加入房间。
   * - 员工：仅本店 store 房间
   * - 访客/顾客：仅自己的 table/customer 房间
   * - 匿名：仅 store:{id}:menu（菜品上下架广播，不含订单/厨房事件）
   */
  @SubscribeMessage('join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: string },
  ) {
    const room = body?.room;
    if (!room) return { ok: false };
    const auth = client.data.auth as SocketAuth | undefined;
    if (
      room.startsWith('store:') &&
      auth?.typ === 'staff' &&
      auth.storeId &&
      this.staffOwnsStoreRoom(auth.storeId, room)
    ) {
      await client.join(room);
      return { ok: true, room };
    }
    if (room.startsWith('table:') && auth?.typ === 'guest' && room === `table:${auth.sessionId}`) {
      await client.join(room);
      return { ok: true, room };
    }
    if (
      room.startsWith('customer:') &&
      auth?.typ === 'customer' &&
      room === `customer:${auth.customerId}`
    ) {
      await client.join(room);
      return { ok: true, room };
    }
    // 公开菜单页：只允许 menu 房间，禁止匿名进 front/kitchen 窃听订单事件
    if ((!auth || auth.typ === 'guest' || auth.typ === 'customer') && /^store:\d+:menu$/.test(room)) {
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
    this.server.to(`store:${storeId}:menu`).emit(Events.DISH_UPDATED, payload);
    this.emitToStore(storeId, Events.DISH_UPDATED, payload);
  }

  emitCartUpdated(sessionId: string, payload: unknown) {
    this.emitToTable(sessionId, Events.CART_UPDATED, payload);
  }
}
