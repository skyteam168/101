import { IngredientMovementType, StocktakeStatus } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { InventoryService } from './inventory.service';

describe('InventoryService purchase / stocktake', () => {
  const tx = {
    purchase: { create: jest.fn() },
    ingredient: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    ingredientMovement: { create: jest.fn() },
    stocktake: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    stocktakeItem: { deleteMany: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    supplier: { findFirst: jest.fn() },
    ingredient: { findMany: jest.fn() },
    store: { findUnique: jest.fn() },
    stocktake: { findUnique: jest.fn() },
    purchaseItem: { groupBy: jest.fn() },
  };

  const audit = { log: jest.fn() };
  let service: InventoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InventoryService(prisma as never, audit as never);
    prisma.store.findUnique.mockResolvedValue({ businessDayCutHour: 4 });
  });

  it('createPurchase increments stock and writes purchase movement', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: 5n, nameZh: '鲜肉行' });
    prisma.ingredient.findMany.mockResolvedValue([{ id: 2n }]);
    tx.purchase.create.mockResolvedValue({
      id: 88n,
      supplierId: 5n,
      supplier: '鲜肉行',
      note: null,
      totalAmount: 100000n,
      items: [],
      operator: null,
    });

    const result = await service.createPurchase('1', '9', {
      supplierId: '5',
      businessDate: '2026-11-03',
      items: [{ ingredientId: '2', qty: 2, unitPrice: 50000 }],
    });

    expect(result.id).toBe('88');
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: 2n },
      data: { stockQty: { increment: 2 }, lastCost: 50000n },
    });
    expect(tx.ingredientMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: IngredientMovementType.purchase,
          qty: 2,
          refType: 'purchase',
          refId: '88',
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'purchase.create', targetId: '88' }),
    );
  });

  it('createPurchase throws when supplier missing', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(
      service.createPurchase('1', undefined, {
        supplierId: '99',
        items: [{ ingredientId: '2', qty: 1, unitPrice: 1000 }],
      }),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  it('createAndConfirmStocktake rejects already confirmed', async () => {
    prisma.stocktake.findUnique.mockResolvedValue({
      id: 1n,
      status: StocktakeStatus.confirmed,
    });
    await expect(
      service.createAndConfirmStocktake('1', '9', {
        businessDate: '2026-11-03',
        items: [{ ingredientId: '2', countedQty: 10 }],
      }),
    ).rejects.toMatchObject({ errorCode: 'STOCKTAKE_ALREADY_CONFIRMED' });
  });

  it('createAndConfirmStocktake sets stock and writes stocktake_set', async () => {
    prisma.stocktake.findUnique.mockResolvedValue(null);
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 2n,
        nameZh: '猪肉',
        nameVi: 'Thịt',
        kind: 'meat',
        unit: 'kg',
        stockQty: 15,
        lastCost: 80000n,
        isActive: true,
      },
    ]);
    prisma.purchaseItem.groupBy.mockResolvedValue([]);
    tx.ingredient.findUnique.mockResolvedValue({ stockQty: 15 });
    tx.stocktake.create.mockResolvedValue({
      id: 7n,
      status: StocktakeStatus.confirmed,
      note: null,
      confirmedAt: new Date(),
      items: [
        {
          ingredientId: 2n,
          openingQty: 15,
          purchasedQty: 0,
          countedQty: 14,
          consumptionQty: 1,
          unitCost: 80000n,
          consumptionAmount: 80000n,
          ingredient: { nameZh: '猪肉', nameVi: 'Thịt', unit: 'kg', kind: 'meat' },
        },
      ],
    });

    const result = await service.createAndConfirmStocktake('1', '9', {
      businessDate: '2026-11-03',
      items: [{ ingredientId: '2', countedQty: 14 }],
    });

    expect(result.id).toBe('7');
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: 2n },
      data: { stockQty: 14 },
    });
    expect(tx.ingredientMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: IngredientMovementType.stocktake_set,
          qty: 14,
          refType: 'stocktake',
        }),
      }),
    );
  });
});
