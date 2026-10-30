<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { showToast } from 'vant';
import { Events, formatVND, localeField } from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
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
  const storeId = meta.value?.storeId || peek.value?.storeId || '1';
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
  optSelected.value = {};
  const groups = new Map<string, typeof dish.options>();
  for (const o of dish.options || []) {
    const key = `${o.groupNameZh}|${o.groupNameVi}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }
  for (const [, opts] of groups) {
    const gkey = `${opts[0].groupNameZh}|${opts[0].groupNameVi}`;
    if (opts[0].required && !opts[0].multi) {
      optSelected.value[gkey] = [opts[0].id];
    } else {
      optSelected.value[gkey] = [];
    }
  }
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
      const o = g.opts.find((x) => x.id === id)!;
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
  socket.on(Events.CART_UPDATED, (payload: { items?: CartLine[] }) => {
    if (payload?.items) cart.value = payload.items;
  });
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
    <van-nav-bar :title="peek ? t('join.table', { code: peek.code }) : t('app.title')">
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

      <van-tabs v-model:active="tab" sticky>
        <van-tab :title="t('menu.title')">
          <div class="menu-layout">
            <van-sidebar v-model="activeCat">
              <van-sidebar-item v-for="c in categories" :key="c.id" :title="nameOf(c)" />
            </van-sidebar>
            <div class="dish-list">
              <div
                v-for="d in categories[activeCat]?.dishes || []"
                :key="d.id"
                class="dish"
                @click="openOptions(d)"
              >
                <div class="d-name">{{ nameOf(d) }}</div>
                <div class="d-price">{{ formatVND(d.price) }}</div>
              </div>
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

      <van-submit-bar
        :price="cartTotal * 100"
        :currency="'₫'"
        :decimal-length="0"
        :button-text="t('menu.submit')"
        :disabled="!cart.length"
        @submit="submit"
      />
    </template>

    <van-popup v-model:show="optVisible" position="bottom" round>
      <div class="opt" v-if="optDish">
        <h3>{{ nameOf(optDish) }}</h3>
        <div v-for="g in optionGroups(optDish)" :key="g.key" class="og">
          <div class="og-t">{{ g.name }}</div>
          <van-checkbox-group v-if="g.multi" v-model="optSelected[g.key]">
            <van-checkbox v-for="o in g.opts" :key="o.id" :name="o.id">
              {{ loc === 'vi' ? o.optionNameVi : o.optionNameZh }}
              <span v-if="o.extraPrice">+{{ formatVND(o.extraPrice) }}</span>
            </van-checkbox>
          </van-checkbox-group>
          <van-radio-group
            v-else
            :model-value="(optSelected[g.key] || [])[0]"
            @update:model-value="(v: string) => (optSelected[g.key] = [v])"
          >
            <van-radio v-for="o in g.opts" :key="o.id" :name="o.id">
              {{ loc === 'vi' ? o.optionNameVi : o.optionNameZh }}
              <span v-if="o.extraPrice">+{{ formatVND(o.extraPrice) }}</span>
            </van-radio>
          </van-radio-group>
        </div>
        <van-stepper v-model="optQty" :min="1" />
        <van-button type="primary" block class="mt" @click="confirmOptions">{{ t('menu.confirm') }}</van-button>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; padding-bottom: 60px; }
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
.menu-layout { display: flex; min-height: 60vh; }
.dish-list { flex: 1; padding: 8px; overflow: auto; }
.dish {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}
.d-name { font-weight: 600; }
.d-price { color: #ff6a00; margin-top: 6px; }
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
.opt { padding: 16px; }
.og { margin-bottom: 12px; }
.og-t { font-weight: 600; margin-bottom: 6px; }
.mt { margin-top: 12px; }
</style>
