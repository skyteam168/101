# 原料配方（BOM）与库存口径

## 两套库存

| 口径 | 字段 | 用途 |
|------|------|------|
| 菜品可售库存 | `dishes.stock` / `daily_stock` / `sold_today` | 点餐是否可卖、估清 |
| 原料采购库存 | `ingredients.stock_qty` | 进货、盘点、成本 |

二者**独立**。菜品有配方时，下单才按 BOM 扣原料；无配方不扣原料。

## 售卖扣料

- 堂食下单 / 加菜 / 扫码下单 / 外卖下单：按 `dish_recipes.qty × 份数` 扣 `stock_qty`，写 `ingredient_movements.type=sale_deduct`。
- 退菜 / 取消 / 拒单：对称回滚，写 `sale_restore`。
- 原料不足**不阻断**售卖（允许账面为负），便于先出餐后补货。

## 进货与盘点

- 进货：`stock_qty` 增加，流水 `purchase`。
- 盘点确认：把 `stock_qty` **设为**实盘数，流水 `stocktake_set`；**不会删除**历史 `sale_deduct` 记录。
- 盘点「理论消耗」仍按 opening+purchased−counted 估算，与售卖流水可交叉核对。

## 维护入口

管理端「菜品」编辑抽屉 →「原料配方」；权限 `menu:dish:edit`。流水查询：`GET /api/inventory/movements`。
