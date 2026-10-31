import { Injectable } from '@nestjs/common';
import { Prisma, StocktakeStatus } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { todayBusinessDate } from '../report/business-day.util';
import {
  CreateIngredientDto,
  CreatePurchaseDto,
  CreateStocktakeDto,
  CreateSupplierDto,
  UpdateIngredientDto,
  UpdateSupplierDto,
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async cutHour(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: BigInt(storeId) },
      select: { businessDayCutHour: true },
    });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    return store.businessDayCutHour ?? 4;
  }

  private async bizDate(storeId: string, date?: string) {
    if (date) return date;
    const cut = await this.cutHour(storeId);
    return todayBusinessDate(cut);
  }

  private mapIngredient(r: {
    id: bigint;
    nameZh: string;
    nameVi: string;
    kind: string;
    unit: string;
    stockQty: Prisma.Decimal;
    lastCost: bigint;
    isActive: boolean;
  }) {
    return {
      id: r.id.toString(),
      nameZh: r.nameZh,
      nameVi: r.nameVi,
      kind: r.kind,
      unit: r.unit,
      stockQty: Number(r.stockQty),
      lastCost: Number(r.lastCost),
      stockValue: Math.floor(Number(r.stockQty) * Number(r.lastCost)),
      isActive: r.isActive,
    };
  }

  private mapSupplier(r: {
    id: bigint;
    nameZh: string;
    nameVi: string;
    contactName: string | null;
    phone: string | null;
    address: string | null;
    note: string | null;
    isActive: boolean;
  }) {
    return {
      id: r.id.toString(),
      nameZh: r.nameZh,
      nameVi: r.nameVi,
      contactName: r.contactName,
      phone: r.phone,
      address: r.address,
      note: r.note,
      isActive: r.isActive,
    };
  }

  listSuppliers(storeId: string, activeOnly = false) {
    return this.prisma.supplier
      .findMany({
        where: {
          storeId: BigInt(storeId),
          ...(activeOnly ? { isActive: true } : {}),
        },
        orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
      })
      .then((rows) => rows.map((r) => this.mapSupplier(r)));
  }

  async createSupplier(storeId: string, dto: CreateSupplierDto) {
    const row = await this.prisma.supplier.create({
      data: {
        storeId: BigInt(storeId),
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        contactName: dto.contactName,
        phone: dto.phone,
        address: dto.address,
        note: dto.note,
      },
    });
    return this.mapSupplier(row);
  }

  async updateSupplier(storeId: string, id: string, dto: UpdateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('SUPPLIER_NOT_FOUND');
    const row = await this.prisma.supplier.update({
      where: { id: existing.id },
      data: {
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        contactName: dto.contactName,
        phone: dto.phone,
        address: dto.address,
        note: dto.note,
        isActive: dto.isActive,
      },
    });
    return this.mapSupplier(row);
  }

  listIngredients(storeId: string, kind?: string) {
    return this.prisma.ingredient
      .findMany({
        where: {
          storeId: BigInt(storeId),
          ...(kind ? { kind: kind as never } : {}),
        },
        orderBy: [{ kind: 'asc' }, { id: 'asc' }],
      })
      .then((rows) => rows.map((r) => this.mapIngredient(r)));
  }

  async createIngredient(storeId: string, dto: CreateIngredientDto) {
    const row = await this.prisma.ingredient.create({
      data: {
        storeId: BigInt(storeId),
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        kind: dto.kind ?? 'vegetable',
        unit: dto.unit || 'kg',
        stockQty: dto.stockQty ?? 0,
        lastCost: BigInt(Math.floor(dto.lastCost ?? 0)),
      },
    });
    return this.mapIngredient(row);
  }

  async updateIngredient(storeId: string, id: string, dto: UpdateIngredientDto) {
    const existing = await this.prisma.ingredient.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('INGREDIENT_NOT_FOUND');
    const row = await this.prisma.ingredient.update({
      where: { id: existing.id },
      data: {
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        kind: dto.kind,
        unit: dto.unit,
        isActive: dto.isActive,
      },
    });
    return this.mapIngredient(row);
  }

  async listPurchases(storeId: string, date?: string) {
    const businessDate = await this.bizDate(storeId, date);
    const rows = await this.prisma.purchase.findMany({
      where: { storeId: BigInt(storeId), businessDate: new Date(businessDate) },
      include: {
        items: { include: { ingredient: true } },
        operator: { select: { displayName: true } },
        supplierRel: true,
      },
      orderBy: { id: 'desc' },
    });
    return {
      businessDate,
      list: rows.map((p) => ({
        id: p.id.toString(),
        businessDate,
        supplierId: p.supplierId?.toString() ?? null,
        supplier: p.supplier ?? p.supplierRel?.nameZh ?? null,
        supplierNameZh: p.supplierRel?.nameZh ?? p.supplier,
        supplierNameVi: p.supplierRel?.nameVi ?? p.supplier,
        note: p.note,
        totalAmount: Number(p.totalAmount),
        operatorName: p.operator?.displayName ?? null,
        createdAt: p.createdAt.toISOString(),
        items: p.items.map((it) => ({
          ingredientId: it.ingredientId.toString(),
          nameZh: it.ingredient.nameZh,
          nameVi: it.ingredient.nameVi,
          unit: it.ingredient.unit,
          qty: Number(it.qty),
          unitPrice: Number(it.unitPrice),
          amount: Number(it.amount),
        })),
      })),
    };
  }

  async createPurchase(storeId: string, operatorId: string | undefined, dto: CreatePurchaseDto) {
    const businessDate = await this.bizDate(storeId, dto.businessDate);
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: BigInt(dto.supplierId),
        storeId: BigInt(storeId),
        isActive: true,
      },
    });
    if (!supplier) throw new BusinessError('SUPPLIER_NOT_FOUND');

    const ingredientIds = dto.items.map((i) => BigInt(i.ingredientId));
    const ings = await this.prisma.ingredient.findMany({
      where: { storeId: BigInt(storeId), id: { in: ingredientIds } },
    });
    if (ings.length !== ingredientIds.length) throw new BusinessError('INGREDIENT_NOT_FOUND');

    const result = await this.prisma.$transaction(async (tx) => {
      let total = 0n;
      const lineData: {
        ingredientId: bigint;
        qty: number;
        unitPrice: bigint;
        amount: bigint;
      }[] = [];

      for (const line of dto.items) {
        const unitPrice = BigInt(Math.floor(line.unitPrice));
        const amount = BigInt(Math.floor(line.unitPrice * line.qty));
        total += amount;
        lineData.push({
          ingredientId: BigInt(line.ingredientId),
          qty: line.qty,
          unitPrice,
          amount,
        });
      }

      const purchase = await tx.purchase.create({
        data: {
          storeId: BigInt(storeId),
          businessDate: new Date(businessDate),
          supplierId: supplier.id,
          supplier: supplier.nameZh,
          note: dto.note,
          totalAmount: total,
          operatorId: operatorId ? BigInt(operatorId) : null,
          items: {
            create: lineData.map((l) => ({
              ingredientId: l.ingredientId,
              qty: l.qty,
              unitPrice: l.unitPrice,
              amount: l.amount,
            })),
          },
        },
        include: { items: { include: { ingredient: true } }, operator: true },
      });

      for (const l of lineData) {
        await tx.ingredient.update({
          where: { id: l.ingredientId },
          data: {
            stockQty: { increment: l.qty },
            lastCost: l.unitPrice,
          },
        });
      }

      return {
        id: purchase.id.toString(),
        businessDate,
        totalAmount: Number(purchase.totalAmount),
        supplierId: purchase.supplierId?.toString() ?? null,
        supplier: purchase.supplier,
        note: purchase.note,
      };
    });

    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'inventory',
      action: 'purchase.create',
      targetType: 'purchase',
      targetId: result.id,
      after: {
        businessDate: result.businessDate,
        totalAmount: result.totalAmount,
        supplierId: result.supplierId,
        itemCount: dto.items.length,
      },
    });
    return result;
  }

  /** 盘点草稿预填：期初=当前库存-当日进货，进货=当日合计 */
  async previewStocktake(storeId: string, date?: string) {
    const businessDate = await this.bizDate(storeId, date);
    const ingredients = await this.prisma.ingredient.findMany({
      where: { storeId: BigInt(storeId), isActive: true },
      orderBy: [{ kind: 'asc' }, { id: 'asc' }],
    });
    const purchaseAgg = await this.prisma.purchaseItem.groupBy({
      by: ['ingredientId'],
      where: {
        purchase: { storeId: BigInt(storeId), businessDate: new Date(businessDate) },
      },
      _sum: { qty: true },
    });
    const purchasedMap = new Map(
      purchaseAgg.map((x) => [x.ingredientId.toString(), Number(x._sum.qty ?? 0)]),
    );

    return {
      businessDate,
      items: ingredients.map((ing) => {
        const purchasedQty = purchasedMap.get(ing.id.toString()) || 0;
        const stock = Number(ing.stockQty);
        const openingQty = Math.max(0, Number((stock - purchasedQty).toFixed(3)));
        return {
          ingredientId: ing.id.toString(),
          nameZh: ing.nameZh,
          nameVi: ing.nameVi,
          kind: ing.kind,
          unit: ing.unit,
          openingQty,
          purchasedQty,
          stockQty: stock,
          lastCost: Number(ing.lastCost),
          countedQty: stock,
          suggestedConsumption: Math.max(0, Number((openingQty + purchasedQty - stock).toFixed(3))),
        };
      }),
    };
  }

  async createAndConfirmStocktake(
    storeId: string,
    operatorId: string | undefined,
    dto: CreateStocktakeDto,
  ) {
    const businessDate = await this.bizDate(storeId, dto.businessDate);
    const existing = await this.prisma.stocktake.findUnique({
      where: {
        storeId_businessDate: {
          storeId: BigInt(storeId),
          businessDate: new Date(businessDate),
        },
      },
    });
    if (existing?.status === StocktakeStatus.confirmed) {
      throw new BusinessError('STOCKTAKE_ALREADY_CONFIRMED');
    }

    const preview = await this.previewStocktake(storeId, businessDate);
    const countMap = new Map(dto.items.map((i) => [i.ingredientId, i.countedQty]));

    const result = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.stocktakeItem.deleteMany({ where: { stocktakeId: existing.id } });
        await tx.stocktake.delete({ where: { id: existing.id } });
      }

      const lines = preview.items.map((p) => {
        const counted = countMap.has(p.ingredientId)
          ? Number(countMap.get(p.ingredientId))
          : p.stockQty;
        const consumption = Math.max(
          0,
          Number((p.openingQty + p.purchasedQty - counted).toFixed(3)),
        );
        const unitCost = p.lastCost;
        return {
          ingredientId: BigInt(p.ingredientId),
          openingQty: p.openingQty,
          purchasedQty: p.purchasedQty,
          countedQty: counted,
          consumptionQty: consumption,
          unitCost: BigInt(unitCost),
          consumptionAmount: BigInt(Math.floor(consumption * unitCost)),
        };
      });

      const row = await tx.stocktake.create({
        data: {
          storeId: BigInt(storeId),
          businessDate: new Date(businessDate),
          status: StocktakeStatus.confirmed,
          note: dto.note,
          operatorId: operatorId ? BigInt(operatorId) : null,
          confirmedAt: new Date(),
          items: { create: lines },
        },
        include: { items: { include: { ingredient: true } } },
      });

      for (const l of lines) {
        await tx.ingredient.update({
          where: { id: l.ingredientId },
          data: { stockQty: l.countedQty },
        });
      }

      return this.mapStocktake(row, businessDate);
    });

    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'inventory',
      action: 'stocktake.confirm',
      targetType: 'stocktake',
      targetId: result.id,
      after: {
        businessDate: result.businessDate,
        totalConsumptionAmount: result.totalConsumptionAmount,
        itemCount: result.items.length,
      },
    });
    return result;
  }

  private mapStocktake(
    row: {
      id: bigint;
      status: string;
      note: string | null;
      confirmedAt: Date | null;
      items: {
        ingredientId: bigint;
        openingQty: Prisma.Decimal;
        purchasedQty: Prisma.Decimal;
        countedQty: Prisma.Decimal;
        consumptionQty: Prisma.Decimal;
        unitCost: bigint;
        consumptionAmount: bigint;
        ingredient: { nameZh: string; nameVi: string; unit: string; kind: string };
      }[];
    },
    businessDate: string,
  ) {
    return {
      id: row.id.toString(),
      businessDate,
      status: row.status,
      note: row.note,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      totalConsumptionAmount: row.items.reduce((s, i) => s + Number(i.consumptionAmount), 0),
      items: row.items.map((it) => ({
        ingredientId: it.ingredientId.toString(),
        nameZh: it.ingredient.nameZh,
        nameVi: it.ingredient.nameVi,
        kind: it.ingredient.kind,
        unit: it.ingredient.unit,
        openingQty: Number(it.openingQty),
        purchasedQty: Number(it.purchasedQty),
        countedQty: Number(it.countedQty),
        consumptionQty: Number(it.consumptionQty),
        unitCost: Number(it.unitCost),
        consumptionAmount: Number(it.consumptionAmount),
      })),
    };
  }

  async getDailyConsumption(storeId: string, date?: string) {
    const businessDate = await this.bizDate(storeId, date);
    const take = await this.prisma.stocktake.findUnique({
      where: {
        storeId_businessDate: {
          storeId: BigInt(storeId),
          businessDate: new Date(businessDate),
        },
      },
      include: { items: { include: { ingredient: true } } },
    });
    const purchases = await this.listPurchases(storeId, businessDate);
    if (!take) {
      return {
        businessDate,
        stocktake: null,
        purchases: purchases.list,
        purchaseTotal: purchases.list.reduce((s, p) => s + p.totalAmount, 0),
      };
    }
    return {
      businessDate,
      stocktake: this.mapStocktake(take, businessDate),
      purchases: purchases.list,
      purchaseTotal: purchases.list.reduce((s, p) => s + p.totalAmount, 0),
    };
  }
}
