import { AssetEventType } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { AssetService } from './asset.service';

describe('AssetService events', () => {
  const assetRow = {
    id: 1n,
    store_id: 1n,
    location: '仓库',
    qty_total: 10,
    qty_in_use: 3,
    qty_idle: 5,
    qty_repair: 2,
    qty_disposed: 0,
    unit_price: 100000n,
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    asset: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    assetEvent: { create: jest.fn() },
    assetCategory: { findFirst: jest.fn() },
  };

  const tx = {
    $queryRaw: jest.fn(),
    asset: { update: jest.fn() },
    assetEvent: { create: jest.fn() },
  };

  let service: AssetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AssetService(prisma as never, { log: jest.fn() } as never);
    tx.$queryRaw.mockResolvedValue([{ ...assetRow }]);
    prisma.asset.findFirst.mockResolvedValue({
      id: 1n,
      storeId: 1n,
      assetNo: 'ZC-202610-0001',
      categoryId: 1n,
      nameZh: '冰箱',
      nameVi: 'Tủ lạnh',
      spec: null,
      unit: '台',
      location: '仓库',
      supplier: null,
      purchaseDate: new Date('2024-01-01'),
      unitPrice: 100000n,
      qtyTotal: 10,
      qtyInUse: 3,
      qtyIdle: 5,
      qtyRepair: 2,
      qtyDisposed: 0,
      warrantyUntil: null,
      photo: null,
      createdAt: new Date(),
      category: {
        id: 1n,
        nameZh: '电器',
        nameVi: 'Điện',
        depreciationMonths: 36,
      },
    });
  });

  it('assign moves idle to in_use', async () => {
    await service.eventAssign('1', '1', '9', { qty: 2 });
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ qtyIdle: 3, qtyInUse: 5 }),
      }),
    );
    expect(tx.assetEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: AssetEventType.assign, qty: 2 }),
      }),
    );
  });

  it('assign throws when idle insufficient', async () => {
    await expect(service.eventAssign('1', '1', '9', { qty: 99 })).rejects.toBeInstanceOf(
      BusinessError,
    );
  });

  it('scrap reduces pool and increases disposed', async () => {
    await service.eventScrap('1', '1', '9', { qty: 2, fromPool: 'idle' });
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ qtyIdle: 3, qtyDisposed: 2 }),
      }),
    );
    expect(tx.assetEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: AssetEventType.scrap, qty: 2 }),
      }),
    );
  });

  it('in increases total and idle', async () => {
    await service.eventIn('1', '1', '9', { qty: 4 });
    expect(tx.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ qtyTotal: 14, qtyIdle: 9 }),
      }),
    );
  });
});
