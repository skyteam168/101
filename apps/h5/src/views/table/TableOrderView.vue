<script setup lang="ts">
import { computed, nextTick, onBeforeUpdate, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { showToast } from 'vant';
import { Events, formatVND, localeField } from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import { getPublicStoreId } from '../../utils/store-id';
import {
  addCartApi,
  callWaiterApi,
  joinTableApi,
  patchCartItemApi,
  peekTableApi,
  publicMenuApi,
  removeCartItemApi,
  requestBillApi,
  sessionStateApi,
  submitCartApi,
  type CartLine,
  type GuestOrder,
  type MenuCategory,
  type TablePeek,
} from '../../api/table';
import {
  clearGuestSession,
  getGuestMeta,
  getGuestToken,
  setGuestSession,
  type GuestMeta,
} from '../../utils/guest-storage';

const { t, locale } = useI18n();
const route = useRoute();
const qrToken = computed(() => String(route.params.token));
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const phase = ref<'loading' | 'join' | 'menu'>('loading');
const peek = ref<TablePeek | null>(null);
const meta = ref<GuestMeta | null>(null);
const joinForm = reactive({ nickname: '', pin: '' });
const joining = ref(false);

const categories = ref<MenuCategory[]>([]);
const activeCat = ref(0);
const dishListRef = ref<HTMLElement | null>(null);
const sectionRefs = ref<HTMLElement[]>([]);
let syncLock = false;
let syncUnlockTimer: ReturnType<typeof setTimeout> | null = null;
const tab = ref(0);
const cart = ref<CartLine[]>([]);
const order = ref<GuestOrder | null>(null);

const optVisible = ref(false);
const optDish = ref<MenuCategory['dishes'][0] | null>(null);
const optQty = ref(1);
const optSelected = ref<Record<string, string[]>>({});

let socket: Socket | null = null;

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

onBeforeUpdate(() => {
  sectionRefs.value = [];
});

function setSectionRef(el: unknown) {
  if (el instanceof HTMLElement) sectionRefs.value.push(el);
}

function selectCat(idx: number) {
  if (idx < 0 || idx >= categories.value.length) return;
  activeCat.value = idx;
  syncLock = true;
  if (syncUnlockTimer) clearTimeout(syncUnlockTimer);
  nextTick(() => {
    const section = sectionRefs.value[idx];
    const list = dishListRef.value;
    if (section && list) {
      list.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
    }
    syncUnlockTimer = setTimeout(() => {
      syncLock = false;
      syncUnlockTimer = null;
    }, 420);
  });
}

function onDishListScroll() {
  if (syncLock || !dishListRef.value || !sectionRefs.value.length) return;
  const list = dishListRef.value;
  const scrollTop = list.scrollTop;
  if (scrollTop + list.clientHeight >= list.scrollHeight - 24) {
    const last = sectionRefs.value.length - 1;
    if (activeCat.value !== last) activeCat.value = last;
    return;
  }
  let current = 0;
  for (let i = 0; i < sectionRefs.value.length; i++) {
    const el = sectionRefs.value[i];
    if (!el) continue;
    if (el.offsetTop - 8 <= scrollTop) current = i;
    else break;
  }
  if (activeCat.value !== current) activeCat.value = current;
}

const cartTotal = computed(() => cart.value.reduce((s, i) => s + i.amount, 0));
const cartCount = computed(() => cart.value.reduce((s, i) => s + i.qty, 0));

/** 当前订单已下单数量（按 dishId 汇总，排除退菜） */
const orderedQtyByDish = computed(() => {
  const map = new Map<string, number>();
  for (const b of order.value?.batches || []) {
    for (const it of b.items) {
      if (it.status === 'voided' || !it.dishId) continue;
      const id = String(it.dishId);
      map.set(id, (map.get(id) || 0) + it.qty);
    }
  }
  return map;
});

/** 共享购物车数量（按 dishId 汇总，含同伴未提交的） */
const cartQtyByDish = computed(() => {
  const map = new Map<string, number>();
  for (const i of cart.value) {
    const id = String(i.dishId);
    map.set(id, (map.get(id) || 0) + i.qty);
  }
  return map;
});

function orderedQtyOf(dishId: string) {
  return orderedQtyByDish.value.get(String(dishId)) || 0;
}

function cartQtyOf(dishId: string) {
  return cartQtyByDish.value.get(String(dishId)) || 0;
}

/**
 * 菜品「已点」展示数量：已下单 + 购物车，同桌一眼看出本桌已选份数。
 * 有规格时购物车可能多行，已按 dishId 汇总。
 */
function markedQtyOf(dishId: string) {
  return orderedQtyOf(dishId) + cartQtyOf(dishId);
}

/** 分类角标：该分类下「已下单 + 购物车」总份数（无则不显示，同外卖侧栏） */
function catMarkQty(cat: MenuCategory): number | undefined {
  const dishIds = cat.dishes.map((d) => String(d.id));
  let qty = 0;
  for (const id of dishIds) {
    qty += markedQtyOf(id);
  }
  return qty > 0 ? qty : undefined;
}

function syncDocTitle() {
  if (peek.value) {
    const store =
      loc.value === 'vi' ? peek.value.storeNameVi : peek.value.storeNameZh;
    document.title = `${store} · ${peek.value.code}`;
  } else {
    document.title = t('app.title');
  }
}

async function loadPeek() {
  peek.value = await peekTableApi(qrToken.value);
  syncDocTitle();
}

async function tryRestore() {
  const existing = getGuestMeta();
  const token = getGuestToken();
  if (existing && token && existing.qrToken === qrToken.value) {
    meta.value = existing;
    phase.value = 'menu';
    await Promise.all([loadMenu(), refreshState()]);
    connectSocket();
    return true;
  }
  return false;
}

async function doJoin() {
  if (!joinForm.nickname.trim()) {
    showToast(t('join.nickname'));
    return;
  }
  joining.value = true;
  try {
    const res = await joinTableApi(qrToken.value, {
      nickname: joinForm.nickname.trim(),
      pin: joinForm.pin || undefined,
      guestCount: 2,
    });
    const m: GuestMeta = {
      qrToken: qrToken.value,
      nickname: res.nickname,
      sessionId: res.sessionId,
      tableId: res.tableId,
      tableCode: res.tableCode,
      storeId: res.storeId,
      pin: res.pin,
      guestId: res.guestId,
    };
    setGuestSession(res.guestToken, m);
    meta.value = m;
    cart.value = res.cart;
    phase.value = 'menu';
    await loadMenu();
    await refreshState();
    connectSocket();
  } finally {
    joining.value = false;
  }
}

async function loadMenu() {
  const storeId = meta.value?.storeId || peek.value?.storeId || getPublicStoreId();
  categories.value = await publicMenuApi(storeId);
}

function endSessionAfterPaid() {
  socket?.disconnect();
  socket = null;
  clearGuestSession();
  meta.value = null;
  cart.value = [];
  order.value = null;
  phase.value = 'join';
  showToast({ message: t('menu.paidDone'), duration: 3500 });
  void loadPeek();
}

function isSessionEndedError(err: unknown) {
  const code = (err as { code?: string })?.code;
  return (
    code === 'TABLE_NOT_DINING' ||
    code === 'TABLE_IS_CLEANING' ||
    code === 'TABLE_NOT_FOUND'
  );
}

async function refreshState() {
  try {
    const state = await sessionStateApi();
    cart.value = state.cart;
    order.value = state.order;
  } catch (err) {
    if (isSessionEndedError(err)) {
      endSessionAfterPaid();
      return;
    }
    throw err;
  }
}

function openOptions(dish: MenuCategory['dishes'][0]) {
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
    void addDish(dish, 1, []);
    return;
  }
  optVisible.value = true;
}

/** 无规格：直接改购物车数量；有规格：加号打开规格弹窗 */
async function plusDish(dish: MenuCategory['dishes'][0]) {
  if ((dish.options || []).length) {
    openOptions(dish);
    return;
  }
  await addDish(dish, 1, []);
}

async function minusDish(dish: MenuCategory['dishes'][0]) {
  const id = String(dish.id);
  const lines = cart.value.filter((i) => String(i.dishId) === id);
  if (!lines.length) return;
  const last = lines[lines.length - 1];
  await changeQty(last, last.qty - 1);
}

function optionGroups(dish: MenuCategory['dishes'][0]) {
  const map = new Map<string, typeof dish.options>();
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

function isOptSelected(groupKey: string, optionId: string | number) {
  const id = String(optionId);
  return (optSelected.value[groupKey] || []).some((x) => String(x) === id);
}

function toggleOptChip(groupKey: string, optionId: string | number, multi: boolean) {
  const id = String(optionId);
  const prev = (optSelected.value[groupKey] || []).map(String);
  let next: string[];
  if (multi) {
    next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
  } else {
    next = [id];
  }
  optSelected.value = { ...optSelected.value, [groupKey]: next };
}

async function confirmOptions() {
  if (!optDish.value) return;
  const snapshot: Array<{
    groupNameZh: string;
    groupNameVi: string;
    optionNameZh: string;
    optionNameVi: string;
    extraPrice: number;
  }> = [];
  for (const g of optionGroups(optDish.value)) {
    const ids = optSelected.value[g.key] || [];
    if (g.required && !ids.length) {
      showToast(t('shop.selectOption', { name: g.name }));
      return;
    }
    for (const id of ids) {
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
  await addDish(optDish.value, optQty.value, snapshot);
  optVisible.value = false;
}

async function addDish(
  dish: MenuCategory['dishes'][0],
  qty: number,
  optionsSnapshot: unknown[],
) {
  cart.value = await addCartApi([{ dishId: dish.id, qty, optionsSnapshot }]);
  showToast(t('menu.added'));
}

async function changeQty(item: CartLine, qty: number) {
  if (qty <= 0) cart.value = await removeCartItemApi(item.id);
  else cart.value = await patchCartItemApi(item.id, qty);
}

async function submit() {
  order.value = await submitCartApi();
  cart.value = [];
  showToast(t('menu.submitted'));
  tab.value = 1;
}

const calling = ref(false);

async function callWaiter() {
  if (calling.value) return;
  calling.value = true;
  try {
    await callWaiterApi();
    showToast(t('menu.called'));
  } catch (err) {
    if (isSessionEndedError(err)) {
      endSessionAfterPaid();
      return;
    }
    // 拦截器已 toast；避免误以为失败后重复点
  } finally {
    calling.value = false;
  }
}

async function requestBill() {
  if (calling.value) return;
  calling.value = true;
  try {
    await requestBillApi();
    showToast(t('menu.billed'));
  } catch (err) {
    if (isSessionEndedError(err)) {
      endSessionAfterPaid();
      return;
    }
  } finally {
    calling.value = false;
  }
}

function toggleLang() {
  locale.value = locale.value === 'zh-CN' ? 'vi-VN' : 'zh-CN';
  localStorage.setItem('locale', locale.value);
}

type CartActor = {
  guestId: string;
  nickname: string;
  action: 'add' | 'change' | 'remove';
  dishNameZh: string;
  dishNameVi: string;
  qtyBefore?: number;
  qtyAfter?: number;
  ownerGuestId?: string;
  ownerNickname?: string;
};

function actorDishName(actor: CartActor) {
  return loc.value === 'vi'
    ? actor.dishNameVi || actor.dishNameZh
    : actor.dishNameZh || actor.dishNameVi;
}

/** 同桌购物车变更提示：加菜 / 改数量 / 删菜（忽略自己发起的操作） */
function notifyPeerCartChange(actor: CartActor | null | undefined) {
  const myId = meta.value?.guestId;
  if (!myId || !actor || actor.guestId === myId) return;
  const who = actor.nickname || t('menu.someone');
  const dish = actorDishName(actor) || t('menu.aDish');
  const ownerIsMe = actor.ownerGuestId === myId;
  const ownerName = actor.ownerNickname || t('menu.someone');

  let message = '';
  if (actor.action === 'add') {
    message = t('menu.peerAdded', { who, dish, qty: actor.qtyAfter ?? 1 });
  } else if (actor.action === 'remove') {
    message = ownerIsMe
      ? t('menu.peerRemovedYours', { who, dish })
      : t('menu.peerRemoved', { who, owner: ownerName, dish });
  } else if (actor.action === 'change') {
    const qty = actor.qtyAfter ?? 0;
    message = ownerIsMe
      ? t('menu.peerChangedYours', { who, dish, qty })
      : t('menu.peerChanged', { who, owner: ownerName, dish, qty });
  }
  if (!message) return;
  showToast({ message, duration: 2800 });
}

function connectSocket() {
  socket?.disconnect();
  const token = getGuestToken();
  if (!token || !meta.value) return;
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
  });
  socket.on('connect', () => {
    socket?.emit('join', { room: `table:${meta.value!.sessionId}` });
    if (meta.value?.storeId) {
      socket?.emit('join', { room: `store:${meta.value.storeId}:menu` });
    }
  });
  socket.on(
    Events.CART_UPDATED,
    (payload: { items?: CartLine[]; actor?: CartActor | null }) => {
      if (!payload?.items) return;
      notifyPeerCartChange(payload.actor);
      cart.value = payload.items;
    },
  );
  socket.on(Events.ORDER_BATCH_ADDED, () => refreshState());
  socket.on(Events.ORDER_CREATED, () => refreshState());
  socket.on(Events.ORDER_ITEM_VOIDED, () => refreshState());
  socket.on(Events.ORDER_PAID, () => {
    endSessionAfterPaid();
  });
  socket.on(Events.DISH_UPDATED, () => {
    void loadMenu();
  });
  socket.on('disconnect', () => {
    /* reconnect handled by socket.io */
  });
  socket.io.on('reconnect', async () => {
    await refreshState();
    showToast(t('menu.reconnect'));
  });
}

onMounted(async () => {
  try {
    await loadPeek();
    if (peek.value?.status === 'cleaning') {
      phase.value = 'join';
      return;
    }
    const ok = await tryRestore();
    if (!ok) {
      phase.value = 'join';
      const m = getGuestMeta();
      if (m?.nickname) joinForm.nickname = m.nickname;
    }
  } catch {
    phase.value = 'join';
  }
});

onUnmounted(() => {
  socket?.disconnect();
  socket = null;
});

watch(qrToken, async () => {
  clearGuestSession();
  meta.value = null;
  phase.value = 'loading';
  await loadPeek();
  phase.value = 'join';
});

watch(locale, () => syncDocTitle());
</script>

<template>
  <div class="page">
    <van-nav-bar
      :title="peek ? t('join.table', { code: peek.code }) : t('app.title')"
      fixed
      placeholder
    >
      <template #right>
        <span class="lang" @click="toggleLang">{{ t('app.switchLang') }}</span>
      </template>
    </van-nav-bar>

    <div v-if="phase === 'loading'" class="pad">...</div>

    <div v-else-if="phase === 'join'" class="join pad">
      <h2>{{ t('join.welcome') }}</h2>
      <p v-if="peek">{{ loc === 'vi' ? peek.storeNameVi : peek.storeNameZh }} · {{ peek.code }}</p>
      <p v-if="peek?.status === 'cleaning'" class="warn">{{ t('join.cleaning') }}</p>
      <template v-else>
        <van-field v-model="joinForm.nickname" :label="t('join.nickname')" :placeholder="t('join.nicknamePlaceholder')" />
        <p v-if="peek?.needPin" class="pin-hint">{{ t('join.pinHint') }}</p>
        <van-field
          v-if="peek?.needPin"
          v-model="joinForm.pin"
          type="digit"
          maxlength="4"
          :label="t('join.pin')"
          :placeholder="t('join.pinPlaceholder')"
        />
        <div class="pad">
          <van-button type="primary" block :loading="joining" @click="doJoin">{{ t('join.enter') }}</van-button>
        </div>
        <p v-if="meta?.pin || peek?.hasSession" class="hint">PIN: {{ meta?.pin }}</p>
      </template>
    </div>

    <template v-else>
      <div class="actions">
        <van-button size="small" :loading="calling" @click="callWaiter">{{ t('menu.callWaiter') }}</van-button>
        <van-button size="small" type="warning" :loading="calling" @click="requestBill">{{ t('menu.requestBill') }}</van-button>
        <span class="pin">PIN {{ meta?.pin }}</span>
      </div>

      <van-tabs v-model:active="tab" sticky offset-top="46">
        <van-tab :title="t('menu.title')">
          <div class="menu-layout">
            <van-sidebar v-model="activeCat" class="cat-sidebar" @change="selectCat">
              <van-sidebar-item
                v-for="c in categories"
                :key="c.id"
                :title="nameOf(c)"
                :badge="catMarkQty(c)"
              />
            </van-sidebar>
            <div
              ref="dishListRef"
              class="dish-list"
              @scroll.passive="onDishListScroll"
            >
              <section
                v-for="(c, catIdx) in categories"
                :key="c.id"
                :ref="setSectionRef"
                class="cat-section"
                :data-cat-index="catIdx"
              >
                <h3 class="cat-section-title">{{ nameOf(c) }}</h3>
                <div
                  v-for="d in c.dishes"
                  :key="d.id"
                  class="dish"
                  @click="openOptions(d)"
                >
                  <div class="dish-img-wrap">
                    <img v-if="d.image" :src="d.image" class="dish-img" alt="" />
                    <div v-else class="dish-img dish-img-ph">
                      <van-icon name="photo-o" size="28" color="#ccc" />
                    </div>
                  </div>
                  <div class="dish-body">
                    <div class="d-name-row">
                      <div class="d-name">{{ nameOf(d) }}</div>
                      <span v-if="markedQtyOf(d.id) > 0" class="ordered-mark">
                        {{ t('menu.orderedMark', { n: markedQtyOf(d.id) }) }}
                      </span>
                    </div>
                    <div v-if="d.options?.length" class="spec-hint">{{ t('shop.hasOptions') }}</div>
                    <div class="dish-price-row">
                      <div class="d-price">{{ formatVND(d.price) }}</div>
                      <div class="qty-ctrl" @click.stop>
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
                  </div>
                </div>
              </section>
            </div>
          </div>
        </van-tab>
        <van-tab :title="t('menu.ordered')">
          <div class="pad">
            <van-empty v-if="!order?.batches?.length" :description="t('menu.emptyCart')" />
            <div v-for="b in order?.batches || []" :key="b.id" class="round">
              <div class="round-h">
                {{ t('menu.round', { n: b.roundNo }) }}
                <van-tag v-if="b.printStatus === 'need_confirm'" type="warning">{{ t('menu.needConfirm') }}</van-tag>
                <span v-if="b.guestNickname" class="who">{{ b.guestNickname }}</span>
              </div>
              <div v-for="it in b.items" :key="it.id" class="line">
                <span>{{ nameOf(it) }} ×{{ it.qty }}</span>
                <span>{{ formatVND(it.amount) }}</span>
              </div>
            </div>
            <div v-if="order" class="total">{{ t('menu.total') }} {{ formatVND(order.total) }}</div>
          </div>
        </van-tab>
        <van-tab :title="`${t('menu.cart')}(${cartCount})`">
          <div class="pad">
            <div class="section">{{ t('menu.shared') }}</div>
            <van-empty v-if="!cart.length" :description="t('menu.emptyCart')" />
            <div v-for="item in cart" :key="item.id" class="cart-line">
              <div>
                <div>{{ nameOf(item) }}</div>
                <div class="who">{{ item.nickname }}</div>
              </div>
              <div class="right">
                <div>{{ formatVND(item.amount) }}</div>
                <van-stepper
                  :model-value="item.qty"
                  :min="0"
                  @change="(v: number) => changeQty(item, v)"
                />
              </div>
            </div>
          </div>
        </van-tab>
      </van-tabs>

      <div class="table-submit-bar">
        <div class="table-submit-sum">
          <span class="table-submit-label">{{ t('menu.total') }}</span>
          <strong class="table-submit-price">{{ formatVND(cartTotal) }}</strong>
        </div>
        <van-button
          type="danger"
          round
          class="table-submit-btn"
          :disabled="!cart.length"
          @click="submit"
        >
          {{ t('menu.submit') }}
        </van-button>
      </div>
    </template>

    <van-popup v-model:show="optVisible" position="bottom" round :style="{ maxHeight: '85%' }">
      <div class="opt" v-if="optDish">
        <h3 class="opt-title">{{ nameOf(optDish) }}</h3>
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
          <van-button type="primary" round class="opt-add" @click="confirmOptions">
            {{ t('menu.confirm') }}
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; padding-bottom: 72px; }
.pad { padding: 12px 16px; }
.join h2 { margin: 8px 0; }
.warn { color: #e6a23c; }
.pin-hint {
  margin: 8px 0 4px;
  padding: 10px 12px;
  background: #fff7e6;
  color: #ad6800;
  font-size: 13px;
  line-height: 1.45;
  border-radius: 8px;
}
.hint { color: #888; font-size: 13px; text-align: center; }
.lang { color: #1989fa; font-size: 13px; }
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid #eee;
}
.pin { margin-left: auto; color: #666; font-size: 12px; }
.menu-layout { display: flex; height: 60vh; min-height: 320px; overflow: hidden; }
.dish-list {
  flex: 1;
  min-width: 0;
  padding: 0 8px 8px;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  position: relative;
}
.cat-section-title {
  margin: 0;
  padding: 10px 4px 6px;
  font-size: 13px;
  font-weight: 700;
  color: #646566;
  background: #f7f8fa;
  position: sticky;
  top: 0;
  z-index: 2;
}
.dish {
  display: flex;
  gap: 10px;
  align-items: stretch;
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}
.dish-img-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
}
.dish-img {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
  background: #f2f3f5;
}
.dish-img-ph {
  display: flex;
  align-items: center;
  justify-content: center;
}
.dish-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.d-name-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}
.d-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 14px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 已点标记：小号、不抢菜名，贴在名称右侧留白 */
.ordered-mark {
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  color: #ee0a24;
  white-space: nowrap;
}
.cat-sidebar :deep(.van-badge--top-right) {
  transform: translate(50%, -40%);
}
.spec-hint {
  margin-top: 2px;
  font-size: 11px;
  color: #969799;
}
.dish-price-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.d-price {
  color: #ff6a00;
  font-weight: 700;
  font-size: 14px;
}
.qty-ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
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
.table-submit-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  background: #fff;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}
.table-submit-sum {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.table-submit-label {
  font-size: 12px;
  color: #969799;
}
.table-submit-price {
  font-size: 18px;
  font-weight: 800;
  color: #ff6a00;
  line-height: 1.2;
  white-space: nowrap;
}
.table-submit-btn {
  flex: 0 0 auto;
  min-width: 132px;
  height: 40px !important;
  padding: 0 18px !important;
  font-size: 14px !important;
  font-weight: 700;
  white-space: nowrap;
}
.round { background: #fff; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.round-h { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; font-weight: 600; }
.line { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
.who { color: #999; font-size: 12px; font-weight: 400; }
.total { text-align: right; font-weight: 700; margin-top: 8px; }
.section { font-weight: 600; margin-bottom: 8px; }
.cart-line {
  display: flex;
  justify-content: space-between;
  background: #fff;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 8px;
}
.right { text-align: right; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.opt { padding: 16px 16px 24px; }
.opt-title { margin: 0 0 14px; font-size: 16px; }
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
</style>
