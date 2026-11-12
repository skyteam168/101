import { ComboStatus } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { ComboService } from './combo.service';

/** 构造最小化 PrismaService mock */
function makePrisma() {
  return {
    combo: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    comboGroup: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    comboGroupItem: {
      create: jest.fn(),
    },
    orderItem: {
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    groupMealInquiry: {
      updateMany: jest.fn(),
    },
    audit: { log: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        combo: {
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          findUniqueOrThrow: jest.fn(),
        },
        comboGroup: {
          deleteMany: jest.fn(),
          create: jest.fn(),
        },
        comboGroupItem: {
          create: jest.fn(),
        },
        orderItem: {
          updateMany: jest.fn(),
        },
        groupMealInquiry: {
          updateMany: jest.fn(),
        },
      }),
    ),
  };
}

/** 构造带分组/子项的完整 combo 返回 */
function makeComboRow(overrides: Partial<{ status: ComboStatus }> = {}) {
  return {
    id: 1n,
    storeId: 1n,
    nameZh: '测试套餐',
    nameVi: 'Combo test',
    descZh: null,
    descVi: null,
    image: null,
    price: 100000n,
    takeawayPrice: 95000n,
    status: overrides.status ?? ComboStatus.on,
    sort: 0,
    isDineIn: true,
    isDelivery: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    groups: [
      {
        id: 1n,
        comboId: 1n,
        nameZh: '主菜',
        nameVi: 'Món chính',
        minSelect: 1,
        maxSelect: 1,
        sort: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 1n,
            groupId: 1n,
            dishId: 10n,
            extraPrice: 0n,
            isDefault: true,
            sort: 0,
            dish: { nameZh: '宫保鸡丁', nameVi: 'Gà Kung Pao', price: 89000n, image: null },
          },
          {
            id: 2n,
            groupId: 1n,
            dishId: 11n,
            extraPrice: 10000n,
            isDefault: false,
            sort: 1,
            dish: { nameZh: '鱼香肉丝', nameVi: 'Thịt xào', price: 85000n, image: null },
          },
        ],
      },
    ],
  };
}

describe('ComboService.list', () => {
  it('返回分页数据', async () => {
    const prisma = makePrisma();
    const row = makeComboRow();
    prisma.combo.count.mockResolvedValue(1);
    prisma.combo.findMany.mockResolvedValue([row]);

    const service = new ComboService(prisma as never, { log: jest.fn() } as never);
    const result = await service.list('1', {});

    expect(result.total).toBe(1);
    expect(result.list).toHaveLength(1);
    expect(result.list[0].nameZh).toBe('测试套餐');
    expect(result.list[0].price).toBe(100000);
    // 分组映射正确
    expect(result.list[0].groups).toHaveLength(1);
    expect(result.list[0].groups[0].items).toHaveLength(2);
    expect(result.list[0].groups[0].items[1].extraPrice).toBe(10000);
  });
});

describe('ComboService.findById', () => {
  it('找不到时抛出 COMBO_NOT_FOUND', async () => {
    const prisma = makePrisma();
    prisma.combo.findFirst.mockResolvedValue(null);

    const service = new ComboService(prisma as never, { log: jest.fn() } as never);
    await expect(service.findById('1', '999')).rejects.toThrow(BusinessError);
  });

  it('找到时正常返回映射结果', async () => {
    const prisma = makePrisma();
    prisma.combo.findFirst.mockResolvedValue(makeComboRow());

    const service = new ComboService(prisma as never, { log: jest.fn() } as never);
    const result = await service.findById('1', '1');
    expect(result.id).toBe('1');
    expect(result.takeawayPrice).toBe(95000);
  });
});

describe('ComboService.delete', () => {
  it('套餐被进行中订单引用时拒绝删除（COMBO_IN_USE）', async () => {
    const prisma = makePrisma();
    prisma.combo.findFirst.mockResolvedValue(makeComboRow());
    prisma.orderItem.count.mockResolvedValue(3);

    const service = new ComboService(prisma as never, { log: jest.fn() } as never);
    await expect(service.delete('1', '1')).rejects.toThrow(BusinessError);
  });

  it('套餐不存在时抛出 COMBO_NOT_FOUND', async () => {
    const prisma = makePrisma();
    prisma.combo.findFirst.mockResolvedValue(null);

    const service = new ComboService(prisma as never, { log: jest.fn() } as never);
    await expect(service.delete('1', '1')).rejects.toThrow(BusinessError);
  });

  it('仅历史引用时可断开 FK 后删除', async () => {
    const prisma = makePrisma();
    prisma.combo.findFirst.mockResolvedValue(makeComboRow());
    prisma.orderItem.count.mockResolvedValue(0);
    const audit = { log: jest.fn() };

    const service = new ComboService(prisma as never, audit as never);
    const result = await service.delete('1', '1', '9');
    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalled();
  });
});

describe('ComboService.getComboForOrder', () => {
  it('套餐下架时抛出 COMBO_NOT_FOUND', async () => {
    const prisma = makePrisma();
    prisma.combo.findFirst.mockResolvedValue(null); // status=off 会找不到

    const service = new ComboService(prisma as never, { log: jest.fn() } as never);
    await expect(service.getComboForOrder(1n, 1n)).rejects.toThrow(BusinessError);
  });

  it('套餐启用时正常返回', async () => {
    const prisma = makePrisma();
    prisma.combo.findFirst.mockResolvedValue(makeComboRow());

    const service = new ComboService(prisma as never, { log: jest.fn() } as never);
    const result = await service.getComboForOrder(1n, 1n);
    expect(result.id).toBe(1n);
    expect(result.nameZh).toBe('测试套餐');
  });
});
