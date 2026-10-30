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
import { formatVND, localeField } from '@restaurant/shared';
import { listCategoriesApi, listDishesApi, type Category, type Dish } from '../../api/menu';
import { addComboItemApi, listCombosApi, type Combo, type ComboGroup } from '../../api/combo';
import {
  addOrderItemsApi,
  addTempItemApi,
  bindCustomerApi,
  checkoutOrderApi,
  freeOrderApi,
  getOrderByTableApi,
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
import { useUserStore } from '../../stores/user';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const userStore = useUserStore();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const loading = ref(false);
const tables = ref<FloorTable[]>([]);
const tableId = ref('');
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
const tempVisible = ref(false);
const discountVisible = ref(false);
const tempForm = reactive({ nameZh: '', nameVi: '', unitPriceText: '', qty: 1 });
const discountText = ref('0');
const roundOffText = ref('0');
const payForm = reactive({ method: 'cash', receivedText: '' });

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

const activeItems = computed(() =>
  (order.value?.items || []).filter((i) => i.status !== 'voided'),
);

const snap = computed(() => order.value?.promoSnapshot || null);

function isSellable(d: Dish) {
  if (d.status !== 'on' || !d.isDineIn) return false;
  if (d.stock != null && d.stock <= 0) return false;
  if (d.dailyStock != null && d.soldToday >= d.dailyStock) return false;
  return true;
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

async function loadOrder() {
  if (!tableId.value) {
    order.value = null;
    return;
  }
  order.value = await getOrderByTableApi(tableId.value);
  if (order.value?.customerId) {
    const found = members.value.find((m) => m.id === order.value!.customerId);
    if (found) selectedMember.value = found;
  }
}

async function refresh() {
  loading.value = true;
  try {
    await Promise.all([loadTables(), loadMenu(), loadCombos()]);
    await loadOrder();
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refresh();
  window.addEventListener('keydown', onCashierKey);
});
onUnmounted(() => window.removeEventListener('keydown', onCashierKey));
watch(tableId, () => loadOrder());

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
    // 桌台状态可能过期：重新拉取后若已在用餐则继续下单
    await loadTables();
    const again = tables.value.find((x) => x.id === tableId.value);
    if (again?.status === 'dining') return true;
    ElMessage.warning(t('cashier.tableBusy'));
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
  if (!(await ensureDining())) return;
  const items = cart.value.map((c) => ({ dishId: c.dish.id, qty: c.qty }));
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
  const list = (await listCouponsApi(m.id)) as {
    id: string;
    status: string;
    code: string;
    template: { nameZh: string; nameVi: string };
  }[];
  coupons.value = list.filter((c) => c.status === 'unused');
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
    tempVisible.value = true;
  } else if (e.key === 'F9') {
    e.preventDefault();
    if (order.value && userStore.hasPerm('order:checkout')) openCheckout();
  } else if (e.key === 'F12') {
    e.preventDefault();
    if (cart.value.length) void submitCart();
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
}

function openCheckout() {
  if (!order.value || order.value.total < 0) return;
  payForm.method = 'cash';
  payForm.receivedText = formatThousands(order.value.total);
  checkoutVisible.value = true;
}

async function confirmCheckout() {
  if (!order.value) return;
  const amount = order.value.total;
  const payments =
    amount === 0
      ? [{ method: 'cash', amount: 0, received: 0 }]
      : payForm.method === 'cash'
        ? [{ method: 'cash', amount, received: parseThousands(payForm.receivedText) }]
        : [{ method: payForm.method, amount }];
  // amount 0 checkout: backend Min(1) may fail — use free order total 0 with amount 0
  if (amount === 0) {
    try {
      await checkoutOrderApi(order.value.id, [{ method: 'cash', amount: 0, received: 0 }]);
    } catch {
      // PaymentLineDto Min(1) — bump with zero total via 1 dong workaround not ideal
      ElMessage.warning(t('cashier.freeNeedPayFix'));
      return;
    }
  } else {
    await checkoutOrderApi(order.value.id, payments);
  }
  checkoutVisible.value = false;
  ElMessage.success(t('order.paid'));
  order.value = null;
  selectedMember.value = null;
  await loadTables();
}
</script>

<template>
  <div class="cashier" v-loading="loading">
    <div class="top">
      <el-select v-model="tableId" filterable style="width: 160px" :placeholder="t('cashier.selectTable')">
        <el-option
          v-for="tb in tables"
          :key="tb.id"
          :label="`${tb.code} (${tb.status === 'idle' ? t('tables.statusIdle') : tb.status === 'dining' ? t('tables.statusDining') : t('tables.statusCleaning')})`"
          :value="tb.id"
        />
      </el-select>
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
          <el-button size="small" type="danger" plain @click="tempVisible = true">
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
            <el-button link type="warning" @click="discountItem(it)">{{ t('order.discount') }}</el-button>
            <el-button link type="success" @click="giftItem(it)">{{ t('cashier.gift') }}</el-button>
            <el-button link type="danger" @click="voidItem(it)">{{ t('common.delete') }}</el-button>
            <span>×{{ it.qty }}</span>
          </div>
        </div>
        <el-empty v-if="!activeItems.length" :description="t('cashier.emptyOrder')" />

        <div class="summary" v-if="order">
          <div class="row"><span>{{ t('cashier.origin') }}</span><span>{{ formatVND(order.subtotal) }}</span></div>
          <div v-for="r in snap?.rules || []" :key="r.id" class="row promo">
            <el-tag type="danger" size="small">{{ r.nameZh }}</el-tag>
            <span>-{{ formatVND(r.amount) }}</span>
          </div>
          <div v-if="snap?.coupon" class="row promo">
            <el-tag type="warning" size="small">{{ snap.coupon.nameZh }}</el-tag>
            <span>-{{ formatVND(snap.coupon.amount) }}</span>
          </div>
          <div class="row"><span>{{ t('order.discount') }}</span><span>-{{ formatVND(order.discount) }}</span></div>
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
              <span>{{ nameOf(d) }}</span>
              <em>{{ formatVND(d.price) }}</em>
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
      <button type="button" class="act" @click="tempVisible = true">
        <el-icon :size="22"><EditPen /></el-icon>
        <span>{{ t('cashier.tempDish') }}</span>
        <em>(F8)</em>
      </button>
      <button
        type="button"
        class="act primary"
        :disabled="!cart.length"
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

    <el-dialog v-model="checkoutVisible" :title="t('order.checkout')" width="400px">
      <el-form label-width="90px">
        <el-form-item :label="t('cashier.due')"><strong>{{ formatVND(order?.total ?? 0) }}</strong></el-form-item>
        <el-form-item :label="t('order.payMethod')">
          <el-select v-model="payForm.method" style="width: 100%">
            <el-option label="Cash" value="cash" />
            <el-option label="Card" value="card" />
            <el-option label="Transfer" value="bank_transfer" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="payForm.method === 'cash'" :label="t('order.received')">
          <el-input
            :model-value="payForm.receivedText"
            @update:model-value="(v: string) => (payForm.receivedText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="checkoutVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmCheckout">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
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
.dish { border: 1px solid #eee; background: #fff; border-radius: 8px; padding: 10px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 6px; }
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
