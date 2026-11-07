<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND, localeField, type PrintTicketPayload } from '@restaurant/shared';
import { listCategoriesApi, listDishesApi, type Category, type Dish } from '../../api/menu';
import {
  addOrderItemsApi,
  cancelOrderApi,
  checkoutOrderApi,
  getOrderByTableApi,
  setDiscountApi,
  submitOrderApi,
  voidOrderItemApi,
  type Order,
} from '../../api/order';
import { getStoreSettingsApi } from '../../api/store';
import { listFloorApi, type FloorTable } from '../../api/table';
import TicketPreview from '../../components/print/TicketPreview.vue';
import { useUserStore } from '../../stores/user';
import {
  useDishOptionPicker,
  type OptionSnapshotLine,
} from '../../composables/useDishOptions';
import { buildReceiptPayload } from '../../utils/build-receipt-payload';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));
const {
  visible: optVisible,
  dish: optDish,
  groups: optGroups,
  open: openDishOptions,
  toggle: toggleOpt,
  isSelected: isOptSelected,
  cancel: cancelOpt,
  confirm: confirmOpt,
  groupLabel: optGroupLabel,
  optionLabel: optOptionLabel,
} = useDishOptionPicker(loc);

type CartLine = {
  key: string;
  dish: Dish;
  qty: number;
  optionsSnapshot: OptionSnapshotLine[];
};

const tableId = computed(() => String(route.params.tableId));
const table = ref<FloorTable | null>(null);
const categories = ref<Category[]>([]);
const dishes = ref<Dish[]>([]);
const activeCat = ref('');
const order = ref<Order | null>(null);
const cart = ref<CartLine[]>([]);
const loading = ref(false);
const checkoutVisible = ref(false);
const receiptVisible = ref(false);
const receiptPayload = ref<PrintTicketPayload | null>(null);
const discountVisible = ref(false);
const discountText = ref('0');
const serviceText = ref('0');

const payForm = reactive({
  method: 'cash' as string,
  receivedText: '',
});

/** 优惠明细：规则/券/会员/手动/抹零 */
const discountBreakdown = computed(() => {
  const o = order.value;
  if (!o) return [] as { key: string; label: string; amount: number }[];
  const s = o.promoSnapshot || {};
  const rows: { key: string; label: string; amount: number }[] = [];
  for (const r of s.rules || []) {
    if (r.amount > 0) rows.push({ key: `rule-${r.id}`, label: r.nameZh, amount: r.amount });
  }
  if (s.coupon?.amount) {
    rows.push({ key: 'coupon', label: s.coupon.nameZh, amount: s.coupon.amount });
  }
  const memberAmt = Number(s.memberDiscount) || 0;
  if (memberAmt > 0) {
    const pct = s.memberPercent ? ` ${s.memberPercent}%` : '';
    rows.push({ key: 'member', label: `${t('cashier.memberDiscount')}${pct}`, amount: memberAmt });
  }
  const manual = Number(s.manualDiscount) || 0;
  if (manual > 0) rows.push({ key: 'manual', label: t('order.discountAmount'), amount: manual });
  const round = Number(o.roundOff) || 0;
  if (round > 0) rows.push({ key: 'round', label: t('cashier.roundOff'), amount: round });
  const summed = rows.reduce((n, r) => n + r.amount, 0);
  const residual = Math.max(0, (Number(o.discount) || 0) - summed);
  if (residual > 0 && rows.length === 0) {
    rows.push({ key: 'discount', label: t('order.discount'), amount: Number(o.discount) || 0 });
  } else if (residual > 0) {
    rows.push({ key: 'other', label: t('order.discount'), amount: residual });
  }
  return rows;
});

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

function isSellable(d: Dish) {
  if (d.status !== 'on' || !d.isDineIn) return false;
  if (d.stock != null && d.stock <= 0) return false;
  if (d.dailyStock != null && d.soldToday >= d.dailyStock) return false;
  return true;
}

const filteredDishes = computed(() =>
  dishes.value.filter(
    (d) => isSellable(d) && (!activeCat.value || d.categoryId === activeCat.value),
  ),
);

function lineExtra(snapshot: OptionSnapshotLine[]) {
  return snapshot.reduce((s, o) => s + Number(o.extraPrice || 0), 0);
}

function lineUnitPrice(line: CartLine) {
  return line.dish.price + lineExtra(line.optionsSnapshot);
}

const cartTotal = computed(() =>
  cart.value.reduce((s, c) => s + lineUnitPrice(c) * c.qty, 0),
);

const cashReceived = computed(() => parseThousands(payForm.receivedText) || 0);
const cashChange = computed(() => Math.max(0, cashReceived.value - (order.value?.total ?? 0)));

function cartLineKey(dishId: string, snapshot: OptionSnapshotLine[]) {
  return `${dishId}::${JSON.stringify(snapshot)}`;
}

async function loadMeta() {
  const floor = await listFloorApi();
  for (const a of floor) {
    const found = a.tables.find((x) => x.id === tableId.value);
    if (found) {
      table.value = found;
      break;
    }
  }
  if (!table.value || table.value.status !== 'dining') {
    ElMessage.warning(t('tables.notDining'));
    router.replace('/tables');
  }
}

async function loadMenu() {
  categories.value = await listCategoriesApi();
  dishes.value = await listDishesApi({ status: 'on' });
  if (!activeCat.value && categories.value.length) {
    activeCat.value = categories.value[0].id;
  }
}

async function loadOrder() {
  order.value = await getOrderByTableApi(tableId.value);
}

async function refresh() {
  loading.value = true;
  try {
    await Promise.all([loadMeta(), loadMenu(), loadOrder()]);
  } finally {
    loading.value = false;
  }
}

async function addToCart(dish: Dish) {
  const picked = await openDishOptions(dish);
  if (!picked) return;
  const key = cartLineKey(dish.id, picked.snapshot);
  const line = cart.value.find((c) => c.key === key);
  if (line) line.qty += picked.qty;
  else {
    cart.value.push({
      key,
      dish,
      qty: picked.qty,
      optionsSnapshot: picked.snapshot,
    });
  }
}

function changeCartQty(key: string, delta: number) {
  const idx = cart.value.findIndex((c) => c.key === key);
  if (idx < 0) return;
  cart.value[idx].qty += delta;
  if (cart.value[idx].qty <= 0) cart.value.splice(idx, 1);
}

function removeCartLine(key: string) {
  cart.value = cart.value.filter((c) => c.key !== key);
}

async function submitCart() {
  if (!cart.value.length) return;
  const items = cart.value.map((c) => ({
    dishId: c.dish.id,
    qty: c.qty,
    optionsSnapshot: c.optionsSnapshot.length ? c.optionsSnapshot : undefined,
  }));
  if (order.value) {
    if (!userStore.hasPerm('order:add-item')) return;
    order.value = await addOrderItemsApi(order.value.id, items);
  } else {
    if (!userStore.hasPerm('order:create')) return;
    order.value = await submitOrderApi({ tableId: tableId.value, items });
  }
  cart.value = [];
  ElMessage.success(t('order.submitted'));
  await loadMeta();
}

async function voidItem(itemId: string) {
  const { value } = await ElMessageBox.prompt(t('order.voidReason'), t('order.void'), {
    inputPattern: /.+/,
    inputErrorMessage: t('order.reasonRequired'),
  });
  order.value = await voidOrderItemApi(itemId, value);
  ElMessage.success(t('order.voided'));
}

async function cancelOrder() {
  if (!order.value) return;
  const { value } = await ElMessageBox.prompt(t('order.cancelReason'), t('order.cancel'), {
    inputPattern: /.+/,
    type: 'warning',
  });
  await cancelOrderApi(order.value.id, value);
  ElMessage.success(t('order.cancelled'));
  router.replace('/tables');
}

function openDiscount() {
  discountText.value = formatThousands(order.value?.discount ?? 0);
  serviceText.value = formatThousands(order.value?.serviceCharge ?? 0);
  discountVisible.value = true;
}

async function saveDiscount() {
  if (!order.value) return;
  order.value = await setDiscountApi(order.value.id, {
    discount: parseThousands(discountText.value) || 0,
    serviceCharge: parseThousands(serviceText.value) || 0,
  });
  discountVisible.value = false;
  ElMessage.success(t('common.saved'));
}

/** 现金快捷面额（点击填入实收并立即结账） */
const CASH_QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 3_000_000];

async function checkoutZero() {
  if (!order.value) return;
  await ElMessageBox.confirm(t('cashier.confirmFreeCheckout'), t('order.checkout'), {
    type: 'warning',
  });
  const paid = await checkoutOrderApi(order.value.id, [{ method: 'cash', amount: 0, received: 0 }]);
  checkoutVisible.value = false;
  ElMessage.success(t('order.paidNeedClear'));
  try {
    const store = await getStoreSettingsApi();
    receiptPayload.value = buildReceiptPayload(paid, store);
    receiptVisible.value = true;
  } catch {
    router.replace('/tables');
  }
}

function openCheckout() {
  if (!order.value) {
    ElMessage.warning(t('order.emptyCheckout'));
    return;
  }
  // 免单 / 全额优惠后应付为 0：仍需结账关单，桌台才能进入待清台
  if (Number(order.value.total) === 0) {
    void checkoutZero();
    return;
  }
  if (order.value.total < 0) return;
  payForm.method = 'cash';
  payForm.receivedText = formatThousands(order.value.total);
  checkoutVisible.value = true;
}

async function quickCashPay(n: number) {
  if (!order.value) return;
  payForm.method = 'cash';
  payForm.receivedText = formatThousands(n);
  if (n < order.value.total) {
    ElMessage.warning(t('cashier.cashInsufficient'));
    return;
  }
  await confirmCheckout();
}

async function confirmCheckout() {
  if (!order.value) return;
  // amount = 应付；received = 实收（现金找零 = received - amount）
  const due = Number(order.value.total) || 0;
  const received = cashReceived.value;
  if (payForm.method === 'cash' && received < due) {
    ElMessage.warning(t('cashier.cashInsufficient'));
    return;
  }
  const payments =
    payForm.method === 'cash'
      ? [{ method: 'cash', amount: due, received }]
      : [{ method: payForm.method, amount: due }];
  const paid = await checkoutOrderApi(order.value.id, payments);
  checkoutVisible.value = false;
  ElMessage.success(t('order.paidNeedClear'));
  try {
    const store = await getStoreSettingsApi();
    receiptPayload.value = buildReceiptPayload(paid, store);
    receiptVisible.value = true;
  } catch {
    router.replace('/tables');
  }
}

function closeReceipt() {
  receiptVisible.value = false;
}

function onReceiptClosed() {
  receiptPayload.value = null;
  router.replace('/tables');
}

watch(tableId, () => refresh());
onMounted(refresh);
</script>

<template>
  <div class="pos" v-loading="loading">
    <div class="pos-head">
      <el-button text @click="router.push('/tables')">← {{ t('order.backFloor') }}</el-button>
      <div class="title">
        <strong>{{ table?.code }}</strong>
        <span v-if="table?.session">
          · {{ t('tables.guests', { n: table.session.guestCount }) }}
          · PIN {{ table.session.pin }}
        </span>
      </div>
      <div class="head-actions">
        <el-button v-if="order && userStore.hasPerm('order:discount')" @click="openDiscount">
          {{ t('order.discount') }}
        </el-button>
        <el-button v-if="order && userStore.hasPerm('order:cancel')" type="danger" plain @click="cancelOrder">
          {{ t('order.cancel') }}
        </el-button>
        <el-button
          v-if="order && userStore.hasPerm('order:checkout')"
          type="primary"
          @click="openCheckout"
        >
          {{ t('order.checkout') }}
        </el-button>
      </div>
    </div>

    <div class="pos-body">
      <aside class="cats">
        <button
          v-for="c in categories"
          :key="c.id"
          type="button"
          :class="{ active: activeCat === c.id }"
          @click="activeCat = c.id"
        >
          {{ nameOf(c) }}
        </button>
      </aside>

      <section class="dishes">
        <button
          v-for="d in filteredDishes"
          :key="d.id"
          type="button"
          class="dish"
          @click="addToCart(d)"
        >
          <div
            class="dish-cover"
            :style="d.image ? { backgroundImage: `url(${d.image})` } : undefined"
          />
          <div class="d-name">{{ nameOf(d) }}</div>
          <div class="d-price">{{ formatVND(d.price) }}</div>
        </button>
      </section>

      <aside class="ticket">
        <div class="ticket-title">{{ t('order.ordered') }}</div>
        <div v-if="!order?.batches?.length" class="empty">{{ t('order.noItems') }}</div>
        <div v-for="batch in order?.batches || []" :key="batch.id" class="round">
          <div class="round-h">{{ t('order.round', { n: batch.roundNo }) }}</div>
          <div v-for="it in batch.items" :key="it.id" class="line" :class="{ voided: it.status === 'voided' }">
            <div class="ln">
              <span>{{ nameOf(it) }} ×{{ it.qty }}</span>
              <span>{{ formatVND(it.amount) }}</span>
            </div>
            <el-button
              v-if="it.status !== 'voided' && userStore.hasPerm('order:void-item')"
              link
              type="danger"
              size="small"
              @click="voidItem(it.id)"
            >
              {{ t('order.void') }}
            </el-button>
          </div>
        </div>

        <div class="ticket-title cart-h">{{ t('order.cart') }}</div>
        <div v-if="!cart.length" class="empty">{{ t('order.cartEmpty') }}</div>
        <div v-for="c in cart" :key="c.key" class="line">
          <div class="ln">
            <span>
              {{ nameOf(c.dish) }}
              <small v-if="c.optionsSnapshot.length" class="opt-hint">
                {{
                  c.optionsSnapshot
                    .map((o) => (loc === 'vi' ? o.optionNameVi : o.optionNameZh))
                    .join(' / ')
                }}
              </small>
            </span>
            <span>{{ formatVND(lineUnitPrice(c) * c.qty) }}</span>
          </div>
          <div class="qty">
            <el-button size="small" @click="changeCartQty(c.key, -1)">-</el-button>
            <span>{{ c.qty }}</span>
            <el-button size="small" @click="changeCartQty(c.key, 1)">+</el-button>
            <el-button size="small" type="danger" link @click="removeCartLine(c.key)">
              {{ t('common.delete') }}
            </el-button>
          </div>
        </div>

        <div class="totals">
          <div><span>{{ t('order.cartTotal') }}</span><strong>{{ formatVND(cartTotal) }}</strong></div>
          <template v-if="order">
            <div><span>{{ t('cashier.origin') }}</span><span>{{ formatVND(order.subtotal) }}</span></div>
            <div v-for="row in discountBreakdown" :key="row.key" class="promo-row">
              <span>{{ row.label }}</span>
              <span>-{{ formatVND(row.amount) }}</span>
            </div>
            <div v-if="order.serviceCharge">
              <span>{{ t('order.serviceCharge') }}</span>
              <span>{{ formatVND(order.serviceCharge) }}</span>
            </div>
            <div><span>{{ t('order.billTotal') }}</span><strong>{{ formatVND(order.total) }}</strong></div>
          </template>
        </div>
        <el-button
          v-if="userStore.hasPerm(order ? 'order:add-item' : 'order:create')"
          type="primary"
          class="submit"
          :disabled="!cart.length"
          @click="submitCart"
        >
          {{ order ? t('order.addItems') : t('order.submit') }}
        </el-button>
      </aside>
    </div>

    <el-dialog
      v-model="optVisible"
      :title="optDish ? nameOf(optDish) : t('cashier.tabDishes')"
      width="440px"
      @close="cancelOpt()"
    >
      <div v-for="g in optGroups" :key="g.key" class="opt-group">
        <div class="opt-group-title">
          {{ optGroupLabel(g) }}
          <em v-if="g.required">*</em>
        </div>
        <div class="opt-chips">
          <button
            v-for="o in g.opts"
            :key="String(o.id)"
            type="button"
            class="opt-chip"
            :class="{ on: isOptSelected(g.key, o.id!) }"
            @click="toggleOpt(g.key, o.id!, g.multi)"
          >
            {{ optOptionLabel(o) }}
            <span v-if="o.extraPrice">+{{ formatVND(o.extraPrice) }}</span>
          </button>
        </div>
      </div>
      <template #footer>
        <el-button @click="cancelOpt()">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          @click="confirmOpt((name) => ElMessage.warning(t('cashier.selectOption', { name })))"
        >
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="discountVisible" :title="t('order.discount')" width="400px">
      <el-form label-width="100px">
        <el-form-item :label="t('order.discountAmount')">
          <el-input v-model="discountText" />
        </el-form-item>
        <el-form-item :label="t('order.serviceCharge')">
          <el-input v-model="serviceText" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="discountVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveDiscount">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="checkoutVisible" :title="t('order.checkout')" width="480px">
      <div class="pay-total">{{ formatVND(order?.total ?? 0) }}</div>
      <el-form label-width="100px">
        <el-form-item :label="t('order.payMethod')">
          <el-select v-model="payForm.method" style="width: 100%">
            <el-option value="cash" :label="t('order.cash')" />
            <el-option value="card" :label="t('order.card')" />
            <el-option value="bank_transfer" :label="t('order.bank')" />
            <el-option value="momo" label="MoMo" />
            <el-option value="vnpay" label="VNPay" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="payForm.method === 'cash'" :label="t('order.received')">
          <el-input
            :model-value="payForm.receivedText"
            @update:model-value="(v: string) => (payForm.receivedText = formatThousands(parseThousands(v)))"
          />
          <div class="cash-quick">
            <el-button
              v-for="n in CASH_QUICK_AMOUNTS"
              :key="n"
              size="small"
              :type="n >= (order?.total ?? 0) ? 'primary' : 'default'"
              plain
              @click="quickCashPay(n)"
            >
              {{ formatThousands(n) }}
            </el-button>
          </div>
          <div class="cash-quick-hint">{{ t('cashier.cashQuickHint') }}</div>
        </el-form-item>
        <el-form-item v-if="payForm.method === 'cash'" :label="t('order.change')">
          <span>{{ formatVND(cashChange) }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="checkoutVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmCheckout">{{ t('order.confirmPay') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="receiptVisible"
      :title="t('print.receiptDialogTitle')"
      width="400px"
      destroy-on-close
      :close-on-click-modal="false"
      @closed="onReceiptClosed"
    >
      <TicketPreview v-if="receiptPayload" :payload="receiptPayload" />
      <template #footer>
        <el-button type="primary" @click="closeReceipt">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cash-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.cash-quick-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 1.3;
}
.pos {
  height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
  padding: 8px 12px 12px;
}
.pos-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.title {
  flex: 1;
  font-size: 16px;
}
.head-actions {
  display: flex;
  gap: 8px;
}
.pos-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 120px 1fr 300px;
  gap: 10px;
}
.cats {
  overflow: auto;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 6px;
}
.cats button {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 10px 8px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
}
.cats button.active {
  background: #fff;
  color: #409eff;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.dishes {
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  align-content: start;
}
.dish {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dish:hover {
  border-color: #409eff;
}
.dish-cover {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 6px;
  background: #f3f4f6 center / cover no-repeat;
  flex-shrink: 0;
}
.d-name {
  font-weight: 600;
  font-size: 13px;
  line-height: 1.3;
}
.d-price {
  color: #c45656;
}
.ticket {
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.ticket-title {
  font-weight: 700;
  margin-bottom: 8px;
}
.cart-h {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #ddd;
}
.empty {
  color: #999;
  font-size: 13px;
  margin-bottom: 8px;
}
.round-h {
  font-size: 12px;
  color: #888;
  margin: 6px 0;
}
.line {
  margin-bottom: 6px;
}
.line.voided {
  opacity: 0.45;
  text-decoration: line-through;
}
.ln {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
.qty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.totals {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid #eee;
}
.totals div {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.totals .promo-row {
  color: #f56c6c;
  font-size: 13px;
}
.submit {
  margin-top: 10px;
  width: 100%;
}
.pay-total {
  text-align: center;
  font-size: 28px;
  font-weight: 700;
  color: #c45656;
  margin-bottom: 16px;
}
.opt-hint {
  display: block;
  color: #909399;
  font-size: 12px;
  font-weight: 400;
}
.opt-group { margin-bottom: 12px; }
.opt-group-title { font-weight: 600; margin-bottom: 6px; }
.opt-group-title em { color: #dc2626; font-style: normal; }
.opt-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.opt-chip {
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 13px;
}
.opt-chip.on { border-color: #f59e0b; background: #fffbeb; color: #b45309; }
.opt-chip span { margin-left: 4px; color: #94a3b8; font-size: 12px; }
@media (max-width: 960px) {
  .pos-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }
  .cats {
    display: flex;
    overflow-x: auto;
  }
  .cats button {
    white-space: nowrap;
    width: auto;
  }
}
</style>
