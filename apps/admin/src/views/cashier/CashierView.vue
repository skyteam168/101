<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  CircleClose,
  Discount,
  DocumentChecked,
  EditPen,
  Minus,
  PriceTag,
} from '@element-plus/icons-vue';
import { formatVND, localeField, type PrintTicketPayload } from '@restaurant/shared';
import { listCategoriesApi, listDishesApi, type Category, type Dish } from '../../api/menu';
import { addComboItemApi, listCombosApi, type Combo, type ComboGroup } from '../../api/combo';
import {
  addOrderItemsApi,
  addTempItemApi,
  bindCustomerApi,
  checkoutOrderApi,
  createTakeawayOrderApi,
  freeOrderApi,
  getOrderApi,
  getOrderByTableApi,
  listOpenTakeawaysApi,
  setDiscountApi,
  submitOrderApi,
  updateLineItemApi,
  voidOrderItemApi,
  type Order,
  type OrderItem,
} from '../../api/order';
import { listFloorApi, openTableApi, type FloorTable } from '../../api/table';
import { listCouponsApi } from '../../api/marketing';
import { searchMembersApi, type Member } from '../../api/member';
import { getStoreSettingsApi } from '../../api/store';
import TicketPreview from '../../components/print/TicketPreview.vue';
import { useUserStore } from '../../stores/user';
import { buildReceiptPayload } from '../../utils/build-receipt-payload';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const userStore = useUserStore();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const loading = ref(false);
/** 堂食 / 外带 */
const orderMode = ref<'dine_in' | 'takeaway'>('dine_in');
const tables = ref<FloorTable[]>([]);
const tableId = ref('');
const openTakeaways = ref<Order[]>([]);
const takeawayOrderId = ref('');
const categories = ref<Category[]>([]);
const dishes = ref<Dish[]>([]);
const activeCat = ref('');
/** 右侧菜品区 Tab：dishes | combos */
const menuTab = ref<'dishes' | 'combos'>('dishes');
const combos = ref<Combo[]>([]);
const comboDialog = ref(false);
const selectedCombo = ref<Combo | null>(null);
/** 每个分组已选的 dishIds */
const comboSelections = ref<Record<string, string[]>>({});
const order = ref<Order | null>(null);
const cart = ref<{ dish: Dish; qty: number }[]>([]);
const memberKeyword = ref('');
const members = ref<Member[]>([]);
const selectedMember = ref<Member | null>(null);
const coupons = ref<{ id: string; code: string; template: { nameZh: string; nameVi: string } }[]>([]);
const couponId = ref('');

const checkoutVisible = ref(false);
const receiptVisible = ref(false);
const receiptPayload = ref<PrintTicketPayload | null>(null);
const tempVisible = ref(false);
const discountVisible = ref(false);
const tempForm = reactive({ nameZh: '', nameVi: '', unitPriceText: '', qty: 1 });
const discountText = ref('0');
const roundOffText = ref('0');
type PayLine = { method: string; amountText: string; receivedText: string };
const payLines = ref<PayLine[]>([
  { method: 'cash', amountText: '', receivedText: '' },
]);
const PAY_METHODS = ['cash', 'card', 'bank_transfer'] as const;

function payMethodLabel(m: string) {
  return t(`order.payMethodMap.${m}`);
}

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

const activeItems = computed(() =>
  (order.value?.items || []).filter((i) => i.status !== 'voided'),
);

const snap = computed(() => order.value?.promoSnapshot || null);

/** 优惠明细：规则/券/会员/手动/抹零（避免整段 discount 与条目重复加算） */
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

function isSellable(d: Dish) {
  if (d.status !== 'on') return false;
  if (orderMode.value === 'takeaway') {
    if (!d.isDineIn && !d.isDelivery) return false;
  } else if (!d.isDineIn) {
    return false;
  }
  if (d.stock != null && d.stock <= 0) return false;
  if (d.dailyStock != null && d.soldToday >= d.dailyStock) return false;
  return true;
}

function dishUnitPrice(d: Dish) {
  return orderMode.value === 'takeaway' ? (d.takeawayPrice ?? d.price) : d.price;
}

const filteredDishes = computed(() =>
  dishes.value.filter((d) => isSellable(d) && (!activeCat.value || d.categoryId === activeCat.value)),
);

async function loadTables() {
  const floor = await listFloorApi();
  tables.value = floor.flatMap((a) => a.tables);
  if (!tableId.value && tables.value.length) {
    const dining = tables.value.find((x) => x.status === 'dining');
    tableId.value = dining?.id || tables.value[0].id;
  }
}

async function loadMenu() {
  categories.value = await listCategoriesApi();
  dishes.value = await listDishesApi({ status: 'on' });
  if (!activeCat.value && categories.value.length) activeCat.value = categories.value[0].id;
}

async function loadCombos() {
  combos.value = await listCombosApi({ status: 'on' });
}

/** 点击套餐：判断是否需弹框选择分组菜品 */
async function pickCombo(combo: Combo) {
  if (!order.value) {
    ElMessage.warning(t('cashier.needOrder'));
    return;
  }
  // 判断是否所有分组都有默认值可满足 min 要求
  const needPick = (combo.groups || []).some((g: ComboGroup) => {
    const defaults = (g.items || []).filter((i) => i.isDefault);
    return defaults.length < g.minSelect;
  });
  if (!needPick) {
    // 直接使用默认
    const selections = (combo.groups || []).map((g: ComboGroup) => ({
      groupId: g.id!,
      dishIds: (g.items || []).filter((i) => i.isDefault).map((i) => i.dishId),
    }));
    await addComboItemApi(order.value.id, { comboId: combo.id, selections });
    ElMessage.success(t('order.submitted'));
    await loadOrder();
  } else {
    // 弹框选择
    selectedCombo.value = combo;
    comboSelections.value = {};
    (combo.groups || []).forEach((g: ComboGroup) => {
      comboSelections.value[g.id!] = (g.items || [])
        .filter((i) => i.isDefault)
        .map((i) => i.dishId);
    });
    comboDialog.value = true;
  }
}

async function submitComboSelection() {
  if (!order.value || !selectedCombo.value) return;
  const combo = selectedCombo.value;
  // 校验每组 min
  for (const g of combo.groups || []) {
    const sel = comboSelections.value[g.id!] || [];
    if (sel.length < g.minSelect) {
      ElMessage.warning(`${nameOf(g)}: ${t('combo.groupMin')} ${g.minSelect}`);
      return;
    }
  }
  const selections = (combo.groups || []).map((g: ComboGroup) => ({
    groupId: g.id!,
    dishIds: comboSelections.value[g.id!] || [],
  }));
  await addComboItemApi(order.value.id, { comboId: combo.id, selections });
  ElMessage.success(t('order.submitted'));
  comboDialog.value = false;
  await loadOrder();
}

function dishNameById(dishId: string) {
  const d = dishes.value.find((x) => x.id === dishId);
  return d ? nameOf(d) : dishId;
}

async function loadOpenTakeaways() {
  openTakeaways.value = await listOpenTakeawaysApi();
  if (
    takeawayOrderId.value &&
    !openTakeaways.value.some((o) => o.id === takeawayOrderId.value)
  ) {
    takeawayOrderId.value = '';
  }
}

async function loadOrder() {
  if (orderMode.value === 'takeaway') {
    if (!takeawayOrderId.value) {
      order.value = null;
      return;
    }
    order.value = await getOrderApi(takeawayOrderId.value);
  } else {
    if (!tableId.value) {
      order.value = null;
      return;
    }
    order.value = await getOrderByTableApi(tableId.value);
  }
  if (order.value?.customerId) {
    const found = members.value.find((m) => m.id === order.value!.customerId);
    if (found) selectedMember.value = found;
  }
}

async function refresh() {
  loading.value = true;
  try {
    await Promise.all([loadTables(), loadMenu(), loadCombos(), loadOpenTakeaways()]);
    await loadOrder();
  } finally {
    loading.value = false;
  }
}

async function switchMode(mode: 'dine_in' | 'takeaway') {
  orderMode.value = mode;
  cart.value = [];
  order.value = null;
  selectedMember.value = null;
  if (mode === 'takeaway') {
    takeawayOrderId.value = '';
    await loadOpenTakeaways();
  } else {
    await loadOrder();
  }
}

async function pickTakeawayOrder(id: string) {
  takeawayOrderId.value = id;
  await loadOrder();
}

function startNewTakeaway() {
  takeawayOrderId.value = '';
  order.value = null;
  cart.value = [];
  selectedMember.value = null;
}

onMounted(() => {
  void refresh();
  window.addEventListener('keydown', onCashierKey);
});
onUnmounted(() => window.removeEventListener('keydown', onCashierKey));
watch(tableId, () => {
  if (orderMode.value === 'dine_in') void loadOrder();
});
watch(takeawayOrderId, () => {
  if (orderMode.value === 'takeaway') void loadOrder();
});

async function ensureDining() {
  await loadTables();
  const table = tables.value.find((x) => x.id === tableId.value);
  if (!table) return false;
  if (table.status === 'dining') return true;
  if (table.status !== 'idle') {
    ElMessage.warning(t('cashier.tableBusy'));
    return false;
  }
  try {
    await openTableApi(table.id, 2);
  } catch {
    // 桌台状态可能过期：重新拉取后若已在用餐则继续下单（业务错误已由 http 拦截器提示）
    await loadTables();
    const again = tables.value.find((x) => x.id === tableId.value);
    if (again?.status === 'dining') return true;
    return false;
  }
  await loadTables();
  return true;
}

function addToCart(dish: Dish) {
  const line = cart.value.find((c) => c.dish.id === dish.id);
  if (line) line.qty += 1;
  else cart.value.push({ dish, qty: 1 });
}

async function submitCart() {
  if (!cart.value.length) return;
  const items = cart.value.map((c) => ({ dishId: c.dish.id, qty: c.qty }));
  if (orderMode.value === 'takeaway') {
    if (order.value) {
      order.value = await addOrderItemsApi(order.value.id, items);
    } else {
      order.value = await createTakeawayOrderApi({ items });
      takeawayOrderId.value = order.value.id;
    }
    cart.value = [];
    ElMessage.success(t('order.submitted'));
    await loadOpenTakeaways();
    return;
  }
  if (!(await ensureDining())) return;
  if (order.value) {
    order.value = await addOrderItemsApi(order.value.id, items);
  } else {
    order.value = await submitOrderApi({ tableId: tableId.value, items });
  }
  cart.value = [];
  ElMessage.success(t('order.submitted'));
  await loadTables();
}

async function voidItem(item: OrderItem) {
  const { value } = await ElMessageBox.prompt(t('order.voidReason'), t('order.void'), {
    inputPattern: /.+/,
  });
  order.value = await voidOrderItemApi(item.id, value);
}

async function giftItem(item: OrderItem) {
  order.value = await updateLineItemApi(item.id, { isGift: true });
}

async function discountItem(item: OrderItem) {
  const { value } = await ElMessageBox.prompt(t('cashier.linePercent'), t('order.discount'), {
    inputPattern: /^\d{1,3}$/,
    inputValue: '10',
  });
  order.value = await updateLineItemApi(item.id, { percent: Number(value) });
}

async function searchMembers() {
  members.value = await searchMembersApi(memberKeyword.value || undefined);
}

async function pickMember(m: Member) {
  selectedMember.value = m;
  if (!order.value) {
    ElMessage.warning(t('cashier.needOrder'));
    return;
  }
  order.value = await bindCustomerApi(order.value.id, { customerId: m.id });
  const list = await listCouponsApi({ customerId: m.id });
  coupons.value = list
    .filter((c) => c.status === 'unused')
    .map((c) => ({
      id: c.id,
      status: c.status,
      code: c.code,
      template: { nameZh: c.template.nameZh, nameVi: c.template.nameVi },
    }));
}

async function applyCoupon() {
  if (!order.value || !selectedMember.value) return;
  order.value = await bindCustomerApi(order.value.id, {
    customerId: selectedMember.value.id,
    couponId: couponId.value || null,
  });
  ElMessage.success(t('common.saved'));
}

async function saveTemp() {
  if (!order.value) {
    ElMessage.warning(t('cashier.needOrder'));
    return;
  }
  order.value = await addTempItemApi(order.value.id, {
    nameZh: tempForm.nameZh,
    nameVi: tempForm.nameVi || tempForm.nameZh,
    unitPrice: parseThousands(tempForm.unitPriceText),
    qty: tempForm.qty,
  });
  tempVisible.value = false;
}

function openDiscount() {
  discountText.value = formatThousands(snap.value?.manualDiscount ?? 0);
  roundOffText.value = formatThousands(order.value?.roundOff ?? 0);
  discountVisible.value = true;
}

function openRoundOff() {
  openDiscount();
}

function onCashierKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'F6') {
    e.preventDefault();
    if (order.value && userStore.hasPerm('order:discount')) openDiscount();
  } else if (e.key === 'F8') {
    e.preventDefault();
    if (userStore.hasPerm('order:add-item')) tempVisible.value = true;
  } else if (e.key === 'F9') {
    e.preventDefault();
    if (order.value && userStore.hasPerm('order:checkout')) openCheckout();
  } else if (e.key === 'F12') {
    e.preventDefault();
    if (cart.value.length && userStore.hasPerm('order:create')) void submitCart();
  } else if (e.ctrlKey && (e.key === '0' || e.code === 'Digit0')) {
    e.preventDefault();
    if (order.value && userStore.hasPerm('order:discount')) openRoundOff();
  } else if (e.ctrlKey && (e.key === 'm' || e.key === 'M')) {
    e.preventDefault();
    if (order.value && userStore.hasPerm('order:discount')) void doFree();
  }
}

async function saveDiscount() {
  if (!order.value) return;
  order.value = await setDiscountApi(order.value.id, {
    discount: parseThousands(discountText.value),
    roundOff: parseThousands(roundOffText.value),
  });
  discountVisible.value = false;
}

async function doFree() {
  if (!order.value) return;
  await ElMessageBox.confirm(t('cashier.confirmFree'));
  order.value = await freeOrderApi(order.value.id);
  // 免单只改金额，订单仍为 open；引导立即零元结账，否则桌台无法清台
  try {
    await ElMessageBox.confirm(t('cashier.confirmFreeCheckout'), t('order.checkout'), {
      type: 'info',
      confirmButtonText: t('order.checkout'),
      cancelButtonText: t('common.cancel'),
    });
    await confirmCheckout();
  } catch {
    /* 稍后点结账亦可 */
  }
}

/** 现金快捷面额（点击填入实收并立即结账；仅单笔现金时） */
const CASH_QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 3_000_000];

async function openCheckout() {
  if (!order.value || order.value.total < 0) return;
  const due = Number(order.value.total) || 0;
  // 应付 0（免单等）：跳过收款弹窗，确认后零元结账关单
  if (due === 0) {
    try {
      await ElMessageBox.confirm(t('cashier.confirmFreeCheckout'), t('order.checkout'), {
        type: 'warning',
        confirmButtonText: t('order.checkout'),
      });
    } catch {
      return;
    }
    await confirmCheckout();
    return;
  }
  payLines.value = [
    {
      method: 'cash',
      amountText: formatThousands(due),
      receivedText: formatThousands(due),
    },
  ];
  checkoutVisible.value = true;
}

function addPayLine() {
  const remain = Math.max(0, payRemain.value);
  payLines.value.push({
    method: 'bank_transfer',
    amountText: formatThousands(remain),
    receivedText: '',
  });
}

function removePayLine(idx: number) {
  if (payLines.value.length <= 1) return;
  payLines.value.splice(idx, 1);
}

const paySum = computed(() =>
  payLines.value.reduce((s, l) => s + (parseThousands(l.amountText) || 0), 0),
);
const payRemain = computed(() => (order.value?.total ?? 0) - paySum.value);

async function quickCashPay(n: number) {
  if (!order.value) return;
  payLines.value = [
    {
      method: 'cash',
      amountText: formatThousands(order.value.total),
      receivedText: formatThousands(n),
    },
  ];
  if (n < order.value.total) {
    ElMessage.warning(t('cashier.cashInsufficient'));
    return;
  }
  await confirmCheckout();
}

const singleCashChange = computed(() => {
  if (payLines.value.length !== 1 || payLines.value[0].method !== 'cash') return 0;
  const amount = parseThousands(payLines.value[0].amountText) || 0;
  const received = parseThousands(payLines.value[0].receivedText) || 0;
  return Math.max(0, received - amount);
});

async function confirmCheckout() {
  if (!order.value) return;
  const due = Number(order.value.total) || 0;
  let paid: Order;
  if (due === 0) {
    try {
      paid = await checkoutOrderApi(order.value.id, [{ method: 'cash', amount: 0, received: 0 }]);
    } catch {
      ElMessage.warning(t('cashier.freeNeedPayFix'));
      return;
    }
  } else {
    const payments: { method: string; amount: number; received?: number }[] = [];
    for (const line of payLines.value) {
      const amount = parseThousands(line.amountText) || 0;
      if (amount <= 0) continue;
      if (line.method === 'cash') {
        const received = parseThousands(line.receivedText) || amount;
        if (received < amount) {
          ElMessage.warning(t('cashier.cashInsufficient'));
          return;
        }
        payments.push({ method: 'cash', amount, received });
      } else {
        payments.push({ method: line.method, amount });
      }
    }
    const sum = payments.reduce((s, p) => s + p.amount, 0);
    if (sum !== due) {
      ElMessage.warning(t('cashier.paySumMismatch', { due: formatVND(due), sum: formatVND(sum) }));
      return;
    }
    if (!payments.length) {
      ElMessage.warning(t('cashier.payLineRequired'));
      return;
    }
    paid = await checkoutOrderApi(order.value.id, payments);
  }
  checkoutVisible.value = false;
  ElMessage.success(t('order.paidNeedClear'));
  // 用服务端结账后最新订单做小票，避免结账前快照缺会员折扣等
  try {
    const store = await getStoreSettingsApi();
    receiptPayload.value = buildReceiptPayload(paid, store);
    receiptVisible.value = true;
  } catch {
    /* 预览失败不影响结账完成 */
  }
  await afterCheckoutCleanup();
}

async function afterCheckoutCleanup() {
  order.value = null;
  selectedMember.value = null;
  if (orderMode.value === 'takeaway') {
    takeawayOrderId.value = '';
    await loadOpenTakeaways();
  } else {
    await loadTables();
  }
}

function closeReceipt() {
  receiptVisible.value = false;
  receiptPayload.value = null;
}
</script>

<template>
  <div class="cashier" v-loading="loading">
    <div class="top">
      <el-radio-group :model-value="orderMode" @change="(v: string | number | boolean) => switchMode(v as 'dine_in' | 'takeaway')">
        <el-radio-button value="dine_in">{{ t('cashier.modeDineIn') }}</el-radio-button>
        <el-radio-button value="takeaway">{{ t('cashier.modeTakeaway') }}</el-radio-button>
      </el-radio-group>
      <el-select
        v-if="orderMode === 'dine_in'"
        v-model="tableId"
        filterable
        style="width: 160px"
        :placeholder="t('cashier.selectTable')"
      >
        <el-option
          v-for="tb in tables"
          :key="tb.id"
          :label="`${tb.code} (${tb.status === 'idle' ? t('tables.statusIdle') : tb.status === 'dining' ? t('tables.statusDining') : t('tables.statusCleaning')})`"
          :value="tb.id"
        />
      </el-select>
      <template v-else>
        <el-select
          :model-value="takeawayOrderId"
          filterable
          clearable
          style="width: 220px"
          :placeholder="t('cashier.selectTakeaway')"
          @change="(id: string) => pickTakeawayOrder(id || '')"
        >
          <el-option
            v-for="o in openTakeaways"
            :key="o.id"
            :label="`${o.orderNo} · ${formatVND(o.total)}`"
            :value="o.id"
          />
        </el-select>
        <el-button @click="startNewTakeaway">{{ t('cashier.newTakeaway') }}</el-button>
      </template>
      <div class="member">
        <el-input
          v-model="memberKeyword"
          :placeholder="t('cashier.selectMember')"
          clearable
          @keyup.enter="searchMembers"
        >
          <template #append>
            <el-button @click="searchMembers">{{ t('common.search') }}</el-button>
          </template>
        </el-input>
        <el-select
          v-if="members.length"
          style="width: 200px"
          :placeholder="t('cashier.selectMember')"
          @change="(id: string) => { const m = members.find(x => x.id === id); if (m) pickMember(m); }"
        >
          <el-option
            v-for="m in members"
            :key="m.id"
            :label="`${m.name || m.email} · ${m.phone || ''}`"
            :value="m.id"
          />
        </el-select>
        <span v-if="selectedMember" class="tag">{{ selectedMember.name || selectedMember.email }}</span>
        <el-select
          v-if="coupons.length"
          v-model="couponId"
          clearable
          style="width: 180px"
          :placeholder="t('cashier.coupon')"
          @change="applyCoupon"
        >
          <el-option
            v-for="c in coupons"
            :key="c.id"
            :label="`${c.code} · ${nameOf(c.template)}`"
            :value="c.id"
          />
        </el-select>
      </div>
    </div>

    <div class="body">
      <section class="left">
        <div class="sec-title">
          <strong>{{ t('cashier.ordered') }}</strong>
          <el-button
            v-if="userStore.hasPerm('order:add-item')"
            size="small"
            type="danger"
            plain
            @click="tempVisible = true"
          >
            + {{ t('cashier.tempDish') }}
          </el-button>
        </div>
        <div v-for="it in activeItems" :key="it.id" class="line">
          <div class="line-main">
            <div>
              <strong>{{ nameOf(it) }}</strong>
              <el-tag v-if="it.isGift" size="small" type="success" style="margin-left: 6px">
                {{ t('cashier.gift') }}
              </el-tag>
            </div>
            <div class="price">{{ formatVND(it.amount) }}</div>
          </div>
          <div class="line-actions">
            <el-button
              v-if="userStore.hasPerm('order:discount')"
              link
              type="warning"
              @click="discountItem(it)"
            >{{ t('order.discount') }}</el-button>
            <el-button
              v-if="userStore.hasPerm('order:discount')"
              link
              type="success"
              @click="giftItem(it)"
            >{{ t('cashier.gift') }}</el-button>
            <el-button
              v-if="userStore.hasPerm('order:void-item')"
              link
              type="danger"
              @click="voidItem(it)"
            >{{ t('common.delete') }}</el-button>
            <span>×{{ it.qty }}</span>
          </div>
        </div>
        <el-empty v-if="!activeItems.length" :description="t('cashier.emptyOrder')" />

        <div class="summary" v-if="order">
          <div class="row"><span>{{ t('cashier.origin') }}</span><span>{{ formatVND(order.subtotal) }}</span></div>
          <div v-for="row in discountBreakdown" :key="row.key" class="row promo">
            <el-tag type="danger" size="small">{{ row.label }}</el-tag>
            <span>-{{ formatVND(row.amount) }}</span>
          </div>
          <div v-if="order.serviceCharge" class="row">
            <span>{{ t('order.serviceCharge') }}</span>
            <span>{{ formatVND(order.serviceCharge) }}</span>
          </div>
          <div class="row due">
            <span>{{ t('cashier.due') }}</span>
            <strong>{{ formatVND(order.total) }}</strong>
          </div>
        </div>
      </section>

      <section class="right">
        <!-- 菜品 / 套餐 切换 Tab -->
        <div class="menu-tabs">
          <button
            type="button"
            :class="{ active: menuTab === 'dishes' }"
            @click="menuTab = 'dishes'"
          >{{ t('cashier.tabDishes') }}</button>
          <button
            type="button"
            :class="{ active: menuTab === 'combos' }"
            @click="menuTab = 'combos'"
          >{{ t('cashier.tabCombos') }}</button>
        </div>

        <!-- 普通菜品 -->
        <template v-if="menuTab === 'dishes'">
          <div class="cats">
            <button
              v-for="c in categories"
              :key="c.id"
              type="button"
              :class="{ active: activeCat === c.id }"
              @click="activeCat = c.id"
            >
              {{ nameOf(c) }}
            </button>
          </div>
          <div class="dishes">
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
              <span>{{ nameOf(d) }}</span>
              <em>{{ formatVND(dishUnitPrice(d)) }}</em>
            </button>
          </div>
          <div class="cart" v-if="cart.length">
            <div v-for="c in cart" :key="c.dish.id">{{ nameOf(c.dish) }} × {{ c.qty }}</div>
            <el-button type="primary" @click="submitCart">{{ t('order.submit') }}</el-button>
          </div>
        </template>

        <!-- 套餐列表 -->
        <template v-else>
          <div v-if="!combos.length" class="no-combo">{{ t('cashier.noCombos') }}</div>
          <div class="dishes">
            <button
              v-for="cb in combos"
              :key="cb.id"
              type="button"
              class="dish combo-card"
              @click="pickCombo(cb)"
            >
              <div
                class="dish-cover"
                :style="cb.image ? { backgroundImage: `url(${cb.image})` } : undefined"
              />
              <span>{{ nameOf(cb) }}</span>
              <em>{{ formatVND(cb.price) }}</em>
              <small>{{ (cb.groups || []).length }} {{ t('combo.groups') }}</small>
            </button>
          </div>
        </template>
      </section>
    </div>

    <div class="actions">
      <button
        type="button"
        class="act"
        :disabled="!order || !userStore.hasPerm('order:discount')"
        @click="openDiscount"
      >
        <el-icon :size="22"><PriceTag /></el-icon>
        <span>{{ t('order.discount') }}</span>
        <em>(F6)</em>
      </button>
      <button
        type="button"
        class="act"
        :disabled="!order || !userStore.hasPerm('order:discount')"
        @click="openRoundOff"
      >
        <el-icon :size="22"><Minus /></el-icon>
        <span>{{ t('cashier.roundOff') }}</span>
        <em>(Ctrl+0)</em>
      </button>
      <button
        type="button"
        class="act danger"
        :disabled="!order || !userStore.hasPerm('order:discount')"
        @click="doFree"
      >
        <el-icon :size="22"><CircleClose /></el-icon>
        <span>{{ t('cashier.free') }}</span>
        <em>(Ctrl+M)</em>
      </button>
      <button
        v-if="userStore.hasPerm('order:add-item')"
        type="button"
        class="act"
        @click="tempVisible = true"
      >
        <el-icon :size="22"><EditPen /></el-icon>
        <span>{{ t('cashier.tempDish') }}</span>
        <em>(F8)</em>
      </button>
      <button
        type="button"
        class="act primary"
        :disabled="!cart.length || !userStore.hasPerm('order:create')"
        @click="submitCart"
      >
        <el-icon :size="22"><DocumentChecked /></el-icon>
        <span>{{ t('order.submit') }}</span>
        <em>(F12)</em>
      </button>
      <button
        type="button"
        class="act success"
        :disabled="!order || !userStore.hasPerm('order:checkout')"
        @click="openCheckout"
      >
        <el-icon :size="22"><Discount /></el-icon>
        <span>{{ t('order.checkout') }}</span>
        <em>(F9)</em>
      </button>
    </div>

    <el-dialog v-model="tempVisible" :title="t('cashier.tempDish')" width="420px">
      <el-form label-width="90px">
        <el-form-item :label="t('common.nameZh')"><el-input v-model="tempForm.nameZh" /></el-form-item>
        <el-form-item :label="t('common.nameVi')"><el-input v-model="tempForm.nameVi" /></el-form-item>
        <el-form-item :label="t('inventory.unitPrice')">
          <el-input
            :model-value="tempForm.unitPriceText"
            @update:model-value="(v: string) => (tempForm.unitPriceText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
        <el-form-item :label="t('inventory.qty')"><el-input-number v-model="tempForm.qty" :min="1" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tempVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveTemp">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="discountVisible" :title="t('order.discount')" width="400px">
      <el-form label-width="90px">
        <el-form-item :label="t('order.discount')">
          <el-input
            :model-value="discountText"
            @update:model-value="(v: string) => (discountText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
        <el-form-item :label="t('cashier.roundOff')">
          <el-input
            :model-value="roundOffText"
            @update:model-value="(v: string) => (roundOffText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="discountVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveDiscount">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 套餐分组选择 -->
    <el-dialog v-model="comboDialog" :title="selectedCombo ? nameOf(selectedCombo) : ''" width="520px">
      <div v-if="selectedCombo">
        <div v-for="grp in (selectedCombo.groups || [])" :key="grp.id" class="combo-grp">
          <div class="combo-grp-title">
            {{ nameOf(grp) }}
            <span class="combo-grp-hint">{{ t('combo.groupMin') }} {{ grp.minSelect }} / {{ t('combo.groupMax') }} {{ grp.maxSelect }}</span>
          </div>
          <el-checkbox-group
            v-model="comboSelections[grp.id!]"
            :max="grp.maxSelect"
          >
            <el-checkbox
              v-for="item in (grp.items || [])"
              :key="item.dishId"
              :label="item.dishId"
            >
              {{ dishNameById(item.dishId) }}
              <span v-if="item.extraPrice > 0" class="extra-price">+{{ formatVND(item.extraPrice) }}</span>
            </el-checkbox>
          </el-checkbox-group>
        </div>
      </div>
      <template #footer>
        <el-button @click="comboDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitComboSelection">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="checkoutVisible" :title="t('order.checkout')" width="520px">
      <el-form label-width="100px">
        <el-form-item :label="t('cashier.due')"><strong>{{ formatVND(order?.total ?? 0) }}</strong></el-form-item>
        <div v-for="(line, idx) in payLines" :key="idx" class="pay-line">
          <el-form-item :label="t('order.payMethod')">
            <div class="pay-line-row">
              <el-select v-model="line.method" style="width: 140px">
                <el-option
                  v-for="m in PAY_METHODS"
                  :key="m"
                  :label="payMethodLabel(m)"
                  :value="m"
                />
              </el-select>
              <el-input
                :model-value="line.amountText"
                style="flex: 1"
                :placeholder="t('cashier.payAmount')"
                @update:model-value="(v: string) => (line.amountText = formatThousands(parseThousands(v)))"
              />
              <el-button
                v-if="payLines.length > 1"
                link
                type="danger"
                @click="removePayLine(idx)"
              >
                {{ t('common.delete') }}
              </el-button>
            </div>
          </el-form-item>
          <el-form-item v-if="line.method === 'cash'" :label="t('order.received')">
            <el-input
              :model-value="line.receivedText"
              @update:model-value="(v: string) => (line.receivedText = formatThousands(parseThousands(v)))"
            />
          </el-form-item>
        </div>
        <el-form-item>
          <el-button link type="primary" @click="addPayLine">{{ t('cashier.addPayLine') }}</el-button>
          <span class="pay-remain" :class="{ warn: payRemain !== 0 }">
            {{ t('cashier.payRemain', { n: formatVND(payRemain) }) }}
          </span>
        </el-form-item>
        <template v-if="payLines.length === 1 && payLines[0].method === 'cash'">
          <el-form-item :label="t('order.change')">
            <strong :class="{ 'change-ok': singleCashChange > 0 }">{{ formatVND(singleCashChange) }}</strong>
          </el-form-item>
          <el-form-item>
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
        </template>
      </el-form>
      <template #footer>
        <el-button @click="checkoutVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmCheckout">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="receiptVisible"
      :title="t('print.receiptDialogTitle')"
      width="400px"
      destroy-on-close
      @closed="closeReceipt"
    >
      <TicketPreview v-if="receiptPayload" :payload="receiptPayload" />
      <template #footer>
        <el-button type="primary" @click="closeReceipt">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pay-line {
  border-bottom: 1px dashed var(--el-border-color-lighter);
  margin-bottom: 8px;
  padding-bottom: 4px;
}
.pay-line-row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.pay-remain {
  margin-left: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.pay-remain.warn {
  color: var(--el-color-warning);
}
.pay-line {
  border-bottom: 1px dashed var(--el-border-color-lighter);
  margin-bottom: 8px;
  padding-bottom: 4px;
}
.pay-line-row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.pay-remain {
  margin-left: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.pay-remain.warn {
  color: var(--el-color-warning);
}
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
.change-ok {
  color: #e6a23c;
  font-size: 16px;
}
.cashier { display: flex; flex-direction: column; height: calc(100vh - 120px); gap: 10px; }
.top { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.member { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; flex: 1; }
.tag { background: #fff3cd; padding: 4px 10px; border-radius: 4px; }
.body { flex: 1; display: grid; grid-template-columns: 1.1fr 1fr; gap: 12px; min-height: 0; }
.left, .right { background: #fff; border-radius: 8px; padding: 12px; overflow: auto; border: 1px solid #eee; }
.sec-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.line { border-bottom: 1px solid #f0f0f0; padding: 8px 0; }
.line-main { display: flex; justify-content: space-between; }
.line-actions { display: flex; gap: 6px; align-items: center; margin-top: 4px; font-size: 12px; }
.price { color: #e6a23c; font-weight: 600; }
.summary {
  margin-top: 12px;
  padding: 12px;
  border-radius: 10px;
  background: #fafafa;
  border: 1px solid #eee;
}
.row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
.row.promo { color: #f56c6c; background: #fff5f5; margin: 4px -4px; padding: 4px; border-radius: 4px; }
.row.due { margin-top: 10px; font-size: 20px; color: #f56c6c; font-weight: 700; }
.cats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.cats button { border: 1px solid #ddd; background: #fafafa; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
.cats button.active { background: #ffc300; border-color: #ffc300; }
.dishes { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.dish { border: 1px solid #eee; background: #fff; border-radius: 8px; padding: 8px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
.dish-cover {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 6px;
  background: #f3f4f6 center / cover no-repeat;
  flex-shrink: 0;
}
.dish em { font-style: normal; color: #ff6a00; }
.cart { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 10px;
}
.act {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 72px;
  border: 1px solid #e5e5e5;
  background: #fff;
  border-radius: 10px;
  cursor: pointer;
  color: #333;
  font-size: 14px;
  font-weight: 600;
}
.act em { font-style: normal; font-size: 11px; color: #999; font-weight: 400; }
.act:disabled { opacity: 0.45; cursor: not-allowed; }
.act.danger { border-color: #fbc4c4; color: #f56c6c; background: #fff7f7; }
.act.primary { border-color: #67c23a; background: #67c23a; color: #fff; }
.act.primary em { color: rgba(255, 255, 255, 0.85); }
.act.success { border-color: #95d475; background: #95d475; color: #fff; }
.act.success em { color: rgba(255, 255, 255, 0.85); }
@media (max-width: 960px) {
  .actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.menu-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
.menu-tabs button { border: 1px solid #ddd; background: #fafafa; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.menu-tabs button.active { background: #409eff; border-color: #409eff; color: #fff; }
.combo-card small { font-size: 11px; color: #999; }
.no-combo { color: #999; padding: 20px; text-align: center; }
.combo-grp { margin-bottom: 14px; }
.combo-grp-title { font-weight: 600; margin-bottom: 6px; }
.combo-grp-hint { font-size: 12px; color: #888; margin-left: 8px; font-weight: normal; }
.extra-price { color: #f56c6c; font-size: 12px; margin-left: 4px; }
@media (max-width: 960px) {
  .body { grid-template-columns: 1fr; }
}
</style>
