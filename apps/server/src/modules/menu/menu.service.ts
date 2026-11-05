import { Injectable } from '@nestjs/common';
import { DishStatus, Prisma } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import {
  BatchPriceDto,
  BatchSoldOutDto,
  BatchStatusDto,
  CreateDishDto,
  DishOptionDto,
  DishQueryDto,
  UpdateDishDto,
} from './dto/dish.dto';

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
  ) {}

  private mapStation(s: { id: bigint; nameZh: string; nameVi: string }) {
    return { id: s.id.toString(), nameZh: s.nameZh, nameVi: s.nameVi };
  }

  private mapCategory(c: {
    id: bigint;
    nameZh: string;
    nameVi: string;
    sort: number;
    isActive: boolean;
    kitchenStationId: bigint | null;
    kitchenStation?: { id: bigint; nameZh: string; nameVi: string } | null;
    _count?: { dishes: number };
  }) {
    return {
      id: c.id.toString(),
      nameZh: c.nameZh,
      nameVi: c.nameVi,
      sort: c.sort,
      isActive: c.isActive,
      kitchenStationId: c.kitchenStationId?.toString() ?? null,
      kitchenStation: c.kitchenStation ? this.mapStation(c.kitchenStation) : null,
      dishCount: c._count?.dishes ?? 0,
    };
  }

  private mapOption(o: {
    id: bigint;
    groupNameZh: string;
    groupNameVi: string;
    optionNameZh: string;
    optionNameVi: string;
    extraPrice: bigint;
    required: boolean;
    multi: boolean;
    sort: number;
  }) {
    return {
      id: o.id.toString(),
      groupNameZh: o.groupNameZh,
      groupNameVi: o.groupNameVi,
      optionNameZh: o.optionNameZh,
      optionNameVi: o.optionNameVi,
      extraPrice: Number(o.extraPrice),
      required: o.required,
      multi: o.multi,
      sort: o.sort,
    };
  }

  private mapDish(d: {
    id: bigint;
    categoryId: bigint;
    nameZh: string;
    nameVi: string;
    descZh: string | null;
    descVi: string | null;
    image: string | null;
    price: bigint;
    takeawayPrice: bigint;
    unit: string;
    status: DishStatus;
    stock: number | null;
    dailyStock: number | null;
    soldToday: number;
    sort: number;
    isDineIn: boolean;
    isDelivery: boolean;
    isNew: boolean;
    options?: Parameters<MenuService['mapOption']>[0][];
    category?: { id: bigint; nameZh: string; nameVi: string };
  }) {
    return {
      id: d.id.toString(),
      categoryId: d.categoryId.toString(),
      category: d.category
        ? {
            id: d.category.id.toString(),
            nameZh: d.category.nameZh,
            nameVi: d.category.nameVi,
          }
        : undefined,
      nameZh: d.nameZh,
      nameVi: d.nameVi,
      descZh: d.descZh,
      descVi: d.descVi,
      image: d.image,
      price: Number(d.price),
      takeawayPrice: Number(d.takeawayPrice),
      unit: d.unit,
      status: d.status,
      stock: d.stock,
      dailyStock: d.dailyStock,
      soldToday: d.soldToday,
      sort: d.sort,
      isDineIn: d.isDineIn,
      isDelivery: d.isDelivery,
      isNew: d.isNew,
      options: d.options?.map((o) => this.mapOption(o)) ?? [],
    };
  }

  private emitDish(storeId: string, dishes: unknown[]) {
    this.realtime.emitDishUpdated(storeId, { dishes });
  }

  async listStations(storeId: string) {
    const rows = await this.prisma.kitchenStation.findMany({
      where: { storeId: BigInt(storeId) },
      orderBy: { id: 'asc' },
    });
    return rows.map((s) => this.mapStation(s));
  }

  async listCategories(storeId: string) {
    const rows = await this.prisma.category.findMany({
      where: { storeId: BigInt(storeId) },
      include: { kitchenStation: true, _count: { select: { dishes: true } } },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((c) => this.mapCategory(c));
  }

  async createCategory(storeId: string, dto: CreateCategoryDto) {
    const row = await this.prisma.category.create({
      data: {
        storeId: BigInt(storeId),
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        sort: dto.sort ?? 0,
        isActive: dto.isActive ?? true,
        kitchenStationId: dto.kitchenStationId ? BigInt(dto.kitchenStationId) : null,
      },
      include: { kitchenStation: true, _count: { select: { dishes: true } } },
    });
    return this.mapCategory(row);
  }

  async updateCategory(storeId: string, id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('CATEGORY_NOT_FOUND');
    const row = await this.prisma.category.update({
      where: { id: existing.id },
      data: {
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        sort: dto.sort,
        isActive: dto.isActive,
        kitchenStationId:
          dto.kitchenStationId === undefined
            ? undefined
            : dto.kitchenStationId
              ? BigInt(dto.kitchenStationId)
              : null,
      },
      include: { kitchenStation: true, _count: { select: { dishes: true } } },
    });
    return this.mapCategory(row);
  }

  async deleteCategory(storeId: string, id: string) {
    const existing = await this.prisma.category.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
      include: { _count: { select: { dishes: true } } },
    });
    if (!existing) throw new BusinessError('CATEGORY_NOT_FOUND');
    if (existing._count.dishes > 0) throw new BusinessError('CATEGORY_HAS_DISHES');
    await this.prisma.category.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  async listDishes(storeId: string, query: DishQueryDto) {
    const where: Prisma.DishWhereInput = { storeId: BigInt(storeId) };
    if (query.categoryId) where.categoryId = BigInt(query.categoryId);
    if (query.status) where.status = query.status as DishStatus;
    if (query.keyword) {
      where.OR = [
        { nameZh: { contains: query.keyword } },
        { nameVi: { contains: query.keyword } },
      ];
    }
    const rows = await this.prisma.dish.findMany({
      where,
      include: { options: { orderBy: { sort: 'asc' } }, category: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((d) => this.mapDish(d));
  }

  async getDish(storeId: string, id: string) {
    const row = await this.prisma.dish.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
      include: { options: { orderBy: { sort: 'asc' } }, category: true },
    });
    if (!row) throw new BusinessError('DISH_NOT_FOUND');
    return this.mapDish(row);
  }

  private async replaceOptions(tx: Prisma.TransactionClient, dishId: bigint, options?: DishOptionDto[]) {
    await tx.dishOption.deleteMany({ where: { dishId } });
    if (!options?.length) return;
    await tx.dishOption.createMany({
      data: options.map((o, idx) => ({
        dishId,
        groupNameZh: o.groupNameZh,
        groupNameVi: o.groupNameVi,
        optionNameZh: o.optionNameZh,
        optionNameVi: o.optionNameVi,
        extraPrice: BigInt(o.extraPrice ?? 0),
        required: o.required ?? false,
        multi: o.multi ?? false,
        sort: o.sort ?? idx,
      })),
    });
  }

  async createDish(storeId: string, dto: CreateDishDto, operatorId?: string) {
    const cat = await this.prisma.category.findFirst({
      where: { id: BigInt(dto.categoryId), storeId: BigInt(storeId) },
    });
    if (!cat) throw new BusinessError('CATEGORY_NOT_FOUND');

    const row = await this.prisma.$transaction(async (tx) => {
      const nameZh = dto.nameZh.trim();
      const nameVi = (dto.nameVi || '').trim() || nameZh;
      const dish = await tx.dish.create({
        data: {
          storeId: BigInt(storeId),
          categoryId: cat.id,
          nameZh,
          nameVi,
          descZh: dto.descZh,
          descVi: dto.descVi?.trim() ? dto.descVi : dto.descZh,
          image: dto.image || null,
          price: BigInt(dto.price),
          takeawayPrice: BigInt(dto.takeawayPrice),
          unit: dto.unit ?? '份',
          status: (dto.status as DishStatus) ?? DishStatus.on,
          stock: dto.stock === undefined ? null : dto.stock,
          dailyStock: dto.dailyStock === undefined ? null : dto.dailyStock,
          sort: dto.sort ?? 0,
          isDineIn: dto.isDineIn ?? true,
          isDelivery: dto.isDelivery ?? true,
          isNew: dto.isNew ?? false,
        },
      });
      await this.replaceOptions(tx, dish.id, dto.options);
      return tx.dish.findUniqueOrThrow({
        where: { id: dish.id },
        include: { options: { orderBy: { sort: 'asc' } }, category: true },
      });
    });

    const mapped = this.mapDish(row);
    this.emitDish(storeId, [mapped]);
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'menu',
      action: 'dish.create',
      targetType: 'dish',
      targetId: mapped.id,
      after: {
        nameZh: mapped.nameZh,
        nameVi: mapped.nameVi,
        price: mapped.price,
        status: mapped.status,
      },
    });
    return mapped;
  }

  async updateDish(storeId: string, id: string, dto: UpdateDishDto, operatorId?: string) {
    const existing = await this.prisma.dish.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('DISH_NOT_FOUND');

    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({
        where: { id: BigInt(dto.categoryId), storeId: BigInt(storeId) },
      });
      if (!cat) throw new BusinessError('CATEGORY_NOT_FOUND');
    }

    const statusChanged = dto.status !== undefined && dto.status !== existing.status;
    const stockChanged = dto.stock !== undefined && dto.stock !== existing.stock;

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.dish.update({
        where: { id: existing.id },
        data: {
          categoryId: dto.categoryId ? BigInt(dto.categoryId) : undefined,
          nameZh: dto.nameZh,
          nameVi: dto.nameVi,
          descZh: dto.descZh === undefined ? undefined : dto.descZh,
          descVi: dto.descVi === undefined ? undefined : dto.descVi,
          image: dto.image === undefined ? undefined : dto.image,
          price: dto.price === undefined ? undefined : BigInt(dto.price),
          takeawayPrice: dto.takeawayPrice === undefined ? undefined : BigInt(dto.takeawayPrice),
          unit: dto.unit,
          status: dto.status as DishStatus | undefined,
          stock: dto.stock === undefined ? undefined : dto.stock,
          dailyStock: dto.dailyStock === undefined ? undefined : dto.dailyStock,
          sort: dto.sort,
          isDineIn: dto.isDineIn,
          isDelivery: dto.isDelivery,
          isNew: dto.isNew,
        },
      });
      if (dto.options) {
        await this.replaceOptions(tx, existing.id, dto.options);
      }
      return tx.dish.findUniqueOrThrow({
        where: { id: existing.id },
        include: { options: { orderBy: { sort: 'asc' } }, category: true },
      });
    });

    const mapped = this.mapDish(row);
    if (statusChanged || stockChanged || dto.options || dto.price !== undefined) {
      this.emitDish(storeId, [mapped]);
    }
    const action = statusChanged ? 'dish.status' : 'dish.update';
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'menu',
      action,
      targetType: 'dish',
      targetId: id,
      before: {
        nameZh: existing.nameZh,
        price: Number(existing.price),
        status: existing.status,
        stock: existing.stock,
      },
      after: {
        nameZh: mapped.nameZh,
        price: mapped.price,
        status: mapped.status,
        stock: mapped.stock,
      },
    });
    return mapped;
  }

  async deleteDish(storeId: string, id: string) {
    const existing = await this.prisma.dish.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('DISH_NOT_FOUND');
    await this.prisma.dish.delete({ where: { id: existing.id } });
    this.emitDish(storeId, [{ id, deleted: true }]);
    return { ok: true };
  }

  async batchStatus(storeId: string, dto: BatchStatusDto) {
    const ids = dto.ids.map((id) => BigInt(id));
    await this.prisma.dish.updateMany({
      where: { storeId: BigInt(storeId), id: { in: ids } },
      data: { status: dto.status as DishStatus },
    });
    const rows = await this.prisma.dish.findMany({
      where: { storeId: BigInt(storeId), id: { in: ids } },
      include: { options: true, category: true },
    });
    const mapped = rows.map((d) => this.mapDish(d));
    this.emitDish(storeId, mapped);
    return mapped;
  }

  async batchPrice(storeId: string, dto: BatchPriceDto) {
    if (dto.price === undefined && dto.takeawayPrice === undefined) {
      throw new BusinessError('BATCH_PRICE_EMPTY');
    }
    const ids = dto.ids.map((id) => BigInt(id));
    await this.prisma.dish.updateMany({
      where: { storeId: BigInt(storeId), id: { in: ids } },
      data: {
        price: dto.price === undefined ? undefined : BigInt(dto.price),
        takeawayPrice: dto.takeawayPrice === undefined ? undefined : BigInt(dto.takeawayPrice),
      },
    });
    const rows = await this.prisma.dish.findMany({
      where: { storeId: BigInt(storeId), id: { in: ids } },
      include: { options: true, category: true },
    });
    const mapped = rows.map((d) => this.mapDish(d));
    this.emitDish(storeId, mapped);
    return mapped;
  }

  /** 一键估清：库存置 0 并下架 */
  async batchSoldOut(storeId: string, dto: BatchSoldOutDto) {
    const ids = dto.ids.map((id) => BigInt(id));
    await this.prisma.dish.updateMany({
      where: { storeId: BigInt(storeId), id: { in: ids } },
      data: { stock: 0, status: DishStatus.off },
    });
    const rows = await this.prisma.dish.findMany({
      where: { storeId: BigInt(storeId), id: { in: ids } },
      include: { options: true, category: true },
    });
    const mapped = rows.map((d) => this.mapDish(d));
    this.emitDish(storeId, mapped);
    return mapped;
  }

  /** 营业日切换：重置 sold_today，并按 daily_stock 回补当日可售 */
  async resetDailyStockForBusinessDay() {
    const stores = await this.prisma.store.findMany({ select: { id: true, businessDayCutHour: true } });
    const now = new Date();
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: 'numeric',
        hour12: false,
      }).format(now),
    );

    for (const store of stores) {
      if (hour !== store.businessDayCutHour) continue;
      await this.prisma.dish.updateMany({
        where: { storeId: store.id, dailyStock: { not: null } },
        data: { soldToday: 0 },
      });
      // 有每日限量且当前库存不为 null 时，将库存重置为 daily_stock
      const dishes = await this.prisma.dish.findMany({
        where: { storeId: store.id, dailyStock: { not: null } },
        select: { id: true, dailyStock: true },
      });
      for (const d of dishes) {
        await this.prisma.dish.update({
          where: { id: d.id },
          data: { stock: d.dailyStock },
        });
      }
      this.emitDish(store.id.toString(), [{ type: 'daily_reset' }]);
    }
  }

  async getPublicMenu(storeId: string, channel: 'dine_in' | 'delivery' = 'dine_in') {
    const categories = await this.prisma.category.findMany({
      where: { storeId: BigInt(storeId), isActive: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: {
        dishes: {
          where: {
            status: DishStatus.on,
            ...(channel === 'delivery' ? { isDelivery: true } : { isDineIn: true }),
          },
          include: { options: { orderBy: { sort: 'asc' } } },
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        },
      },
    });

    return categories
      .filter((c) => c.dishes.length > 0)
      .map((c) => ({
        id: c.id.toString(),
        nameZh: c.nameZh,
        nameVi: c.nameVi,
        sort: c.sort,
        dishes: c.dishes.map((d) => this.mapDish(d)),
      }));
  }

  /** H5 首页新品推荐 */
  async listNewDishes(storeId: string) {
    const rows = await this.prisma.dish.findMany({
      where: {
        storeId: BigInt(storeId),
        status: DishStatus.on,
        isNew: true,
      },
      include: { options: { orderBy: { sort: 'asc' } }, category: true },
      orderBy: [{ sort: 'asc' }, { id: 'desc' }],
      take: 12,
    });
    return rows.map((d) => this.mapDish(d));
  }
}
