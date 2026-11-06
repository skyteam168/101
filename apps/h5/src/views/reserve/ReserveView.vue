<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showSuccessToast, showToast } from 'vant';
import { formatVND, localeField } from '@restaurant/shared';
import { getStoreInfo, type Dish, type MenuCategory, type StoreInfo } from '../../api/delivery';
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

/** dishId → qty */
const cart = reactive<Record<string, number>>({});

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

const selectedLines = computed(() => {
  const lines: Array<{ dish: Dish; qty: number }> = [];
  for (const [id, qty] of Object.entries(cart)) {
    if (qty <= 0) continue;
    const dish = flatDishes.value.get(id);
    if (dish) lines.push({ dish, qty });
  }
  return lines;
});

const selectedCount = computed(() =>
  selectedLines.value.reduce((s, l) => s + l.qty, 0),
);

const selectedAmount = computed(() =>
  selectedLines.value.reduce((s, l) => s + l.dish.price * l.qty, 0),
);

function setQty(dishId: string, qty: number) {
  if (qty <= 0) {
    delete cart[dishId];
    return;
  }
  cart[dishId] = Math.min(99, qty);
}

function addDish(dish: Dish) {
  setQty(dish.id, (cart[dish.id] || 0) + 1);
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
  for (const k of Object.keys(cart)) delete cart[k];
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
      items: selectedLines.value.map((l) => ({ dishId: l.dish.id, qty: l.qty })),
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
    for (const k of Object.keys(cart)) delete cart[k];
    for (const it of row.items || []) {
      if (it.dishId && it.qty > 0) cart[it.dishId] = it.qty;
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
          <li v-for="line in selectedLines" :key="line.dish.id" class="preorder-line">
            <div class="line-main">
              <span class="line-name">{{ dishName(line.dish) }}</span>
              <span class="line-price">{{ formatVND(line.dish.price) }}</span>
            </div>
            <van-stepper
              :model-value="line.qty"
              integer
              :min="0"
              :max="99"
              @change="(v: number) => setQty(line.dish.id, Number(v))"
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
                    <div class="dish-price">{{ formatVND(d.price) }}</div>
                  </div>
                  <van-stepper
                    v-if="cart[d.id]"
                    :model-value="cart[d.id]"
                    integer
                    :min="0"
                    :max="99"
                    @change="(v: number) => setQty(d.id, Number(v))"
                  />
                  <van-button v-else size="mini" type="primary" round @click="addDish(d)">
                    {{ t('reserve.add') }}
                  </van-button>
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
.dish-price {
  margin-top: 4px;
  font-size: 13px;
  color: #ff6a00;
}
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
