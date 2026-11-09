import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrintAgentStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BusinessError } from '../../common/errors/business.error';
import { assertSafeExternalHttpUrl } from '../../common/safe-url.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAgentDto,
  CreatePrinterDto,
  CreateStationDto,
  UpdateAgentDto,
  UpdatePrinterDto,
  UpdateStationDto,
} from './dto/print.dto';
import { printerDeviceStatusStore } from './printer-device-status.store';

@Injectable()
export class PrintService {
  constructor(private readonly prisma: PrismaService) {}

  private mapStation(s: { id: bigint; nameZh: string; nameVi: string; storeId: bigint }) {
    return {
      id: s.id.toString(),
      storeId: s.storeId.toString(),
      nameZh: s.nameZh,
      nameVi: s.nameVi,
    };
  }

  private mapPrinter(
    p: Prisma.PrinterGetPayload<{ include: { station: true; agent: true } }>,
  ) {
    const agentId = p.agentId?.toString() ?? null;
    const queueName = p.ip || p.name;
    const device =
      p.connectionType === 'agent_usb'
        ? printerDeviceStatusStore.getByQueueName(agentId, queueName)
        : null;
    const deviceFresh = printerDeviceStatusStore.isFresh(device);
    return {
      id: p.id.toString(),
      storeId: p.storeId.toString(),
      name: p.name,
      ip: p.ip,
      port: p.port,
      paperWidth: p.paperWidth,
      role: p.role,
      connectionType: p.connectionType,
      acceptAllTickets: p.acceptAllTickets,
      stationId: p.stationId?.toString() ?? null,
      agentId,
      isActive: p.isActive,
      station: p.station ? this.mapStation(p.station) : null,
      agent: p.agent
        ? {
            id: p.agent.id.toString(),
            name: p.agent.name,
            status: p.agent.status,
            lastSeenAt: p.agent.lastSeenAt,
          }
        : null,
      /** Windows 队列真实就绪（代理心跳）；null=尚无上报 */
      deviceOnline: deviceFresh ? device!.ok : null,
      deviceDetail: deviceFresh ? device!.detail : null,
      deviceCheckedAt: deviceFresh ? new Date(device!.at).toISOString() : null,
    };
  }

  private mapAgent(a: {
    id: bigint;
    storeId: bigint;
    name: string;
    status: PrintAgentStatus;
    lastSeenAt: Date | null;
    createdAt: Date;
    _count?: { printers: number };
  }) {
    return {
      id: a.id.toString(),
      storeId: a.storeId.toString(),
      name: a.name,
      status: a.status,
      lastSeenAt: a.lastSeenAt,
      createdAt: a.createdAt,
      printerCount: a._count?.printers ?? 0,
    };
  }

  // —— 档口 ——
  listStations(storeId: string) {
    return this.prisma.kitchenStation
      .findMany({ where: { storeId: BigInt(storeId) }, orderBy: { id: 'asc' } })
      .then((rows) => rows.map((r) => this.mapStation(r)));
  }

  async createStation(storeId: string, dto: CreateStationDto) {
    const row = await this.prisma.kitchenStation.create({
      data: { storeId: BigInt(storeId), nameZh: dto.nameZh, nameVi: dto.nameVi },
    });
    return this.mapStation(row);
  }

  async updateStation(storeId: string, id: string, dto: UpdateStationDto) {
    const existing = await this.prisma.kitchenStation.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('STATION_NOT_FOUND');
    const row = await this.prisma.kitchenStation.update({
      where: { id: existing.id },
      data: { nameZh: dto.nameZh, nameVi: dto.nameVi },
    });
    return this.mapStation(row);
  }

  async deleteStation(storeId: string, id: string) {
    const existing = await this.prisma.kitchenStation.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('STATION_NOT_FOUND');
    await this.prisma.category.updateMany({
      where: { kitchenStationId: existing.id },
      data: { kitchenStationId: null },
    });
    await this.prisma.printer.updateMany({
      where: { stationId: existing.id },
      data: { stationId: null },
    });
    await this.prisma.kitchenStation.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  // —— 打印机 ——
  listPrinters(storeId: string) {
    return this.prisma.printer
      .findMany({
        where: { storeId: BigInt(storeId) },
        include: { station: true, agent: true },
        orderBy: { id: 'asc' },
      })
      .then((rows) => rows.map((r) => this.mapPrinter(r)));
  }

  async createPrinter(storeId: string, dto: CreatePrinterDto) {
    const connectionType = dto.connectionType ?? 'network';
    const isBrowser = connectionType === 'browser_usb';
    const isAgentUsb = connectionType === 'agent_usb';
    const isCloud = connectionType === 'cloud';
    if (!isBrowser && !dto.ip?.trim()) {
      throw new BusinessError(
        isCloud
          ? 'PRINTER_WEBHOOK_REQUIRED'
          : isAgentUsb
            ? 'PRINTER_WINDOWS_NAME_REQUIRED'
            : 'PRINTER_IP_REQUIRED',
      );
    }
    if (isCloud) {
      assertSafeExternalHttpUrl(dto.ip!.trim());
    }
    if (!isBrowser && !isCloud && !dto.agentId) {
      throw new BusinessError('PRINTER_AGENT_REQUIRED');
    }
    const row = await this.prisma.printer.create({
      data: {
        storeId: BigInt(storeId),
        name: dto.name,
        ip: isBrowser ? (dto.ip?.trim() || '') : dto.ip!.trim(),
        port: dto.port ?? 9100,
        paperWidth: dto.paperWidth,
        role: dto.role,
        connectionType,
        acceptAllTickets: dto.acceptAllTickets ?? false,
        stationId: dto.stationId ? BigInt(dto.stationId) : null,
        agentId: isBrowser || isCloud ? null : dto.agentId ? BigInt(dto.agentId) : null,
        isActive: dto.isActive ?? true,
      },
      include: { station: true, agent: true },
    });
    return this.mapPrinter(row);
  }

  async updatePrinter(storeId: string, id: string, dto: UpdatePrinterDto) {
    const existing = await this.prisma.printer.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PRINTER_NOT_FOUND');
    const nextType = dto.connectionType ?? existing.connectionType;
    const isBrowser = nextType === 'browser_usb';
    const isAgentUsb = nextType === 'agent_usb';
    const isCloud = nextType === 'cloud';
    const nextIp = dto.ip !== undefined ? dto.ip.trim() : existing.ip;
    if (!isBrowser && !nextIp) {
      throw new BusinessError(
        isCloud
          ? 'PRINTER_WEBHOOK_REQUIRED'
          : isAgentUsb
            ? 'PRINTER_WINDOWS_NAME_REQUIRED'
            : 'PRINTER_IP_REQUIRED',
      );
    }
    if (isCloud) {
      assertSafeExternalHttpUrl(nextIp);
    }
    if (!isBrowser && !isCloud) {
      const nextAgent =
        dto.agentId !== undefined ? dto.agentId : existing.agentId?.toString() ?? null;
      if (!nextAgent) throw new BusinessError('PRINTER_AGENT_REQUIRED');
    }
    const row = await this.prisma.printer.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        ip: dto.ip !== undefined ? (isBrowser ? dto.ip.trim() : dto.ip.trim()) : undefined,
        port: dto.port,
        paperWidth: dto.paperWidth,
        role: dto.role,
        connectionType: dto.connectionType,
        acceptAllTickets: dto.acceptAllTickets,
        stationId:
          dto.stationId === undefined
            ? undefined
            : dto.stationId
              ? BigInt(dto.stationId)
              : null,
        agentId:
          isBrowser || isCloud
            ? null
            : dto.agentId === undefined
              ? undefined
              : dto.agentId
                ? BigInt(dto.agentId)
                : null,
        isActive: dto.isActive,
      },
      include: { station: true, agent: true },
    });
    return this.mapPrinter(row);
  }

  async deletePrinter(storeId: string, id: string) {
    const existing = await this.prisma.printer.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PRINTER_NOT_FOUND');
    await this.prisma.printer.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  // —— 代理 ——
  listAgents(storeId: string) {
    return this.prisma.printAgent
      .findMany({
        where: { storeId: BigInt(storeId) },
        include: { _count: { select: { printers: true } } },
        orderBy: { id: 'asc' },
      })
      .then((rows) => rows.map((r) => this.mapAgent(r)));
  }

  /** 创建代理并返回明文密钥（仅此一次） */
  async createAgent(storeId: string, dto: CreateAgentDto) {
    const secret = randomBytes(24).toString('hex');
    const secretHash = await bcrypt.hash(secret, 10);
    const row = await this.prisma.printAgent.create({
      data: {
        storeId: BigInt(storeId),
        name: dto.name,
        secretHash,
        status: PrintAgentStatus.offline,
      },
      include: { _count: { select: { printers: true } } },
    });
    return { ...this.mapAgent(row), secret };
  }

  async updateAgent(storeId: string, id: string, dto: UpdateAgentDto) {
    const existing = await this.prisma.printAgent.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PRINT_AGENT_NOT_FOUND');
    const row = await this.prisma.printAgent.update({
      where: { id: existing.id },
      data: { name: dto.name },
      include: { _count: { select: { printers: true } } },
    });
    return this.mapAgent(row);
  }

  /** 重新生成密钥 */
  async regenerateSecret(storeId: string, id: string) {
    const existing = await this.prisma.printAgent.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PRINT_AGENT_NOT_FOUND');
    const secret = randomBytes(24).toString('hex');
    const secretHash = await bcrypt.hash(secret, 10);
    await this.prisma.printAgent.update({
      where: { id: existing.id },
      data: { secretHash, status: PrintAgentStatus.offline },
    });
    return { id: existing.id.toString(), secret };
  }

  async deleteAgent(storeId: string, id: string) {
    const existing = await this.prisma.printAgent.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('PRINT_AGENT_NOT_FOUND');
    await this.prisma.printer.updateMany({
      where: { agentId: existing.id },
      data: { agentId: null },
    });
    await this.prisma.printAgent.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  async verifyAgentSecret(agentId: string, secret: string) {
    const agent = await this.prisma.printAgent.findUnique({ where: { id: BigInt(agentId) } });
    if (!agent) return null;
    const ok = await bcrypt.compare(secret, agent.secretHash);
    if (!ok) {
      // 兼容开发期明文 hash 误存
      const sha = createHash('sha256').update(secret).digest('hex');
      if (sha !== agent.secretHash && secret !== agent.secretHash) return null;
    }
    return agent;
  }

  async setAgentOnline(agentId: string, online: boolean) {
    await this.prisma.printAgent.update({
      where: { id: BigInt(agentId) },
      data: {
        status: online ? PrintAgentStatus.online : PrintAgentStatus.offline,
        lastSeenAt: online ? new Date() : undefined,
      },
    });
  }

  async touchAgent(agentId: string) {
    await this.prisma.printAgent.update({
      where: { id: BigInt(agentId) },
      data: { lastSeenAt: new Date(), status: PrintAgentStatus.online },
    });
  }
}
