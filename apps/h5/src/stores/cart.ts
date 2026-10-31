import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export interface CartItem {
  dishId: string;
  nameZh: string;
  nameVi: string;
  price: number;
  qty: number;
  optionIds?: string[];
  optionLabel?: string;
  optionsSnapshot?: unknown[];
}

const STORAGE_KEY = 'h5_delivery_cart_v1';

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is CartItem =>
          !!i &&
          typeof i === 'object' &&
          typeof (i as CartItem).dishId === 'string' &&
          typeof (i as CartItem).price === 'number' &&
          typeof (i as CartItem).qty === 'number',
      )
      .map((i) => ({
        dishId: String(i.dishId),
        nameZh: String(i.nameZh ?? ''),
        nameVi: String(i.nameVi ?? ''),
        price: Number(i.price) || 0,
        qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
        optionIds: Array.isArray(i.optionIds) ? i.optionIds.map(String) : undefined,
        optionLabel: i.optionLabel != null ? String(i.optionLabel) : undefined,
        optionsSnapshot: i.optionsSnapshot,
      }));
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // quota / private mode — ignore
  }
}

export const useCartStore = defineStore('deliveryCart', () => {
  const items = ref<CartItem[]>(loadCart());

  watch(
    items,
    (v) => {
      saveCart(v);
    },
    { deep: true },
  );

  function add(item: Omit<CartItem, 'qty'> & { qty?: number }) {
    const dishId = String(item.dishId);
    const existing = items.value.find(
      (i) => i.dishId === dishId && i.optionLabel === item.optionLabel,
    );
    if (existing) {
      existing.qty += item.qty ?? 1;
    } else {
      items.value.push({ ...item, dishId, qty: item.qty ?? 1 });
    }
  }

  function remove(dishId: string | number, optionLabel?: string) {
    const id = String(dishId);
    // 未传 optionLabel 时，优先减掉最后一条同菜明细（含规格）
    const idx =
      optionLabel === undefined
        ? [...items.value].map((i, n) => ({ i, n })).reverse().find((x) => x.i.dishId === id)?.n ??
          -1
        : items.value.findIndex((i) => i.dishId === id && i.optionLabel === optionLabel);
    if (idx === -1) return;
    if (items.value[idx].qty > 1) {
      items.value[idx].qty -= 1;
    } else {
      items.value.splice(idx, 1);
    }
  }

  function removeAll(dishId: string | number, optionLabel?: string) {
    const id = String(dishId);
    items.value = items.value.filter((i) => {
      if (i.dishId !== id) return true;
      if (optionLabel === undefined) return false;
      return i.optionLabel !== optionLabel;
    });
  }

  function clear() {
    items.value = [];
  }

  function getQty(dishId: string | number, optionLabel?: string): number {
    const id = String(dishId);
    return items.value
      .filter((i) => {
        if (i.dishId !== id) return false;
        if (optionLabel === undefined) return true;
        return i.optionLabel === optionLabel;
      })
      .reduce((sum, i) => sum + i.qty, 0);
  }

  const totalQty = computed(() => items.value.reduce((sum, i) => sum + i.qty, 0));
  const totalAmount = computed(() =>
    items.value.reduce((sum, i) => sum + i.price * i.qty, 0),
  );

  return { items, add, remove, removeAll, clear, getQty, totalQty, totalAmount };
});
