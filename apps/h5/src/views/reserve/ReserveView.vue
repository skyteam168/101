<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showSuccessToast, showToast } from 'vant';
import { formatVND, localeField } from '@restaurant/shared';
import {
  getStoreInfo,
  type Dish,
  type DishOption,
  type MenuCategory,
  type StoreInfo,
} from '../../api/delivery';
import {
  createReservation,
  getMyReservation,
  getReserveMenu,
  getSavedReservePhone,
  saveReservePhone,
  updateMyReservation,
} from '../../api/reservation';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

type OptionSnapshotLine = {
  groupNameZh: string;
  groupNameVi: string;
  optionNameZh: string;
  optionNameVi: string;
  extraPrice: number;
};

type CartLine = {
  key: string;
  dish: Dish;
  qty: number;
  optionsSnapshot: OptionSnapshotLine[];
  optionLabel?: string;
};

const store = ref<StoreInfo | null>(null);
const categories = ref<MenuCategory[]>([]);
const loading = ref(false);
const menuLoading = ref(false);
const submitted = ref(false);
const showDatetimePicker = ref(false);
const showMenu = ref(false);
const activeCategory = ref('');
const editId = ref('');

const form = reactive({
  customerName: '',
  phone: '',
  guestCount: '',
  remark: '',
});

const isEdit = computed(() => Boolean(editId.value));
const pageTitle = computed(() => (isEdit.value ? t('reserve.editTitle') : t('reserve.title')));

const cart = ref<CartLine[]>([]);

const optVisible = ref(false);
const optDish = ref<Dish | null>(null);
const optQty = ref(1);
const optSelected = ref<Record<string, string[]>>({});

const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

function storeName(s: StoreInfo) {
  return loc.value === 'vi' ? s.nameVi || s.nameZh : s.nameZh || s.nameVi;
}

function dishName(d: { nameZh: string; nameVi: string }) {
  return localeField(
    d as unknown as Record<string, unknown>,
    'name',
    loc.value,
  );
}

function catName(c: MenuCategory) {
  return dishName(c);
}

const flatDishes = computed(() => {
  const map = new Map<string, Dish>();
  for (const c of categories.value) {
    for (const d of c.dishes || []) map.set(d.id, d);
  }
  return map;
});

function cartLineKey(dishId: string, snapshot: OptionSnapshotLine[]) {
  return `${dishId}::${JSON.stringify(snapshot)}`;
}

function snapshotExtra(snapshot: OptionSnapshotLine[]) {
  return snapshot.reduce((s, o) => s + Number(o.extraPrice || 0), 0);
}

function lineUnitPrice(line: CartLine) {
  return Number(line.dish.price) + snapshotExtra(line.optionsSnapshot);
}

function optionLabelOf(snapshot: OptionSnapshotLine[]) {
  return snapshot
    .map((o) => (loc.value === 'vi' ? o.optionNameVi : o.optionNameZh))
    .join(' / ');
}

function normalizeSnapshot(raw: unknown): OptionSnapshotLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .map((o) => ({
      groupNameZh: String(o.groupNameZh ?? ''),
      groupNameVi: String(o.groupNameVi ?? ''),
      optionNameZh: String(o.optionNameZh ?? ''),
      optionNameVi: String(o.optionNameVi ?? ''),
      extraPrice: Number(o.extraPrice || 0),
    }));
}

const selectedLines = computed(() => cart.value.filter((l) => l.qty > 0));

const selectedCount = computed(() =>
  selectedLines.value.reduce((s, l) => s + l.qty, 0),
);

const selectedAmount = computed(() =>
  selectedLines.value.reduce((s, l) => s + lineUnitPrice(l) * l.qty, 0),
);

function cartQtyOf(dishId: string) {
  const id = String(dishId);
  return cart.value
    .filter((l) => String(l.dish.id) === id)
    .reduce((s, l) => s + l.qty, 0);
}

function setLineQty(key: string, qty: number) {
  const idx = cart.value.findIndex((l) => l.key === key);
  if (idx < 0) return;
  if (qty <= 0) {
    cart.value.splice(idx, 1);
    return;
  }
  cart.value[idx].qty = Math.min(99, qty);
}

function pushOrBump(
  dish: Dish,
  qty: number,
  snapshot: OptionSnapshotLine[],
  optionLabel: string,
) {
  const key = cartLineKey(dish.id, snapshot);
  const line = cart.value.find((l) => l.key === key);
  if (line) {
    line.qty = Math.min(99, line.qty + qty);
    return;
  }
  cart.value.push({
    key,
    dish,
    qty: Math.min(99, qty),
    optionsSnapshot: snapshot,
    optionLabel: optionLabel || undefined,
  });
}

function optionGroups(dish: Dish) {
  const map = new Map<string, DishOption[]>();
  for (const o of dish.options || []) {
    const key = `${o.groupNameZh}|${o.groupNameVi}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return [...map.entries()].map(([key, opts]) => ({
    key,
    name: loc.value === 'vi' ? opts[0].groupNameVi : opts[0].groupNameZh,
    multi: opts[0].multi,
    required: opts[0].required,
    opts,
  }));
}

function openDish(dish: Dish) {
  optDish.value = dish;
  optQty.value = 1;
  const groups = optionGroups(dish);
  const initial: Record<string, string[]> = {};
  for (const g of groups) {
    if (g.required && !g.multi && g.opts[0]) {
      initial[g.key] = [String(g.opts[0].id)];
    } else {
      initial[g.key] = [];
    }
  }
  optSelected.value = initial;
  if (!groups.length) {
    pushOrBump(dish, 1, [], '');
    return;
  }
  optVisible.value = true;
}

const optExtra = computed(() => {
  if (!optDish.value) return 0;
  let sum = 0;
  for (const g of optionGroups(optDish.value)) {
    for (const id of optSelected.value[g.key] || []) {
      const o = g.opts.find((x) => String(x.id) === String(id));
      if (o) sum += Number(o.extraPrice || 0);
    }
  }
  return sum;
});

const optUnitPrice = computed(() => {
  if (!optDish.value) return 0;
  return Number(optDish.value.price) + optExtra.value;
});

function isOptSelected(groupKey: string, optionId: string | number) {
  const id = String(optionId);
  return (optSelected.value[groupKey] || []).some((x) => String(x) === id);
}

function toggleOptChip(groupKey: string, optionId: string | number, multi: boolean) {
  const id = String(optionId);
  const prev = (optSelected.value[groupKey] || []).map(String);
  const next = multi
    ? prev.includes(id)
      ? prev.filter((x) => x !== id)
      : [...prev, id]
    : [id];
  optSelected.value = { ...optSelected.value, [groupKey]: next };
}

function confirmOptions() {
  if (!optDish.value) return;
  const snapshot: OptionSnapshotLine[] = [];
  const labels: string[] = [];
  for (const g of optionGroups(optDish.value)) {
    const selected = optSelected.value[g.key] || [];
    if (g.required && !selected.length) {
      showToast(t('shop.selectOption', { name: g.name }));
      return;
    }
    for (const id of selected) {
      const o = g.opts.find((x) => String(x.id) === String(id));
      if (!o) continue;
      snapshot.push({
        groupNameZh: o.groupNameZh,
        groupNameVi: o.groupNameVi,
        optionNameZh: o.optionNameZh,
        optionNameVi: o.optionNameVi,
        extraPrice: Number(o.extraPrice || 0),
      });
      labels.push(loc.value === 'vi' ? o.optionNameVi : o.optionNameZh);
    }
  }
  pushOrBump(optDish.value, optQty.value, snapshot, labels.join(' / '));
  optVisible.value = false;
}

/** 无规格：改数量；有规格：加号打开规格弹窗 */
function plusDish(dish: Dish) {
  if ((dish.options || []).length) {
    openDish(dish);
    return;
  }
  pushOrBump(dish, 1, [], '');
}

function minusDish(dish: Dish) {
  const id = String(dish.id);
  const lines = cart.value.filter((l) => String(l.dish.id) === id);
  if (!lines.length) return;
  const last = lines[lines.length - 1];
  setLineQty(last.key, last.qty - 1);
}

function openMenu() {
  if (!categories.value.length) {
    showToast(t('reserve.menuEmpty'));
    return;
  }
  if (!activeCategory.value && categories.value[0]) {
    activeCategory.value = categories.value[0].id;
  }
  showMenu.value = true;
}

const minDate = new Date();
const pickerDate = ref<string[]>([]);
const pickerTime = ref<string[]>([]);
const reserveAtIso = ref('');

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function initPickerDefaults() {
  const base = reserveAtIso.value ? new Date(reserveAtIso.value) : new Date(Date.now() + 60 * 60 * 1000);
  pickerDate.value = [String(base.getFullYear()), pad(base.getMonth() + 1), pad(base.getDate())];
  pickerTime.value = [pad(base.getHours()), pad(base.getMinutes())];
}

const reserveAtDisplay = computed(() => {
  if (!reserveAtIso.value) return '';
  const d = new Date(reserveAtIso.value);
  if (Number.isNaN(d.getTime())) return reserveAtIso.value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

function openDatetimePicker() {
  initPickerDefaults();
  showDatetimePicker.value = true;
}

function onDatetimeConfirm() {
  const [y, mo, d] = pickerDate.value;
  const [h, mi] = pickerTime.value;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0);
  reserveAtIso.value = dt.toISOString();
  showDatetimePicker.value = false;
}

function clearFields() {
  form.customerName = '';
  form.phone = '';
  form.guestCount = '';
  form.remark = '';
  reserveAtIso.value = '';
  cart.value = [];
}

async function handleSubmit() {
  if (!form.customerName.trim()) {
    showToast(t('reserve.nameRequired'));
    return;
  }
  if (!form.phone.trim()) {
    showToast(t('reserve.phoneRequired'));
    return;
  }
  const guests = Number(form.guestCount);
  if (!form.guestCount || !Number.isFinite(guests) || guests < 1) {
    showToast(t('reserve.guestCountRequired'));
    return;
  }
  if (!reserveAtIso.value) {
    showToast(t('reserve.reserveAtRequired'));
    return;
  }

  loading.value = true;
  try {
    const payload = {
      customerName: form.customerName.trim(),
      phone: form.phone.trim(),
      guestCount: guests,
      reserveAt: reserveAtIso.value,
      remark: form.remark.trim() || undefined,
      items: selectedLines.value.map((l) => ({
        dishId: l.dish.id,
        qty: l.qty,
        optionsSnapshot: l.optionsSnapshot.length ? l.optionsSnapshot : undefined,
      })),
    };
    if (isEdit.value) {
      await updateMyReservation(editId.value, payload);
      saveReservePhone(payload.phone);
      showSuccessToast(t('reserve.updateOk'));
      router.replace({ name: 'my-reservations', query: { phone: payload.phone } });
      return;
    }
    await createReservation(payload);
    saveReservePhone(payload.phone);
    showSuccessToast(
      selectedCount.value
        ? t('reserve.successWithPreorder', { n: selectedCount.value })
        : t('reserve.success'),
    );
    clearFields();
    submitted.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadEdit() {
  const id = typeof route.query.id === 'string' ? route.query.id : '';
  const qPhone =
    (typeof route.query.phone === 'string' ? route.query.phone : '') ||
    getSavedReservePhone();
  if (!id || !qPhone) return;
  editId.value = id;
  form.phone = qPhone;
  try {
    const row = await getMyReservation(id, qPhone);
    form.customerName = row.customerName;
    form.phone = row.phone;
    form.guestCount = String(row.guestCount);
    form.remark = row.remark || '';
    reserveAtIso.value = new Date(row.reserveAt).toISOString();
    cart.value = [];
    for (const it of row.items || []) {
      if (!it.dishId || it.qty <= 0) continue;
      const dish = flatDishes.value.get(String(it.dishId));
      if (!dish) continue;
      const snapshot = normalizeSnapshot(it.optionsSnapshot);
      pushOrBump(dish, it.qty, snapshot, optionLabelOf(snapshot));
    }
  } catch {
    editId.value = '';
    showToast(t('reserve.loadFailed'));
  }
}

onMounted(async () => {
  try {
    store.value = await getStoreInfo();
  } catch {
    /* 门店信息可选 */
  }
  if (!editId.value && !route.query.id) {
    form.phone = getSavedReservePhone();
  }
  menuLoading.value = true;
  try {
    categories.value = await getReserveMenu();
    if (categories.value[0]) activeCategory.value = categories.value[0].id;
  } catch {
    categories.value = [];
  } finally {
    menuLoading.value = false;
  }
  await loadEdit();
});
</script>

<template>
  <div class="reserve-page">
    <van-nav-bar
      :title="pageTitle"
      left-arrow
      fixed
      placeholder
      @click-left="router.back()"
    >
      <template #right>
        <button type="button" class="nav-link" @click="router.push({ name: 'my-reservations' })">
          {{ t('reserve.myTitle') }}
        </button>
      </template>
    </van-nav-bar>

    <div v-if="store" class="store-bar">
      <van-icon name="shop-o" size="20" color="#ff6a00" />
      <span>{{ storeName(store) }}</span>
    </div>

    <van-form @submit="handleSubmit">
      <van-cell-group inset>
        <van-field
          v-model="form.customerName"
          :label="t('reserve.customerName')"
          :placeholder="t('reserve.customerNamePlaceholder')"
          maxlength="64"
          required
        />
        <van-field
          v-model="form.phone"
          type="tel"
          :label="t('reserve.phone')"
          :placeholder="t('reserve.phonePlaceholder')"
          maxlength="20"
          :readonly="isEdit"
          required
        />
        <van-field
          v-model="form.guestCount"
          type="digit"
          :label="t('reserve.guestCount')"
          :placeholder="t('reserve.guestCountPlaceholder')"
          required
        />
        <van-field
          :model-value="reserveAtDisplay"
          readonly
          is-link
          :label="t('reserve.reserveAt')"
          :placeholder="t('reserve.reserveAtPlaceholder')"
          required
          @click="openDatetimePicker"
        />
        <van-field
          v-model="form.remark"
          type="textarea"
          rows="2"
          autosize
          :label="t('reserve.remark')"
          :placeholder="t('reserve.remarkPlaceholder')"
          maxlength="200"
          show-word-limit
        />
      </van-cell-group>

      <div class="preorder-card">
        <div class="preorder-head">
          <div>
            <div class="preorder-title">{{ t('reserve.preorder') }}</div>
            <div class="preorder-hint">{{ t('reserve.preorderHint') }}</div>
          </div>
          <van-button
            size="small"
            type="primary"
            plain
            round
            :loading="menuLoading"
            @click="openMenu"
          >
            {{ selectedCount ? t('reserve.editDishes') : t('reserve.pickDishes') }}
          </van-button>
        </div>

        <div v-if="!selectedLines.length" class="preorder-empty">
          {{ t('reserve.preorderOptional') }}
        </div>
        <ul v-else class="preorder-list">
          <li v-for="line in selectedLines" :key="line.key" class="preorder-line">
            <div class="line-main">
              <span class="line-name">{{ dishName(line.dish) }}</span>
              <span v-if="line.optionLabel" class="line-opt">{{ line.optionLabel }}</span>
              <span class="line-price">{{ formatVND(lineUnitPrice(line)) }}</span>
            </div>
            <van-stepper
              :model-value="line.qty"
              integer
              :min="0"
              :max="99"
              @change="(v: number) => setLineQty(line.key, Number(v))"
            />
          </li>
          <li class="preorder-total">
            <span>{{ t('reserve.preorderTotal', { n: selectedCount }) }}</span>
            <strong>{{ formatVND(selectedAmount) }}</strong>
          </li>
        </ul>
      </div>

      <div class="submit-wrap">
        <van-button type="primary" block round native-type="submit" :loading="loading">
          {{ isEdit ? t('reserve.saveEdit') : t('reserve.submit') }}
        </van-button>
      </div>
    </van-form>

    <div v-if="submitted" class="success-box">
      <van-empty :description="t('reserve.successHint')" />
      <van-button
        type="primary"
        plain
        round
        block
        class="success-btn"
        @click="router.push({ name: 'my-reservations' })"
      >
        {{ t('reserve.viewMine') }}
      </van-button>
    </div>

    <van-popup v-model:show="showDatetimePicker" position="bottom" round>
      <van-picker-group
        :title="t('reserve.reserveAt')"
        :tabs="[t('reserve.pickDate'), t('reserve.pickTime')]"
        @confirm="onDatetimeConfirm"
        @cancel="showDatetimePicker = false"
      >
        <van-date-picker v-model="pickerDate" :min-date="minDate" />
        <van-time-picker v-model="pickerTime" :columns-type="['hour', 'minute']" />
      </van-picker-group>
    </van-popup>

    <van-popup
      v-model:show="showMenu"
      position="bottom"
      round
      :style="{ height: '78%' }"
      class="menu-popup"
    >
      <div class="menu-sheet">
        <div class="menu-sheet-title">{{ t('reserve.pickDishes') }}</div>
        <div class="menu-body">
          <div class="menu-cats">
            <button
              v-for="c in categories"
              :key="c.id"
              type="button"
              class="cat-btn"
              :class="{ on: activeCategory === c.id }"
              @click="activeCategory = c.id"
            >
              {{ catName(c) }}
            </button>
          </div>
          <div class="menu-dishes">
            <template v-for="c in categories" :key="c.id">
              <div v-show="activeCategory === c.id">
                <div v-for="d in c.dishes" :key="d.id" class="dish-row">
                  <div
                    class="dish-thumb"
                    :style="d.image ? { backgroundImage: `url(${d.image})` } : undefined"
                  />
                  <div class="dish-info">
                    <div class="dish-name">{{ dishName(d) }}</div>
                    <div v-if="d.options?.length" class="spec-hint">{{ t('shop.hasOptions') }}</div>
                    <div class="dish-price">{{ formatVND(d.price) }}</div>
                  </div>
                  <div class="qty-ctrl">
                    <button
                      v-if="cartQtyOf(d.id) > 0"
                      type="button"
                      class="qty-btn qty-minus"
                      aria-label="minus"
                      @click="minusDish(d)"
                    >
                      <van-icon name="minus" size="12" />
                    </button>
                    <span v-if="cartQtyOf(d.id) > 0" class="qty-num">
                      {{ cartQtyOf(d.id) }}
                    </span>
                    <button
                      type="button"
                      class="qty-btn qty-plus"
                      aria-label="plus"
                      @click="plusDish(d)"
                    >
                      <van-icon name="plus" size="14" />
                    </button>
                  </div>
                </div>
                <div v-if="!(c.dishes || []).length" class="preorder-empty">
                  {{ t('reserve.menuEmpty') }}
                </div>
              </div>
            </template>
          </div>
        </div>
        <div class="menu-footer">
          <div class="menu-footer-sum">
            <span>{{ t('reserve.preorderTotal', { n: selectedCount }) }}</span>
            <strong>{{ formatVND(selectedAmount) }}</strong>
          </div>
          <van-button type="primary" round @click="showMenu = false">
            {{ t('reserve.donePick') }}
          </van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="optVisible" position="bottom" round :style="{ maxHeight: '85%' }">
      <div class="opt" v-if="optDish">
        <div class="opt-head">
          <h3>{{ dishName(optDish) }}</h3>
          <div class="opt-price">{{ formatVND(optUnitPrice) }}</div>
        </div>
        <div v-for="g in optionGroups(optDish)" :key="g.key" class="og">
          <div class="og-t">
            {{ g.name }}
            <span v-if="g.required" class="req">*</span>
            <span v-if="g.multi" class="og-hint">{{ t('shop.multiSelect') }}</span>
          </div>
          <div class="og-chips" role="group" :aria-label="g.name">
            <button
              v-for="o in g.opts"
              :key="o.id"
              type="button"
              class="chip"
              :class="{ active: isOptSelected(g.key, o.id) }"
              @click.stop="toggleOptChip(g.key, o.id, !!g.multi)"
            >
              <span class="chip-name">{{ loc === 'vi' ? o.optionNameVi : o.optionNameZh }}</span>
              <span v-if="o.extraPrice" class="chip-extra">+{{ formatVND(o.extraPrice) }}</span>
            </button>
          </div>
        </div>
        <div class="opt-foot">
          <van-stepper v-model="optQty" :min="1" />
          <van-button type="danger" round class="opt-add" @click="confirmOptions">
            {{ t('reserve.add') }} · {{ formatVND(optUnitPrice * optQty) }}
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.reserve-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 32px;
}
.nav-link {
  border: 0;
  background: transparent;
  color: #ff6a00;
  font-size: 13px;
  padding: 0 4px;
}
.success-box {
  padding: 8px 16px 24px;
}
.success-btn {
  margin-top: 8px;
}
.store-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px 0;
  padding: 12px 14px;
  background: #fff;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: #323233;
}
.preorder-card {
  margin: 12px 16px 0;
  padding: 14px;
  background: #fff;
  border-radius: 12px;
}
.preorder-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.preorder-title {
  font-size: 15px;
  font-weight: 600;
  color: #323233;
}
.preorder-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #969799;
  line-height: 1.4;
}
.preorder-empty {
  margin-top: 12px;
  padding: 16px 8px;
  text-align: center;
  color: #c8c9cc;
  font-size: 13px;
}
.preorder-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.preorder-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid #f2f3f5;
}
.line-main {
  flex: 1;
  min-width: 0;
}
.line-name {
  display: block;
  font-size: 14px;
  color: #323233;
}
.line-opt {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #969799;
}
.line-price {
  font-size: 12px;
  color: #969799;
}
.preorder-total {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #ebedf0;
  font-size: 13px;
  color: #646566;
}
.preorder-total strong {
  color: #ff6a00;
  font-size: 15px;
}
.submit-wrap {
  margin: 24px 16px 0;
}
.success-hint {
  margin-top: 16px;
}
.menu-sheet {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}
.menu-sheet-title {
  padding: 16px;
  text-align: center;
  font-weight: 600;
  font-size: 16px;
  border-bottom: 1px solid #f2f3f5;
}
.menu-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.menu-cats {
  width: 92px;
  overflow-y: auto;
  background: #f7f8fa;
}
.cat-btn {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 14px 8px;
  font-size: 13px;
  color: #646566;
  text-align: center;
}
.cat-btn.on {
  background: #fff;
  color: #ff6a00;
  font-weight: 600;
}
.menu-dishes {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px 16px;
}
.dish-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid #f7f8fa;
}
.dish-thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  flex-shrink: 0;
  background: #f2f3f5 center / cover no-repeat;
}
.dish-info {
  flex: 1;
  min-width: 0;
}
.dish-name {
  font-size: 14px;
  color: #323233;
}
.spec-hint {
  margin-top: 2px;
  font-size: 11px;
  color: #969799;
}
.dish-price {
  margin-top: 4px;
  font-size: 13px;
  color: #ff6a00;
}
.qty-ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.qty-num {
  font-size: 14px;
  font-weight: 700;
  min-width: 16px;
  text-align: center;
  line-height: 1;
  color: #323233;
}
.qty-btn {
  box-sizing: border-box;
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  margin: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.qty-plus {
  border: none;
  background: #ff6a00;
  color: #fff;
  box-shadow: 0 4px 10px rgba(255, 106, 0, 0.28);
}
.qty-minus {
  border: 1px solid #ebedf0;
  background: #fff;
  color: #646566;
}
.opt {
  padding: 16px 16px 24px;
}
.opt-head h3 {
  margin: 0 0 6px;
  font-size: 16px;
}
.opt-price {
  color: #ff6a00;
  font-weight: 700;
  margin-bottom: 12px;
}
.og {
  margin-bottom: 14px;
  padding: 12px;
  background: #f7f8fa;
  border-radius: 12px;
}
.og-t {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  margin-bottom: 10px;
  font-size: 14px;
}
.og-hint {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: #969799;
}
.req { color: #ee0a24; }
.og-chips {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  min-height: 44px;
  padding: 10px 6px;
  border: 1.5px solid #ebedf0;
  border-radius: 10px;
  background: #fff;
  color: #323233;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  box-sizing: border-box;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  appearance: none;
  -webkit-appearance: none;
}
.chip.active {
  border-color: #ff6a00 !important;
  background: #fff5eb !important;
  color: #ff6a00 !important;
  box-shadow: 0 0 0 1px #ff6a00;
}
.chip-name { text-align: center; }
.chip-extra {
  font-size: 11px;
  font-weight: 700;
  color: #ff6a00;
  white-space: nowrap;
}
.opt-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.opt-add { flex: 1; }
.menu-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid #ebedf0;
}
.menu-footer-sum {
  font-size: 13px;
  color: #646566;
}
.menu-footer-sum strong {
  display: block;
  margin-top: 2px;
  color: #ff6a00;
  font-size: 16px;
}
</style>
