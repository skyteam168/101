import { DishStatus } from '@prisma/client';
import { MenuService } from './menu.service';

describe('MenuService', () => {
  it('batchSoldOut sets stock 0 and status off then emits', async () => {
    const prisma = {
      dish: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1n,
            categoryId: 1n,
            nameZh: '测试',
            nameVi: 'Test',
            descZh: null,
            descVi: null,
            image: null,
            price: 1000n,
            takeawayPrice: 1000n,
            unit: '份',
            status: DishStatus.off,
            stock: 0,
            dailyStock: null,
            soldToday: 0,
            sort: 0,
            isDineIn: true,
            isDelivery: true,
            isNew: false,
            options: [],
            category: { id: 1n, nameZh: '热炒', nameVi: 'Xào' },
          },
        ]),
      },
    };
    const realtime = { emitDishUpdated: jest.fn() };
    const service = new MenuService(prisma as never, realtime as never);
    const result = await service.batchSoldOut('1', { ids: ['1'] });
    expect(prisma.dish.updateMany).toHaveBeenCalledWith({
      where: { storeId: 1n, id: { in: [1n] } },
      data: { stock: 0, status: DishStatus.off },
    });
    expect(result[0].status).toBe('off');
    expect(result[0].stock).toBe(0);
    expect(realtime.emitDishUpdated).toHaveBeenCalled();
  });

  it('getPublicMenu only returns on + channel dishes', async () => {
    const prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1n,
            nameZh: '饮品',
            nameVi: 'Đồ uống',
            sort: 1,
            dishes: [
              {
                id: 2n,
                categoryId: 1n,
                nameZh: '可乐',
                nameVi: 'Coca',
                descZh: null,
                descVi: null,
                image: null,
                price: 20000n,
                takeawayPrice: 20000n,
                unit: '份',
                status: DishStatus.on,
                stock: null,
                dailyStock: null,
                soldToday: 0,
                sort: 1,
                isDineIn: true,
                isDelivery: true,
                isNew: false,
                options: [],
              },
            ],
          },
        ]),
      },
    };
    const service = new MenuService(prisma as never, { emitDishUpdated: jest.fn() } as never);
    const menu = await service.getPublicMenu('1', 'dine_in');
    expect(prisma.category.findMany).toHaveBeenCalled();
    expect(menu[0].dishes[0].nameZh).toBe('可乐');
  });
});
