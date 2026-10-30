import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface CartItem {
  dishId: string;
  nameZh: string;
  nameVi: string;
  price: number;
  qty: number;
  optionIds?: number[];
  optionLabel?: string;
}

export const useCartStore = defineStore('deliveryCart', () => {
  const items = ref<CartItem[]>([]);

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
    const idx = items.value.findIndex((i) => i.dishId === id && i.optionLabel === optionLabel);
    if (idx === -1) return;
    if (items.value[idx].qty > 1) {
      items.value[idx].qty -= 1;
    } else {
      items.value.splice(idx, 1);
    }
  }

  function removeAll(dishId: string | number, optionLabel?: string) {
    const id = String(dishId);
    items.value = items.value.filter((i) => !(i.dishId === id && i.optionLabel === optionLabel));
  }

  function clear() {
    items.value = [];
  }

  function getQty(dishId: string | number, optionLabel?: string): number {
    const id = String(dishId);
    return items.value
      .filter((i) => i.dishId === id && i.optionLabel === optionLabel)
      .reduce((sum, i) => sum + i.qty, 0);
  }

  const totalQty = computed(() => items.value.reduce((sum, i) => sum + i.qty, 0));
  const totalAmount = computed(() =>
    items.value.reduce((sum, i) => sum + i.price * i.qty, 0),
  );

  return { items, add, remove, removeAll, clear, getQty, totalQty, totalAmount };
});
