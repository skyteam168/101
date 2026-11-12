import { Injectable } from '@nestjs/common';
import { ComboStatus, OrderStatus, Prisma } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ComboGroupDto, ComboQueryDto, CreateComboDto, UpdateComboDto } from './dto/combo.dto';

@Injectable()
export class ComboService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ========== 映射辅助 ==========

  private mapItem(item: {
    id: bigint;
    groupId: bigint;
    dishId: bigint;
    extraPrice: bigint;
    isDefault: boolean;
    sort: number;
    dish?: { nameZh: string; nameVi: string; price: bigint; image: string | null } | null;
  }) {
    return {
      id: item.id.toString(),
      groupId: item.groupId.toString(),
      dishId: item.dishId.toString(),
      extraPrice: Number(item.extraPrice),
      isDefault: item.isDefault,
      sort: item.sort,
      dish: item.dish
        ? {
            nameZh: item.dish.nameZh,
            nameVi: item.dish.nameVi,
            price: Number(item.dish.price),
            image: item.dish.image,
          }
        : undefined,
    };
  }

  private mapGroup(g: {
    id: bigint;
    comboId: bigint;
    nameZh: string;
    nameVi: string;
    minSelect: number;
    maxSelect: number;
    sort: number;
    items?: Parameters<ComboService['mapItem']>[0][];
  }) {
    return {
      id: g.id.toString(),
      comboId: g.comboId.toString(),
      nameZh: g.nameZh,
      nameVi: g.nameVi,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      sort: g.sort,
      items: g.items?.map((i) => this.mapItem(i)) ?? [],
    };
  }

  private mapCombo(
    c: Prisma.ComboGetPayload<{
      include: { groups: { include: { items: { include: { dish: true } } } } };
    }>,
  ) {
    return {
      id: c.id.toString(),
      storeId: c.storeId.toString(),
      nameZh: c.nameZh,
      nameVi: c.nameVi,
      descZh: c.descZh,
      descVi: c.descVi,
      image: c.image,
      price: Number(c.price),
      takeawayPrice: Number(c.takeawayPrice),
      status: c.status,
      sort: c.sort,
      isDineIn: c.isDineIn,
      isDelivery: c.isDelivery,
      isGroupMeal: c.isGroupMeal,
      servingSize: c.servingSize,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      groups: [...c.groups]
        .sort((a, b) => a.sort - b.sort)
        .map((g) => this.mapGroup(g)),
    };
  }

  /** 包含完整分组/菜品信息的查询 include */
  private get fullInclude() {
    return {
      groups: {
        include: {
          items: {
            include: { dish: true },
            orderBy: { sort: 'asc' as const },
          },
        },
        orderBy: { sort: 'asc' as const },
      },
    };
  }

  // ========== 内部：更新/创建分组 ==========

  /**
   * 全量覆盖套餐分组（删旧建新策略，简单可靠）
   */
  private async replaceGroups(
    tx: Prisma.TransactionClient,
    comboId: bigint,
    groups: ComboGroupDto[],
  ) {
    // 删除旧分组（级联删除子项）
    await tx.comboGroup.deleteMany({ where: { comboId } });

    // 按顺序创建新分组
    for (const [gi, g] of groups.entries()) {
      const group = await tx.comboGroup.create({
        data: {
          comboId,
          nameZh: g.nameZh,
          nameVi: g.nameVi,
          minSelect: g.minSelect ?? 1,
          maxSelect: g.maxSelect ?? 1,
          sort: g.sort ?? gi,
        },
      });

      if (g.items) {
        for (const [ii, item] of g.items.entries()) {
          await tx.comboGroupItem.create({
            data: {
              groupId: group.id,
              dishId: BigInt(item.dishId),
              extraPrice: BigInt(item.extraPrice ?? 0),
              isDefault: item.isDefault ?? false,
              sort: item.sort ?? ii,
            },
          });
        }
      }
    }
  }

  // ========== CRUD ==========

  async create(storeId: string, dto: CreateComboDto, operatorId?: string) {
    const sid = BigInt(storeId);
    const combo = await this.prisma.$transaction(async (tx) => {
      const c = await tx.combo.create({
        data: {
          storeId: sid,
          nameZh: dto.nameZh,
          nameVi: dto.nameVi,
          descZh: dto.descZh,
          descVi: dto.descVi,
          image: dto.image,
          price: BigInt(dto.price),
          takeawayPrice: BigInt(dto.takeawayPrice ?? dto.price),
          status: (dto.status ?? 'on') as ComboStatus,
          sort: dto.sort ?? 0,
          isDineIn: dto.isDineIn ?? true,
          isDelivery: dto.isDelivery ?? true,
          isGroupMeal: dto.isGroupMeal ?? false,
          servingSize: dto.servingSize === undefined ? undefined : dto.servingSize,
        },
        include: this.fullInclude,
      });

      if (dto.groups?.length) {
        await this.replaceGroups(tx, c.id, dto.groups);
      }

      // 重新查询含分组的完整数据
      return tx.combo.findUniqueOrThrow({
        where: { id: c.id },
        include: this.fullInclude,
      });
    });

    const mapped = this.mapCombo(combo);
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'menu',
      action: 'combo.create',
      targetType: 'combo',
      targetId: mapped.id,
      after: { nameZh: mapped.nameZh, price: mapped.price, status: mapped.status },
    });
    return mapped;
  }

  async update(storeId: string, comboId: string, dto: UpdateComboDto, operatorId?: string) {
    const cid = BigInt(comboId);
    const combo = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.combo.findFirst({
        where: { id: cid, storeId: BigInt(storeId) },
      });
      if (!existing) throw new BusinessError('COMBO_NOT_FOUND');

      await tx.combo.update({
        where: { id: cid },
        data: {
          ...(dto.nameZh !== undefined && { nameZh: dto.nameZh }),
          ...(dto.nameVi !== undefined && { nameVi: dto.nameVi }),
          ...(dto.descZh !== undefined && { descZh: dto.descZh }),
          ...(dto.descVi !== undefined && { descVi: dto.descVi }),
          ...(dto.image !== undefined && { image: dto.image }),
          ...(dto.price !== undefined && { price: BigInt(dto.price) }),
          ...(dto.takeawayPrice !== undefined && { takeawayPrice: BigInt(dto.takeawayPrice) }),
          ...(dto.status !== undefined && { status: dto.status as ComboStatus }),
          ...(dto.sort !== undefined && { sort: dto.sort }),
          ...(dto.isDineIn !== undefined && { isDineIn: dto.isDineIn }),
          ...(dto.isDelivery !== undefined && { isDelivery: dto.isDelivery }),
          ...(dto.isGroupMeal !== undefined && { isGroupMeal: dto.isGroupMeal }),
          ...(dto.servingSize !== undefined && { servingSize: dto.servingSize }),
        },
      });

      if (dto.groups !== undefined) {
        await this.replaceGroups(tx, cid, dto.groups);
      }

      return tx.combo.findUniqueOrThrow({
        where: { id: cid },
        include: this.fullInclude,
      });
    });

    const mapped = this.mapCombo(combo);
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'menu',
      action: 'combo.update',
      targetType: 'combo',
      targetId: comboId,
      after: {
        nameZh: mapped.nameZh,
        price: mapped.price,
        status: mapped.status,
        groupsUpdated: dto.groups !== undefined,
      },
    });
    return mapped;
  }

  async delete(storeId: string, comboId: string, operatorId?: string) {
    const cid = BigInt(comboId);
    const existing = await this.prisma.combo.findFirst({
      where: { id: cid, storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('COMBO_NOT_FOUND');

    // 进行中订单仍引用则拒绝；历史明细已快照名称，可断开 FK 后删除
    const activeUsed = await this.prisma.orderItem.count({
      where: {
        comboId: cid,
        order: {
          status: {
            in: [
              OrderStatus.open,
              OrderStatus.pending,
              OrderStatus.accepted,
              OrderStatus.cooking,
              OrderStatus.delivering,
            ],
          },
        },
      },
    });
    if (activeUsed > 0) throw new BusinessError('COMBO_IN_USE');

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({ where: { comboId: cid }, data: { comboId: null } });
      await tx.groupMealInquiry.updateMany({ where: { comboId: cid }, data: { comboId: null } });
      await tx.combo.delete({ where: { id: cid } });
    });

    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'menu',
      action: 'combo.delete',
      targetType: 'combo',
      targetId: comboId,
      before: { nameZh: existing.nameZh, nameVi: existing.nameVi },
    });
    return { success: true };
  }

  async findById(storeId: string, comboId: string) {
    const combo = await this.prisma.combo.findFirst({
      where: { id: BigInt(comboId), storeId: BigInt(storeId) },
      include: this.fullInclude,
    });
    if (!combo) throw new BusinessError('COMBO_NOT_FOUND');
    return this.mapCombo(combo);
  }

  async list(storeId: string, query: ComboQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.ComboWhereInput = { storeId: BigInt(storeId) };

    if (query.status) where.status = query.status as ComboStatus;
    if (query.keyword) {
      where.OR = [
        { nameZh: { contains: query.keyword } },
        { nameVi: { contains: query.keyword } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.combo.count({ where }),
      this.prisma.combo.findMany({
        where,
        include: this.fullInclude,
        orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => this.mapCombo(r)),
    };
  }

  /**
   * 按 comboId 返回完整套餐数据（供 OrderService 使用）
   */
  async getComboForOrder(comboId: bigint, storeId: bigint) {
    const combo = await this.prisma.combo.findFirst({
      where: { id: comboId, storeId, status: ComboStatus.on },
      include: this.fullInclude,
    });
    if (!combo) throw new BusinessError('COMBO_NOT_FOUND');
    return combo;
  }

  /** H5 团餐套餐列表 */
  async listPublicGroupMeals(storeId: string) {
    const rows = await this.prisma.combo.findMany({
      where: {
        storeId: BigInt(storeId),
        status: ComboStatus.on,
        isGroupMeal: true,
        isDelivery: true,
      },
      include: this.fullInclude,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.mapCombo(r));
  }
}
