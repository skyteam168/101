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

async function loadPeek() {
  peek.value = await peekTableApi(qrToken.value);
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

async function refreshState() {
  const state = await sessionStateApi();
  cart.value = state.cart;
  order.value = state.order;
}

function openOptions(dish: MenuCategory['dishes'][0]) {
  optDish.value = dish;
  optQty.value = 1;
  const groups = new Map<string, typeof dish.options>();
  for (const o of dish.options || []) {
    const key = `${o.groupNameZh}|${o.groupNameVi}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }
  const initial: Record<string, string[]> = {};
  for (const [, opts] of groups) {
    const gkey = `${opts[0].groupNameZh}|${opts[0].groupNameVi}`;
    if (opts[0].required && !opts[0].multi) {
      initial[gkey] = [String(opts[0].id)];
    } else {
      initial[gkey] = [];
    }
  }
  optSelected.value = initial;
  if (!(dish.options || []).length) {
    addDish(dish, 1, []);
    return;
  }
  optVisible.value = true;
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
  const snapshot = [];
  for (const g of optionGroups(optDish.value)) {
    const ids = optSelected.value[g.key] || [];
    if (g.required && !ids.length) {
      showToast(g.name);
      return;
    }
    for (const id of ids) {
      const o = g.opts.find((x) => String(x.id) === String(id))!;
      snapshot.push({
        groupNameZh: o.groupNameZh,
        groupNameVi: o.groupNameVi,
        optionNameZh: o.optionNameZh,
        optionNameVi: o.optionNameVi,
        extraPrice: o.extraPrice,
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
  showToast(t('menu.add'));
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

async function callWaiter() {
  await callWaiterApi();
  showToast(t('menu.called'));
}

async function requestBill() {
  await requestBillApi();
  showToast(t('menu.billed'));
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
  socket.on(Events.ORDER_PAID, () => refreshState());
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
        <van-button size="small" @click="callWaiter">{{ t('menu.callWaiter') }}</van-button>
        <van-button size="small" type="warning" @click="requestBill">{{ t('menu.requestBill') }}</van-button>
        <span class="pin">PIN {{ meta?.pin }}</span>
      </div>

      <van-tabs v-model:active="tab" sticky offset-top="46">
        <van-tab :title="t('menu.title')">
          <div class="menu-layout">
            <van-sidebar v-model="activeCat" @change="selectCat">
              <van-sidebar-item v-for="c in categories" :key="c.id" :title="nameOf(c)" />
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
                    <div class="d-name">{{ nameOf(d) }}</div>
                    <div class="d-price">{{ formatVND(d.price) }}</div>
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
.d-name {
  font-weight: 600;
  font-size: 14px;
  line-height: 1.35;
}
.d-price {
  color: #ff6a00;
  margin-top: 6px;
  font-weight: 700;
  font-size: 14px;
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
