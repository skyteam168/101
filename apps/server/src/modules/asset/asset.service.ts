import { Injectable } from '@nestjs/common';
import { AssetEventType, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AssetEventQtyDto,
  AssetQueryDto,
  CheckAssetDto,
  CreateAssetCategoryDto,
  CreateAssetDto,
  TransferAssetDto,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
} from './dto/asset.dto';
import {
  assertQtyBalance,
  QtyState,
  straightLineNetUnit,
  sumActive,
} from './asset.util';

type Tx = Prisma.TransactionClient;

@Injectable()
export class AssetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- map ----------

  private mapCategory(c: {
    id: bigint;
    nameZh: string;
    nameVi: string;
    depreciationMonths: number;
    _count?: { assets: number };
  }) {
    return {
      id: c.id.toString(),
      nameZh: c.nameZh,
      nameVi: c.nameVi,
      depreciationMonths: c.depreciationMonths,
      assetCount: c._count?.assets ?? 0,
    };
  }

  private mapAsset(
    a: {
      id: bigint;
      assetNo: string;
      categoryId: bigint;
      nameZh: string;
      nameVi: string;
      spec: string | null;
      unit: string;
      location: string | null;
      supplier: string | null;
      purchaseDate: Date | null;
      unitPrice: bigint;
      qtyTotal: number;
      qtyInUse: number;
      qtyIdle: number;
      qtyRepair: number;
      qtyDisposed: number;
      warrantyUntil: Date | null;
      photo: string | null;
      createdAt: Date;
      category?: { id: bigint; nameZh: string; nameVi: string; depreciationMonths: number };
    },
    opts?: { withEvents?: boolean; events?: unknown[] },
  ) {
    const unitPrice = Number(a.unitPrice);
    const dep = a.category?.depreciationMonths ?? 36;
    const active = a.qtyInUse + a.qtyIdle + a.qtyRepair;
    const netUnit = straightLineNetUnit(unitPrice, a.purchaseDate, dep);
    return {
      id: a.id.toString(),
      assetNo: a.assetNo,
      categoryId: a.categoryId.toString(),
      category: a.category
        ? {
            id: a.category.id.toString(),
            nameZh: a.category.nameZh,
            nameVi: a.category.nameVi,
            depreciationMonths: a.category.depreciationMonths,
          }
        : null,
      nameZh: a.nameZh,
      nameVi: a.nameVi,
      spec: a.spec,
      unit: a.unit,
      location: a.location,
      supplier: a.supplier,
      purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString().slice(0, 10) : null,
      unitPrice,
      qtyTotal: a.qtyTotal,
      qtyInUse: a.qtyInUse,
      qtyIdle: a.qtyIdle,
      qtyRepair: a.qtyRepair,
      qtyDisposed: a.qtyDisposed,
      originalValue: unitPrice * a.qtyTotal,
      netValue: netUnit * active,
      netUnit,
      warrantyUntil: a.warrantyUntil ? a.warrantyUntil.toISOString().slice(0, 10) : null,
      photo: a.photo,
      createdAt: a.createdAt.toISOString(),
      ...(opts?.withEvents ? { events: opts.events } : {}),
    };
  }

  private mapEvent(e: {
    id: bigint;
    assetId: bigint;
    type: AssetEventType;
    qty: number;
    amount: bigint;
    fromLocation: string | null;
    toLocation: string | null;
    reason: string | null;
    operatorId: bigint | null;
    happenedAt: Date;
    operator?: { id: bigint; displayName: string } | null;
  }) {
    return {
      id: e.id.toString(),
      assetId: e.assetId.toString(),
      type: e.type,
      qty: e.qty,
      amount: Number(e.amount),
      fromLocation: e.fromLocation,
      toLocation: e.toLocation,
      reason: e.reason,
      operatorId: e.operatorId?.toString() ?? null,
      operatorName: e.operator?.displayName ?? null,
      happenedAt: e.happenedAt.toISOString(),
    };
  }

  // ---------- categories ----------

  listCategories(storeId: string) {
    return this.prisma.assetCategory
      .findMany({
        where: { storeId: BigInt(storeId) },
        include: { _count: { select: { assets: true } } },
        orderBy: { id: 'asc' },
      })
      .then((rows) => rows.map((c) => this.mapCategory(c)));
  }

  async createCategory(storeId: string, dto: CreateAssetCategoryDto) {
    const row = await this.prisma.assetCategory.create({
      data: {
        storeId: BigInt(storeId),
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        depreciationMonths: dto.depreciationMonths ?? 36,
      },
      include: { _count: { select: { assets: true } } },
    });
    return this.mapCategory(row);
  }

  async updateCategory(storeId: string, id: string, dto: UpdateAssetCategoryDto) {
    const existing = await this.prisma.assetCategory.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('ASSET_CATEGORY_NOT_FOUND');
    const row = await this.prisma.assetCategory.update({
      where: { id: existing.id },
      data: {
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        depreciationMonths: dto.depreciationMonths,
      },
      include: { _count: { select: { assets: true } } },
    });
    return this.mapCategory(row);
  }

  async deleteCategory(storeId: string, id: string) {
    const existing = await this.prisma.assetCategory.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
      include: { _count: { select: { assets: true } } },
    });
    if (!existing) throw new BusinessError('ASSET_CATEGORY_NOT_FOUND');
    if (existing._count.assets > 0) throw new BusinessError('ASSET_CATEGORY_HAS_ASSETS');
    await this.prisma.assetCategory.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  // ---------- asset no ----------

  async nextAssetNo(tx: Tx, storeId: bigint, at = new Date()) {
    const ym = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `ZC-${ym}-`;
    const latest = await tx.asset.findFirst({
      where: { storeId, assetNo: { startsWith: prefix } },
      orderBy: { assetNo: 'desc' },
      select: { assetNo: true },
    });
    let seq = 1;
    if (latest) {
      const part = latest.assetNo.slice(prefix.length);
      const n = parseInt(part, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  // ---------- CRUD ----------

  async listAssets(storeId: string, query: AssetQueryDto) {
    const where: Prisma.AssetWhereInput = { storeId: BigInt(storeId) };
    if (query.categoryId) where.categoryId = BigInt(query.categoryId);
    if (query.location) where.location = { contains: query.location };
    if (query.keyword) {
      where.OR = [
        { nameZh: { contains: query.keyword } },
        { nameVi: { contains: query.keyword } },
        { assetNo: { contains: query.keyword } },
        { spec: { contains: query.keyword } },
      ];
    }
    if (query.status === 'in_use') where.qtyInUse = { gt: 0 };
    else if (query.status === 'idle') where.qtyIdle = { gt: 0 };
    else if (query.status === 'repair') where.qtyRepair = { gt: 0 };
    else if (query.status === 'disposed') where.qtyDisposed = { gt: 0 };

    const rows = await this.prisma.asset.findMany({
      where,
      include: { category: true },
      orderBy: { id: 'desc' },
    });
    return rows.map((a) => this.mapAsset(a));
  }

  async getAsset(storeId: string, id: string) {
    const row = await this.prisma.asset.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
      include: {
        category: true,
        events: {
          include: { operator: { select: { id: true, displayName: true } } },
          orderBy: { happenedAt: 'desc' },
        },
      },
    });
    if (!row) throw new BusinessError('ASSET_NOT_FOUND');
    return this.mapAsset(row, {
      withEvents: true,
      events: row.events.map((e) => this.mapEvent(e)),
    });
  }

  async createAsset(storeId: string, operatorId: string | undefined, dto: CreateAssetDto) {
    const cat = await this.prisma.assetCategory.findFirst({
      where: { id: BigInt(dto.categoryId), storeId: BigInt(storeId) },
    });
    if (!cat) throw new BusinessError('ASSET_CATEGORY_NOT_FOUND');

    const qty = dto.qty ?? 0;
    let warrantyUntil: Date | null = null;
    if (dto.warrantyUntil) warrantyUntil = new Date(dto.warrantyUntil);
    else if (dto.warrantyMonths && dto.purchaseDate) {
      const d = new Date(dto.purchaseDate);
      d.setMonth(d.getMonth() + dto.warrantyMonths);
      warrantyUntil = d;
    }

    return this.prisma.$transaction(async (tx) => {
      const assetNo = await this.nextAssetNo(tx, BigInt(storeId));
      const row = await tx.asset.create({
        data: {
          storeId: BigInt(storeId),
          assetNo,
          categoryId: cat.id,
          nameZh: dto.nameZh,
          nameVi: dto.nameVi,
          spec: dto.spec,
          unit: dto.unit || '个',
          location: dto.location,
          supplier: dto.supplier,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          unitPrice: BigInt(Math.floor(dto.unitPrice)),
          qtyTotal: qty,
          qtyIdle: qty,
          qtyInUse: 0,
          qtyRepair: 0,
          qtyDisposed: 0,
          warrantyUntil,
          photo: dto.photo,
        },
        include: { category: true },
      });
      if (qty > 0) {
        await tx.assetEvent.create({
          data: {
            assetId: row.id,
            type: AssetEventType.in,
            qty,
            amount: BigInt(Math.floor(dto.unitPrice)) * BigInt(qty),
            toLocation: dto.location,
            operatorId: operatorId ? BigInt(operatorId) : null,
            reason: '初始入库',
          },
        });
      }
      return this.mapAsset(row);
    });
  }

  async updateAsset(storeId: string, id: string, dto: UpdateAssetDto) {
    const existing = await this.prisma.asset.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('ASSET_NOT_FOUND');
    if (dto.categoryId) {
      const cat = await this.prisma.assetCategory.findFirst({
        where: { id: BigInt(dto.categoryId), storeId: BigInt(storeId) },
      });
      if (!cat) throw new BusinessError('ASSET_CATEGORY_NOT_FOUND');
    }
    const row = await this.prisma.asset.update({
      where: { id: existing.id },
      data: {
        categoryId: dto.categoryId ? BigInt(dto.categoryId) : undefined,
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        spec: dto.spec === undefined ? undefined : dto.spec,
        unit: dto.unit,
        location: dto.location === undefined ? undefined : dto.location,
        supplier: dto.supplier === undefined ? undefined : dto.supplier,
        purchaseDate:
          dto.purchaseDate === undefined
            ? undefined
            : dto.purchaseDate
              ? new Date(dto.purchaseDate)
              : null,
        unitPrice: dto.unitPrice === undefined ? undefined : BigInt(Math.floor(dto.unitPrice)),
        warrantyUntil:
          dto.warrantyUntil === undefined
            ? undefined
            : dto.warrantyUntil
              ? new Date(dto.warrantyUntil)
              : null,
        photo: dto.photo === undefined ? undefined : dto.photo,
      },
      include: { category: true },
    });
    return this.mapAsset(row);
  }

  // ---------- events ----------

  private async lockAsset(tx: Tx, storeId: string, assetId: string) {
    const rows = await tx.$queryRaw<
      {
        id: bigint;
        store_id: bigint;
        location: string | null;
        qty_total: number;
        qty_in_use: number;
        qty_idle: number;
        qty_repair: number;
        qty_disposed: number;
        unit_price: bigint;
      }[]
    >`SELECT id, store_id, location, qty_total, qty_in_use, qty_idle, qty_repair, qty_disposed, unit_price
      FROM assets WHERE id = ${BigInt(assetId)} AND store_id = ${BigInt(storeId)} FOR UPDATE`;
    if (!rows.length) throw new BusinessError('ASSET_NOT_FOUND');
    const r = rows[0];
    return {
      id: r.id,
      storeId: r.store_id,
      location: r.location,
      qtyTotal: r.qty_total,
      qtyInUse: r.qty_in_use,
      qtyIdle: r.qty_idle,
      qtyRepair: r.qty_repair,
      qtyDisposed: r.qty_disposed,
      unitPrice: r.unit_price,
    };
  }

  private async applyQty(tx: Tx, assetId: bigint, next: QtyState) {
    assertQtyBalance(next);
    await tx.asset.update({
      where: { id: assetId },
      data: {
        qtyTotal: next.qtyTotal,
        qtyInUse: next.qtyInUse,
        qtyIdle: next.qtyIdle,
        qtyRepair: next.qtyRepair,
        qtyDisposed: next.qtyDisposed,
      },
    });
  }

  private takeFromPool(q: QtyState, pool: 'in_use' | 'idle' | 'repair', qty: number): QtyState {
    const next = { ...q };
    if (pool === 'in_use') {
      if (next.qtyInUse < qty) throw new BusinessError('ASSET_QTY_INSUFFICIENT');
      next.qtyInUse -= qty;
    } else if (pool === 'idle') {
      if (next.qtyIdle < qty) throw new BusinessError('ASSET_QTY_INSUFFICIENT');
      next.qtyIdle -= qty;
    } else {
      if (next.qtyRepair < qty) throw new BusinessError('ASSET_QTY_INSUFFICIENT');
      next.qtyRepair -= qty;
    }
    return next;
  }

  private resolvePool(
    q: QtyState,
    preferred: 'in_use' | 'idle' | 'repair' | undefined,
    qty: number,
    allow: Array<'in_use' | 'idle' | 'repair'>,
  ): 'in_use' | 'idle' | 'repair' {
    if (preferred) {
      if (!allow.includes(preferred)) throw new BusinessError('ASSET_INVALID_POOL');
      return preferred;
    }
    for (const p of allow) {
      const avail = p === 'in_use' ? q.qtyInUse : p === 'idle' ? q.qtyIdle : q.qtyRepair;
      if (avail >= qty) return p;
    }
    throw new BusinessError('ASSET_QTY_INSUFFICIENT');
  }

  private async reloadMapped(storeId: string, id: bigint) {
    const row = await this.prisma.asset.findFirst({
      where: { id, storeId: BigInt(storeId) },
      include: { category: true },
    });
    if (!row) throw new BusinessError('ASSET_NOT_FOUND');
    return this.mapAsset(row);
  }

  async eventIn(storeId: string, assetId: string, operatorId: string | undefined, dto: AssetEventQtyDto) {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, storeId, assetId);
      const next: QtyState = {
        qtyTotal: a.qtyTotal + dto.qty,
        qtyInUse: a.qtyInUse,
        qtyIdle: a.qtyIdle + dto.qty,
        qtyRepair: a.qtyRepair,
        qtyDisposed: a.qtyDisposed,
      };
      await this.applyQty(tx, a.id, next);
      await tx.assetEvent.create({
        data: {
          assetId: a.id,
          type: AssetEventType.in,
          qty: dto.qty,
          amount: BigInt(Math.floor(dto.amount ?? Number(a.unitPrice) * dto.qty)),
          toLocation: dto.toLocation ?? a.location,
          reason: dto.reason,
          operatorId: operatorId ? BigInt(operatorId) : null,
          happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : undefined,
        },
      });
      if (dto.toLocation) {
        await tx.asset.update({ where: { id: a.id }, data: { location: dto.toLocation } });
      }
    });
    return this.reloadMapped(storeId, BigInt(assetId));
  }

  async eventAssign(
    storeId: string,
    assetId: string,
    operatorId: string | undefined,
    dto: AssetEventQtyDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, storeId, assetId);
      if (a.qtyIdle < dto.qty) throw new BusinessError('ASSET_QTY_INSUFFICIENT');
      const next: QtyState = {
        ...a,
        qtyIdle: a.qtyIdle - dto.qty,
        qtyInUse: a.qtyInUse + dto.qty,
      };
      await this.applyQty(tx, a.id, next);
      await tx.assetEvent.create({
        data: {
          assetId: a.id,
          type: AssetEventType.assign,
          qty: dto.qty,
          fromLocation: a.location,
          toLocation: dto.toLocation ?? a.location,
          reason: dto.reason,
          operatorId: operatorId ? BigInt(operatorId) : null,
          happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : undefined,
        },
      });
    });
    const mapped = await this.reloadMapped(storeId, BigInt(assetId));
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'asset',
      action: 'asset.assign',
      targetType: 'asset',
      targetId: assetId,
      after: { qty: dto.qty, toLocation: dto.toLocation, reason: dto.reason },
    });
    return mapped;
  }

  async eventTransfer(
    storeId: string,
    assetId: string,
    operatorId: string | undefined,
    dto: TransferAssetDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, storeId, assetId);
      const qty = dto.qty ?? sumActive(a);
      if (qty <= 0) throw new BusinessError('ASSET_QTY_INSUFFICIENT');
      await tx.asset.update({ where: { id: a.id }, data: { location: dto.toLocation } });
      await tx.assetEvent.create({
        data: {
          assetId: a.id,
          type: AssetEventType.transfer,
          qty,
          fromLocation: a.location,
          toLocation: dto.toLocation,
          reason: dto.reason,
          operatorId: operatorId ? BigInt(operatorId) : null,
          happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : undefined,
        },
      });
    });
    const mapped = await this.reloadMapped(storeId, BigInt(assetId));
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'asset',
      action: 'asset.transfer',
      targetType: 'asset',
      targetId: assetId,
      after: { qty: dto.qty, toLocation: dto.toLocation, reason: dto.reason },
    });
    return mapped;
  }

  async eventRepair(
    storeId: string,
    assetId: string,
    operatorId: string | undefined,
    dto: AssetEventQtyDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, storeId, assetId);
      const pool = this.resolvePool(a, dto.fromPool, dto.qty, ['in_use', 'idle']);
      let next = this.takeFromPool(a, pool, dto.qty);
      next = { ...next, qtyRepair: next.qtyRepair + dto.qty };
      await this.applyQty(tx, a.id, next);
      await tx.assetEvent.create({
        data: {
          assetId: a.id,
          type: AssetEventType.repair,
          qty: dto.qty,
          amount: BigInt(Math.floor(dto.amount ?? 0)),
          fromLocation: a.location,
          reason: dto.reason ?? `from:${pool}`,
          operatorId: operatorId ? BigInt(operatorId) : null,
          happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : undefined,
        },
      });
    });
    return this.reloadMapped(storeId, BigInt(assetId));
  }

  async eventRepairDone(
    storeId: string,
    assetId: string,
    operatorId: string | undefined,
    dto: AssetEventQtyDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, storeId, assetId);
      if (a.qtyRepair < dto.qty) throw new BusinessError('ASSET_QTY_INSUFFICIENT');
      const next: QtyState = {
        ...a,
        qtyRepair: a.qtyRepair - dto.qty,
        qtyIdle: a.qtyIdle + dto.qty,
      };
      await this.applyQty(tx, a.id, next);
      await tx.assetEvent.create({
        data: {
          assetId: a.id,
          type: AssetEventType.repair_done,
          qty: dto.qty,
          amount: BigInt(Math.floor(dto.amount ?? 0)),
          reason: dto.reason,
          operatorId: operatorId ? BigInt(operatorId) : null,
          happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : undefined,
        },
      });
    });
    return this.reloadMapped(storeId, BigInt(assetId));
  }

  async eventScrap(
    storeId: string,
    assetId: string,
    operatorId: string | undefined,
    dto: AssetEventQtyDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, storeId, assetId);
      const pool = this.resolvePool(a, dto.fromPool, dto.qty, ['in_use', 'idle', 'repair']);
      let next = this.takeFromPool(a, pool, dto.qty);
      next = { ...next, qtyDisposed: next.qtyDisposed + dto.qty };
      await this.applyQty(tx, a.id, next);
      const loss = Math.floor(dto.amount ?? Number(a.unitPrice) * dto.qty);
      await tx.assetEvent.create({
        data: {
          assetId: a.id,
          type: AssetEventType.scrap,
          qty: dto.qty,
          amount: BigInt(loss),
          reason: dto.reason ?? `from:${pool}`,
          operatorId: operatorId ? BigInt(operatorId) : null,
          happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : undefined,
        },
      });
    });
    const mapped = await this.reloadMapped(storeId, BigInt(assetId));
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'asset',
      action: 'asset.scrap',
      targetType: 'asset',
      targetId: assetId,
      after: { qty: dto.qty, amount: dto.amount, reason: dto.reason },
    });
    return mapped;
  }

  async eventSell(
    storeId: string,
    assetId: string,
    operatorId: string | undefined,
    dto: AssetEventQtyDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, storeId, assetId);
      const pool = this.resolvePool(a, dto.fromPool, dto.qty, ['in_use', 'idle', 'repair']);
      let next = this.takeFromPool(a, pool, dto.qty);
      next = { ...next, qtyDisposed: next.qtyDisposed + dto.qty };
      await this.applyQty(tx, a.id, next);
      await tx.assetEvent.create({
        data: {
          assetId: a.id,
          type: AssetEventType.sell,
          qty: dto.qty,
          amount: BigInt(Math.floor(dto.amount ?? 0)),
          reason: dto.reason ?? `from:${pool}`,
          operatorId: operatorId ? BigInt(operatorId) : null,
          happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : undefined,
        },
      });
    });
    const mapped = await this.reloadMapped(storeId, BigInt(assetId));
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'asset',
      action: 'asset.sell',
      targetType: 'asset',
      targetId: assetId,
      after: { qty: dto.qty, amount: dto.amount, reason: dto.reason },
    });
    return mapped;
  }

  async eventCheck(
    storeId: string,
    assetId: string,
    operatorId: string | undefined,
    dto: CheckAssetDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const a = await this.lockAsset(tx, storeId, assetId);
      const next: QtyState = {
        qtyInUse: dto.actualInUse ?? a.qtyInUse,
        qtyIdle: dto.actualIdle ?? a.qtyIdle,
        qtyRepair: dto.actualRepair ?? a.qtyRepair,
        qtyDisposed: a.qtyDisposed,
        qtyTotal: 0,
      };
      next.qtyTotal = next.qtyInUse + next.qtyIdle + next.qtyRepair + next.qtyDisposed;
      await this.applyQty(tx, a.id, next);
      const delta =
        next.qtyInUse +
        next.qtyIdle +
        next.qtyRepair -
        (a.qtyInUse + a.qtyIdle + a.qtyRepair);
      await tx.assetEvent.create({
        data: {
          assetId: a.id,
          type: AssetEventType.check,
          qty: Math.abs(delta),
          reason:
            dto.reason ||
            `盘点 Δ=${delta} inUse=${next.qtyInUse} idle=${next.qtyIdle} repair=${next.qtyRepair}`,
          operatorId: operatorId ? BigInt(operatorId) : null,
          happenedAt: dto.happenedAt ? new Date(dto.happenedAt) : undefined,
        },
      });
    });
    const mapped = await this.reloadMapped(storeId, BigInt(assetId));
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'asset',
      action: 'asset.check',
      targetType: 'asset',
      targetId: assetId,
      after: {
        actualInUse: dto.actualInUse,
        actualIdle: dto.actualIdle,
        actualRepair: dto.actualRepair,
        reason: dto.reason,
      },
    });
    return mapped;
  }

  // ---------- report ----------

  async report(storeId: string) {
    const sid = BigInt(storeId);
    const assets = await this.prisma.asset.findMany({
      where: { storeId: sid },
      include: { category: true },
    });

    const byCategory = new Map<
      string,
      {
        categoryId: string;
        nameZh: string;
        nameVi: string;
        qtyTotal: number;
        qtyActive: number;
        originalValue: number;
        netValue: number;
      }
    >();

    let originalValue = 0;
    let netValue = 0;
    for (const a of assets) {
      const mapped = this.mapAsset(a);
      originalValue += mapped.originalValue;
      netValue += mapped.netValue;
      const key = a.categoryId.toString();
      const cur = byCategory.get(key) ?? {
        categoryId: key,
        nameZh: a.category.nameZh,
        nameVi: a.category.nameVi,
        qtyTotal: 0,
        qtyActive: 0,
        originalValue: 0,
        netValue: 0,
      };
      cur.qtyTotal += a.qtyTotal;
      cur.qtyActive += a.qtyInUse + a.qtyIdle + a.qtyRepair;
      cur.originalValue += mapped.originalValue;
      cur.netValue += mapped.netValue;
      byCategory.set(key, cur);
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEvents = await this.prisma.assetEvent.findMany({
      where: {
        happenedAt: { gte: monthStart },
        asset: { storeId: sid },
        type: { in: [AssetEventType.repair, AssetEventType.scrap, AssetEventType.sell] },
      },
    });

    let repairCost = 0;
    let scrapLoss = 0;
    let sellIncome = 0;
    for (const e of monthEvents) {
      const amt = Number(e.amount);
      if (e.type === AssetEventType.repair) repairCost += amt;
      else if (e.type === AssetEventType.scrap) scrapLoss += amt;
      else if (e.type === AssetEventType.sell) sellIncome += amt;
    }

    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    const warrantyExpiring = assets
      .filter(
        (a) =>
          a.warrantyUntil &&
          a.warrantyUntil >= now &&
          a.warrantyUntil <= in30 &&
          a.qtyInUse + a.qtyIdle + a.qtyRepair > 0,
      )
      .map((a) => this.mapAsset(a));

    return {
      summary: {
        assetCount: assets.length,
        originalValue,
        netValue,
        repairCostMonth: repairCost,
        scrapLossMonth: scrapLoss,
        sellIncomeMonth: sellIncome,
      },
      byCategory: [...byCategory.values()],
      warrantyExpiring,
    };
  }

  // ---------- excel ----------

  async exportExcel(storeId: string): Promise<Buffer> {
    const list = await this.listAssets(storeId, {});
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('assets');
    ws.columns = [
      { header: '资产编号', key: 'assetNo', width: 18 },
      { header: '分类中文', key: 'catZh', width: 14 },
      { header: '分类越南', key: 'catVi', width: 14 },
      { header: '名称中文', key: 'nameZh', width: 16 },
      { header: '名称越南', key: 'nameVi', width: 16 },
      { header: '规格', key: 'spec', width: 14 },
      { header: '单位', key: 'unit', width: 8 },
      { header: '位置', key: 'location', width: 14 },
      { header: '供应商', key: 'supplier', width: 14 },
      { header: '购入日期', key: 'purchaseDate', width: 12 },
      { header: '单价', key: 'unitPrice', width: 12 },
      { header: '总数', key: 'qtyTotal', width: 8 },
      { header: '在用', key: 'qtyInUse', width: 8 },
      { header: '闲置', key: 'qtyIdle', width: 8 },
      { header: '维修中', key: 'qtyRepair', width: 8 },
      { header: '已处置', key: 'qtyDisposed', width: 8 },
      { header: '原值', key: 'originalValue', width: 12 },
      { header: '净值', key: 'netValue', width: 12 },
      { header: '保修至', key: 'warrantyUntil', width: 12 },
    ];
    for (const a of list) {
      ws.addRow({
        assetNo: a.assetNo,
        catZh: a.category?.nameZh,
        catVi: a.category?.nameVi,
        nameZh: a.nameZh,
        nameVi: a.nameVi,
        spec: a.spec,
        unit: a.unit,
        location: a.location,
        supplier: a.supplier,
        purchaseDate: a.purchaseDate,
        unitPrice: a.unitPrice,
        qtyTotal: a.qtyTotal,
        qtyInUse: a.qtyInUse,
        qtyIdle: a.qtyIdle,
        qtyRepair: a.qtyRepair,
        qtyDisposed: a.qtyDisposed,
        originalValue: a.originalValue,
        netValue: a.netValue,
        warrantyUntil: a.warrantyUntil,
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async importExcel(storeId: string, operatorId: string | undefined, file: Buffer) {
    const wb = new ExcelJS.Workbook();
    // exceljs 接受 Buffer
    await wb.xlsx.load(file as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BusinessError('ASSET_IMPORT_EMPTY');

    const cats = await this.prisma.assetCategory.findMany({
      where: { storeId: BigInt(storeId) },
    });
    const catByZh = new Map(cats.map((c) => [c.nameZh, c]));

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      headers[col] = String(cell.value ?? '').trim();
    });

    const col = (name: string) => headers.findIndex((h) => h === name);

    const iCat = col('分类中文');
    const iNameZh = col('名称中文');
    const iNameVi = col('名称越南');
    const iSpec = col('规格');
    const iUnit = col('单位');
    const iLoc = col('位置');
    const iSup = col('供应商');
    const iDate = col('购入日期');
    const iPrice = col('单价');
    const iQty = col('入库数量');
    const iWar = col('保修月数');

    if (iCat < 0 || iNameZh < 0 || iNameVi < 0 || iPrice < 0) {
      throw new BusinessError('ASSET_IMPORT_HEADER');
    }

    let created = 0;
    const errors: string[] = [];

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nameZh = String(row.getCell(iNameZh).value ?? '').trim();
      if (!nameZh) continue;
      try {
        const catName = String(row.getCell(iCat).value ?? '').trim();
        let cat = catByZh.get(catName);
        if (!cat) {
          cat = await this.prisma.assetCategory.create({
            data: {
              storeId: BigInt(storeId),
              nameZh: catName || '未分类',
              nameVi: catName || 'Chưa phân loại',
              depreciationMonths: 36,
            },
          });
          catByZh.set(cat.nameZh, cat);
        }
        const cellDate = row.getCell(iDate).value;
        let purchaseDate: string | undefined;
        if (cellDate instanceof Date) purchaseDate = cellDate.toISOString().slice(0, 10);
        else if (cellDate) purchaseDate = String(cellDate).slice(0, 10);

        const priceRaw = row.getCell(iPrice).value;
        const unitPrice = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
        const qtyRaw = iQty > 0 ? row.getCell(iQty).value : 0;
        const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw || 0);
        const warRaw = iWar > 0 ? row.getCell(iWar).value : undefined;
        const warrantyMonths =
          warRaw === undefined || warRaw === null || warRaw === ''
            ? undefined
            : Number(warRaw);

        await this.createAsset(storeId, operatorId, {
          categoryId: cat.id.toString(),
          nameZh,
          nameVi: String(row.getCell(iNameVi).value ?? nameZh).trim(),
          spec: iSpec > 0 ? String(row.getCell(iSpec).value ?? '').trim() || undefined : undefined,
          unit: iUnit > 0 ? String(row.getCell(iUnit).value ?? '个').trim() || '个' : '个',
          location: iLoc > 0 ? String(row.getCell(iLoc).value ?? '').trim() || undefined : undefined,
          supplier: iSup > 0 ? String(row.getCell(iSup).value ?? '').trim() || undefined : undefined,
          purchaseDate,
          unitPrice: Math.floor(unitPrice || 0),
          qty: Math.max(0, Math.floor(qty || 0)),
          warrantyMonths:
            warrantyMonths !== undefined && !Number.isNaN(warrantyMonths)
              ? Math.floor(warrantyMonths)
              : undefined,
        });
        created += 1;
      } catch (e) {
        errors.push(`行${r}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { created, errors };
  }

  /** 打印资产二维码标签 PDF（内容为资产编号） */
  async labelPdf(storeId: string, ids: string[]): Promise<Buffer> {
    const assets = await this.prisma.asset.findMany({
      where: { storeId: BigInt(storeId), id: { in: ids.map((id) => BigInt(id)) } },
    });
    if (!assets.length) throw new BusinessError('ASSET_NOT_FOUND');

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    let i = 0;
    for (const a of assets) {
      if (i > 0 && i % 8 === 0) doc.addPage();
      const col = i % 2;
      const row = Math.floor((i % 8) / 2);
      const x = 36 + col * 270;
      const y = 36 + row * 180;
      const png = await QRCode.toBuffer(a.assetNo, { width: 120, margin: 1 });
      doc.image(png, x, y, { width: 100 });
      doc.fontSize(12).text(a.assetNo, x + 110, y + 10, { width: 140 });
      doc.fontSize(10).text(a.nameZh, x + 110, y + 32, { width: 140 });
      doc.text(a.nameVi, x + 110, y + 48, { width: 140 });
      if (a.location) doc.text(a.location, x + 110, y + 64, { width: 140 });
      i += 1;
    }
    doc.end();
    return done;
  }
}
