import { computed, ref, type Ref } from 'vue';
import type { Dish, DishOption } from '../api/menu';

export type OptionSnapshotLine = {
  groupNameZh: string;
  groupNameVi: string;
  optionNameZh: string;
  optionNameVi: string;
  extraPrice: number;
};

export type OptionGroup = {
  key: string;
  nameZh: string;
  nameVi: string;
  multi: boolean;
  required: boolean;
  opts: DishOption[];
};

export function optionGroupsOf(dish: Dish | null | undefined): OptionGroup[] {
  if (!dish?.options?.length) return [];
  const map = new Map<string, DishOption[]>();
  for (const o of dish.options) {
    const key = `${o.groupNameZh}|${o.groupNameVi}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return [...map.entries()].map(([key, opts]) => ({
    key,
    nameZh: opts[0].groupNameZh,
    nameVi: opts[0].groupNameVi,
    multi: opts[0].multi,
    required: opts[0].required,
    opts,
  }));
}

export function useDishOptionPicker(loc: Ref<'zh' | 'vi'>) {
  const visible = ref(false);
  const dish = ref<Dish | null>(null);
  const selected = ref<Record<string, string[]>>({});
  const qty = ref(1);
  let resolvePick: ((v: { snapshot: OptionSnapshotLine[]; qty: number } | null) => void) | null =
    null;

  const groups = computed(() => optionGroupsOf(dish.value));

  const extra = computed(() => {
    if (!dish.value) return 0;
    let sum = 0;
    for (const g of groups.value) {
      for (const id of selected.value[g.key] || []) {
        const o = g.opts.find((x) => String(x.id) === String(id));
        if (o) sum += Number(o.extraPrice || 0);
      }
    }
    return sum;
  });

  function open(d: Dish): Promise<{ snapshot: OptionSnapshotLine[]; qty: number } | null> {
    const gs = optionGroupsOf(d);
    if (!gs.length) {
      return Promise.resolve({ snapshot: [], qty: 1 });
    }
    dish.value = d;
    qty.value = 1;
    const initial: Record<string, string[]> = {};
    for (const g of gs) {
      if (g.required && !g.multi && g.opts[0]?.id != null) {
        initial[g.key] = [String(g.opts[0].id)];
      } else {
        initial[g.key] = [];
      }
    }
    selected.value = initial;
    visible.value = true;
    return new Promise((resolve) => {
      resolvePick = resolve;
    });
  }

  function toggle(groupKey: string, optionId: string | number, multi: boolean) {
    const id = String(optionId);
    const prev = (selected.value[groupKey] || []).map(String);
    const next = multi
      ? prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
      : [id];
    selected.value = { ...selected.value, [groupKey]: next };
  }

  function isSelected(groupKey: string, optionId: string | number) {
    return (selected.value[groupKey] || []).some((x) => String(x) === String(optionId));
  }

  function cancel() {
    visible.value = false;
    resolvePick?.(null);
    resolvePick = null;
  }

  function confirm(missingRequired: (name: string) => void) {
    if (!dish.value) return;
    const snapshot: OptionSnapshotLine[] = [];
    for (const g of groups.value) {
      const sel = selected.value[g.key] || [];
      if (g.required && !sel.length) {
        missingRequired(loc.value === 'vi' ? g.nameVi : g.nameZh);
        return;
      }
      for (const id of sel) {
        const o = g.opts.find((x) => String(x.id) === String(id));
        if (!o) continue;
        snapshot.push({
          groupNameZh: o.groupNameZh,
          groupNameVi: o.groupNameVi,
          optionNameZh: o.optionNameZh,
          optionNameVi: o.optionNameVi,
          extraPrice: Number(o.extraPrice || 0),
        });
      }
    }
    visible.value = false;
    resolvePick?.({ snapshot, qty: Math.max(1, qty.value) });
    resolvePick = null;
  }

  function groupLabel(g: OptionGroup) {
    return loc.value === 'vi' ? g.nameVi : g.nameZh;
  }

  function optionLabel(o: DishOption) {
    return loc.value === 'vi' ? o.optionNameVi : o.optionNameZh;
  }

  return {
    visible,
    dish,
    selected,
    qty,
    groups,
    extra,
    open,
    toggle,
    isSelected,
    cancel,
    confirm,
    groupLabel,
    optionLabel,
  };
}
