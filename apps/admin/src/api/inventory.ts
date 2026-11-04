import { apiGet, apiPatch, apiPost, apiPut } from './http';

export type Supplier = {
  id: string;
  nameZh: string;
  nameVi: string;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
};

export type Ingredient = {
  id: string;
  nameZh: string;
  nameVi: string;
  kind: 'vegetable' | 'seasoning' | 'other';
  unit: string;
  stockQty: number;
  lastCost: number;
  stockValue: number;
  isActive: boolean;
};

export type Purchase = {
  id: string;
  businessDate: string;
  supplierId: string | null;
  supplier: string | null;
  supplierNameZh?: string | null;
  supplierNameVi?: string | null;
  note: string | null;
  totalAmount: number;
  operatorName: string | null;
  createdAt: string;
  items: {
    ingredientId: string;
    nameZh: string;
    nameVi: string;
    unit: string;
    qty: number;
    unitPrice: number;
    amount: number;
  }[];
};

export type StocktakePreviewItem = {
  ingredientId: string;
  nameZh: string;
  nameVi: string;
  kind: string;
  unit: string;
  openingQty: number;
  purchasedQty: number;
  stockQty: number;
  lastCost: number;
  countedQty: number;
};

export const listSuppliersApi = (activeOnly?: boolean) =>
  apiGet<Supplier[]>(
    '/inventory/suppliers',
    activeOnly ? { activeOnly: '1' } : undefined,
  );
export const createSupplierApi = (data: Record<string, unknown>) =>
  apiPost<Supplier>('/inventory/suppliers', data);
export const updateSupplierApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<Supplier>(`/inventory/suppliers/${id}`, data);

export const listIngredientsApi = (kind?: string) =>
  apiGet<Ingredient[]>('/inventory/ingredients', kind ? { kind } : undefined);
export const createIngredientApi = (data: Record<string, unknown>) =>
  apiPost<Ingredient>('/inventory/ingredients', data);
export const updateIngredientApi = (id: string, data: Record<string, unknown>) =>
  apiPatch<Ingredient>(`/inventory/ingredients/${id}`, data);

export const listPurchasesApi = (date?: string) =>
  apiGet<{ businessDate: string; list: Purchase[] }>('/inventory/purchases', date ? { date } : undefined);
export const createPurchaseApi = (data: Record<string, unknown>) =>
  apiPost('/inventory/purchases', data);

export const previewStocktakeApi = (date?: string) =>
  apiGet<{ businessDate: string; items: StocktakePreviewItem[] }>(
    '/inventory/stocktakes/preview',
    date ? { date } : undefined,
  );
export const confirmStocktakeApi = (data: {
  businessDate?: string;
  note?: string;
  items: { ingredientId: string; countedQty: number }[];
}) => apiPost('/inventory/stocktakes', data);

export const dailyInventoryApi = (date?: string) =>
  apiGet<{
    businessDate: string;
    purchaseTotal: number;
    purchases: Purchase[];
    stocktake: {
      totalConsumptionAmount: number;
      items: {
        nameZh: string;
        nameVi: string;
        unit: string;
        openingQty: number;
        purchasedQty: number;
        countedQty: number;
        consumptionQty: number;
        consumptionAmount: number;
      }[];
    } | null;
  }>('/inventory/daily', date ? { date } : undefined);

export type DishRecipeLine = {
  id?: string;
  dishId?: string;
  ingredientId: string;
  qty: number;
  unit?: string;
  nameZh?: string;
  nameVi?: string;
};

export const listDishRecipesApi = (dishId: string) =>
  apiGet<DishRecipeLine[]>(`/inventory/dishes/${dishId}/recipes`);

export const setDishRecipesApi = (
  dishId: string,
  items: { ingredientId: string; qty: number }[],
) => apiPut<DishRecipeLine[]>(`/inventory/dishes/${dishId}/recipes`, { items });

export const listIngredientMovementsApi = (params?: {
  ingredientId?: string;
  page?: number;
  pageSize?: number;
}) =>
  apiGet<{
    total: number;
    page: number;
    pageSize: number;
    list: {
      id: string;
      ingredientId: string;
      nameZh: string;
      nameVi: string;
      unit: string;
      type: string;
      qty: number;
      refType: string | null;
      refId: string | null;
      note: string | null;
      createdAt: string;
    }[];
  }>('/inventory/movements', params as Record<string, string | number | undefined>);
