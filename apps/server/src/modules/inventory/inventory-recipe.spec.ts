import { IngredientMovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('InventoryService recipe consume/restore', () => {
  const tx = {
    dishRecipe: { findMany: jest.fn() },
    ingredient: { update: jest.fn() },
    ingredientMovement: { create: jest.fn() },
  };

  const service = new InventoryService({} as never, { log: jest.fn() } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consumeRecipe deducts stock and writes sale_deduct', async () => {
    tx.dishRecipe.findMany.mockResolvedValue([
      { ingredientId: 2n, qty: 0.2 },
      { ingredientId: 3n, qty: 0.05 },
    ]);
    await service.consumeRecipe(tx as never, 1n, 10n, 2, {
      refType: 'order',
      refId: '100',
    });
    expect(tx.ingredient.update).toHaveBeenCalledTimes(2);
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: 2n },
      data: { stockQty: { decrement: 0.4 } },
    });
    expect(tx.ingredientMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: IngredientMovementType.sale_deduct,
          qty: 0.4,
          refId: '100',
        }),
      }),
    );
  });

  it('restoreRecipe increments and writes sale_restore', async () => {
    tx.dishRecipe.findMany.mockResolvedValue([{ ingredientId: 2n, qty: 0.2 }]);
    await service.restoreRecipe(tx as never, 1n, 10n, 1, {
      refType: 'order_item',
      refId: '9',
    });
    expect(tx.ingredient.update).toHaveBeenCalledWith({
      where: { id: 2n },
      data: { stockQty: { increment: 0.2 } },
    });
    expect(tx.ingredientMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: IngredientMovementType.sale_restore }),
      }),
    );
  });

  it('no-op when dishId null', async () => {
    await service.consumeRecipe(tx as never, 1n, null, 1, { refType: 'x', refId: '1' });
    expect(tx.dishRecipe.findMany).not.toHaveBeenCalled();
  });
});
