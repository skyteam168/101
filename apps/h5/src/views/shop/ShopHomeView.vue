<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { Events, formatVND, localeField } from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import {
  getDeliveryMenu,
  getStoreInfo,
  type Dish,
  type DishOption,
  type MenuCategory,
  type StoreInfo,
} from '../../api/delivery';
import { useCartStore } from '../../stores/cart';
import { useCustomerStore } from '../../stores/customer';
import {
  formatBusinessHoursLine,
  googleMapsUrl,
  normalizeTel,
} from '../../utils/business-hours-display';

const { t, locale } = useI18n();
const router = useRouter();
const cart = useCartStore();
const customer = useCustomerStore();

const store = ref<StoreInfo | null>(null);
const categories = ref<MenuCategory[]>([]);
const activeCat = ref(0);
const loading = ref(true);
const dishListRef = ref<HTMLElement | null>(null);
const sectionRefs = ref<HTMLElement[]>([]);
/** 点击左侧分类滚动时，暂时忽略右侧 scroll 回写，避免抖动 */
let syncLock = false;
let syncUnlockTimer: ReturnType<typeof setTimeout> | null = null;
let menuSocket: Socket | null = null;
let menuPollTimer: ReturnType<typeof setInterval> | null = null;

const optVisible = ref(false);
const optDish = ref<Dish | null>(null);
const optQty = ref(1);
const optSelected = ref<Record<string, string[]>>({});

function switchLocale() {
  locale.value = locale.value === 'zh-CN' ? 'vi-VN' : 'zh-CN';
  localStorage.setItem('locale', locale.value);
}

const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

function dishName(dish: Dish) {
  return loc.value === 'vi' ? dish.nameVi || dish.nameZh : dish.nameZh || dish.nameVi;
}

function catName(cat: MenuCategory) {
  return loc.value === 'vi' ? cat.nameVi || cat.nameZh : cat.nameZh || cat.nameVi;
}

function storeName(s: StoreInfo) {
  return loc.value === 'vi' ? s.nameVi || s.nameZh : s.nameZh || s.nameVi;
}

const gallery = computed(() => {
  const env = store.value?.envGallery?.filter((g) => g.image) || [];
  if (env.length) return env;
  if (store.value?.storefrontImage) {
    return [{ image: store.value.storefrontImage, captionZh: '', captionVi: '' }];
  }
  return [];
});

async function refreshMenu() {
  try {
    categories.value = await getDeliveryMenu();
  } catch {
    /* 静默失败，保留当前菜单 */
  }
}

function connectMenuRealtime(storeId: string) {
  menuSocket?.disconnect();
  menuSocket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });
  menuSocket.on('connect', () => {
    menuSocket?.emit('join', { room: `store:${storeId}:front` });
  });
  menuSocket.on(Events.DISH_UPDATED, () => {
    void refreshMenu();
  });
}

onMounted(async () => {
  try {
    const [storeData, menuData] = await Promise.all([getStoreInfo(), getDeliveryMenu()]);
    store.value = storeData;
    categories.value = menuData;
    connectMenuRealtime(storeData.id);
    menuPollTimer = setInterval(() => {
      void refreshMenu();
    }, 60_000);
  } catch {
    showToast(t('errors.HTTP_ERROR'));
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  if (menuPollTimer) clearInterval(menuPollTimer);
  menuPollTimer = null;
  menuSocket?.off(Events.DISH_UPDATED);
  menuSocket?.disconnect();
  menuSocket = null;
});

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
  // 滚到底部时高亮最后一个分类
  if (scrollTop + list.clientHeight >= list.scrollHeight - 24) {
    const last = sectionRefs.value.length - 1;
    if (activeCat.value !== last) activeCat.value = last;
    return;
  }
  // 取最后一个「顶部已滚过列表顶部」的分区
  let current = 0;
  for (let i = 0; i < sectionRefs.value.length; i++) {
    const el = sectionRefs.value[i];
    if (!el) continue;
    if (el.offsetTop - 8 <= scrollTop) current = i;
    else break;
  }
  if (activeCat.value !== current) activeCat.value = current;
}

const storeOpen = computed(() => store.value?.openNow !== false);
const hoursText = computed(() => formatBusinessHoursLine(store.value?.businessHours, t));
const deliveryMinutesText = computed(() => {
  const n = store.value?.businessHours?.deliveryMinutes;
  if (n == null || n <= 0) return '';
  return t('shop.deliveryMinutes', { n: Math.round(n) });
});
const storeTel = computed(() => normalizeTel(store.value?.phone));
const storeMapUrl = computed(() => {
  const lat = store.value?.lat;
  const lng = store.value?.lng;
  if (lat == null || lng == null) return null;
  return googleMapsUrl(lat, lng);
});

function openStoreMap() {
  const url = storeMapUrl.value;
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
const closedBannerText = computed(() => {
  if (storeOpen.value) return '';
  if (store.value?.closedReason === 'paused') return t('shop.storePaused');
  if (hoursText.value) return t('shop.storeClosedHours', { hours: hoursText.value });
  return t('shop.storeClosed');
});

/** 分类角标：该分类下购物车已选份数（无则不显示） */
function catCartQty(cat: MenuCategory): number | undefined {
  const dishIds = new Set(cat.dishes.map((d) => String(d.id)));
  const qty = cart.items
    .filter((i) => dishIds.has(String(i.dishId)))
    .reduce((sum, i) => sum + i.qty, 0);
  return qty > 0 ? qty : undefined;
}

function isDishUnavailable(dish: Dish) {
  return dish.status !== 'on' || (dish.stock !== null && dish.stock <= 0);
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
  if (!storeOpen.value) {
    showToast(closedBannerText.value || t('errors.STORE_CLOSED'));
    return;
  }
  if (dish.status !== 'on') {
    showToast(t('errors.DISH_NOT_AVAILABLE'));
    return;
  }
  if (dish.stock !== null && dish.stock <= 0) {
    showToast(t('errors.DISH_SOLD_OUT'));
    return;
  }
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
    addWithOptions(dish, 1, [], '');
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
  return Number(optDish.value.takeawayPrice ?? optDish.value.price) + optExtra.value;
});

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
  // 整体替换，确保模板 class 一定刷新
  optSelected.value = { ...optSelected.value, [groupKey]: next };
}

function confirmOptions() {
  if (!optDish.value) return;
  const snapshot: {
    groupNameZh: string;
    groupNameVi: string;
    optionNameZh: string;
    optionNameVi: string;
    extraPrice: number;
  }[] = [];
  const labels: string[] = [];
  const ids: string[] = [];
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
        extraPrice: Number(o.extraPrice),
      });
      ids.push(o.id);
      labels.push(loc.value === 'vi' ? o.optionNameVi : o.optionNameZh);
    }
  }
  addWithOptions(optDish.value, optQty.value, snapshot, labels.join(' / '), ids);
  optVisible.value = false;
}

function addWithOptions(
  dish: Dish,
  qty: number,
  optionsSnapshot: unknown[],
  optionLabel: string,
  optionIds: string[] = [],
) {
  const base = Number(dish.takeawayPrice ?? dish.price);
  const extra = (optionsSnapshot as { extraPrice?: number }[]).reduce(
    (s, o) => s + Number(o.extraPrice || 0),
    0,
  );
  cart.add({
    dishId: String(dish.id),
    nameZh: dish.nameZh,
    nameVi: dish.nameVi,
    price: base + extra,
    qty,
    optionLabel: optionLabel || undefined,
    optionIds: optionIds.length ? optionIds : undefined,
    optionsSnapshot: optionsSnapshot.length ? optionsSnapshot : undefined,
  });
  showToast(t('home.addedCart'));
}

function removeFromCart(dish: Dish) {
  cart.remove(dish.id);
}

const minOrderAmount = computed(() => Number(store.value?.minOrderAmount || 0));
const belowMinOrder = computed(
  () => minOrderAmount.value > 0 && cart.totalAmount < minOrderAmount.value,
);
const minOrderRemain = computed(() =>
  Math.max(0, minOrderAmount.value - cart.totalAmount),
);
const cartBarActionText = computed(() => {
  if (!storeOpen.value) return t('shop.cannotOrder');
  if (belowMinOrder.value) {
    return t('shop.needMore', { amount: formatVND(minOrderRemain.value) });
  }
  return t('shop.goCheckout');
});

function goCheckout() {
  if (!storeOpen.value) {
    showToast(closedBannerText.value || t('errors.STORE_CLOSED'));
    return;
  }
  if (cart.totalQty === 0) {
    showToast(t('errors.CART_EMPTY'));
    return;
  }
  if (belowMinOrder.value) {
    showToast(
      t('shop.needMore', { amount: formatVND(minOrderRemain.value) }),
    );
    return;
  }
  if (!customer.isLoggedIn()) {
    router.push({ name: 'shop-login', query: { redirect: '/shop/checkout' } });
    return;
  }
  router.push({ name: 'shop-checkout' });
}

function galleryCaption(g: { captionZh?: string; captionVi?: string }) {
  return localeField(g as unknown as Record<string, unknown>, 'caption', loc.value) || '';
}
</script>

<template>
  <div
    class="shop-home"
    :class="{ 'has-cart-bar': cart.totalQty > 0 || !storeOpen }"
  >
    <van-nav-bar :title="store ? storeName(store) : t('shop.title')" fixed placeholder>
      <template #right>
        <div class="nav-actions">
          <span class="lang-btn" @click="switchLocale">{{ locale === 'zh-CN' ? 'VI' : '中' }}</span>
          <van-icon
            name="manager"
            size="22"
            @click="router.push({ name: customer.isLoggedIn() ? 'shop-me' : 'shop-login' })"
          />
        </div>
      </template>
    </van-nav-bar>

    <!-- 红色区：商家信息固定，不随滚动 -->
    <div class="store-banner">
      <van-swipe v-if="gallery.length" class="env-swipe" :autoplay="4500" indicator-color="#ff6a00">
        <van-swipe-item v-for="(g, idx) in gallery" :key="idx">
          <div class="env-slide" :style="{ backgroundImage: `url(${g.image})` }">
            <div v-if="galleryCaption(g)" class="env-caption">{{ galleryCaption(g) }}</div>
          </div>
        </van-swipe-item>
      </van-swipe>
      <div class="store-info" v-if="store">
        <div class="store-header">
          <van-icon name="shop-o" size="28" color="#ff6a00" />
          <div class="store-details">
            <div class="store-name-row">
              <div class="store-name">{{ storeName(store) }}</div>
              <span class="open-tag" :class="storeOpen ? 'is-open' : 'is-closed'">
                {{ storeOpen ? t('shop.openNow') : t('shop.resting') }}
              </span>
            </div>
            <div class="store-meta" v-if="hoursText">
              <van-icon name="clock-o" size="12" />
              {{ t('shop.businessHours', { hours: hoursText }) }}
            </div>
            <div v-if="deliveryMinutesText" class="store-meta">
              <van-icon name="logistics" size="12" />
              {{ deliveryMinutesText }}
            </div>
            <div class="store-meta store-meta-row">
              <van-icon name="location-o" size="12" />
              <span class="meta-text">{{ store.address }}</span>
              <button
                v-if="storeMapUrl"
                type="button"
                class="meta-link"
                @click.stop="openStoreMap"
              >
                {{ t('shop.openMap') }}
              </button>
            </div>
            <div v-if="storeTel" class="store-meta">
              <van-icon name="phone-o" size="12" />
              <a class="meta-link tel" :href="`tel:${storeTel}`">{{ store.phone }}</a>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!storeOpen && closedBannerText" class="closed-banner">
        {{ closedBannerText }}
      </div>
    </div>

    <!-- 绿色区：仅此处滚动菜品 / 分类 -->
    <div class="menu-body">
      <div v-if="loading" class="menu-loading">
        <van-skeleton title :row="8" />
      </div>

      <div v-else class="menu-layout">
        <van-sidebar v-model="activeCat" class="cat-sidebar">
          <van-sidebar-item
            v-for="(cat, idx) in categories"
            :key="cat.id"
            :title="catName(cat)"
            :badge="catCartQty(cat)"
            @click="selectCat(idx)"
          />
        </van-sidebar>

        <div
          ref="dishListRef"
          class="dish-list"
          @scroll.passive="onDishListScroll"
        >
          <div v-if="!categories.length" class="empty-tip">
            <van-empty :description="t('shop.noDishes')" />
          </div>
          <section
            v-for="(cat, catIdx) in categories"
            :key="cat.id"
            :ref="setSectionRef"
            class="cat-section"
            :data-cat-index="catIdx"
          >
            <h3 class="cat-section-title">{{ catName(cat) }}</h3>
            <div v-if="!cat.dishes.length" class="cat-empty">
              <van-empty image-size="60" :description="t('shop.noDishes')" />
            </div>
            <div
              v-for="dish in cat.dishes"
              :key="dish.id"
              class="dish-card"
              :class="{ unavailable: isDishUnavailable(dish) || !storeOpen }"
              @click="openDish(dish)"
            >
              <div class="dish-img-wrap">
                <img v-if="dish.image" :src="dish.image" class="dish-img" alt="" />
                <div v-else class="dish-img dish-img-placeholder">
                  <van-icon name="photo-o" size="32" color="#ccc" />
                </div>
                <span v-if="dish.stock !== null && dish.stock <= 0" class="img-sold-tag">
                  {{ t('shop.soldOut') }}
                </span>
                <span v-else-if="dish.status !== 'on'" class="img-sold-tag">
                  {{ t('shop.offShelf') }}
                </span>
              </div>
              <div class="dish-info">
                <div class="dish-name">{{ dishName(dish) }}</div>
                <div class="dish-desc" v-if="loc === 'vi' ? dish.descVi : dish.descZh">
                  {{ loc === 'vi' ? dish.descVi : dish.descZh }}
                </div>
                <div v-if="dish.options?.length" class="spec-hint">{{ t('shop.hasOptions') }}</div>
                <div class="dish-price-row">
                  <span class="dish-price">{{ formatVND(dish.takeawayPrice ?? dish.price) }}</span>
                  <span v-if="dish.stock !== null && dish.stock <= 0" class="sold-out-tag">
                    {{ t('shop.soldOut') }}
                  </span>
                  <span v-else-if="dish.status !== 'on'" class="sold-out-tag">
                    {{ t('shop.offShelf') }}
                  </span>
                  <div v-else-if="storeOpen" class="qty-ctrl" @click.stop>
                    <button
                      v-if="cart.getQty(dish.id) > 0"
                      type="button"
                      class="qty-btn qty-minus"
                      aria-label="minus"
                      @click="removeFromCart(dish)"
                    >
                      <van-icon name="minus" size="12" />
                    </button>
                    <span v-if="cart.getQty(dish.id) > 0" class="qty-num">
                      {{ cart.getQty(dish.id) }}
                    </span>
                    <button
                      type="button"
                      class="qty-btn qty-plus"
                      aria-label="plus"
                      @click="openDish(dish)"
                    >
                      <van-icon name="plus" size="14" />
                    </button>
                  </div>
                  <span v-else class="sold-out-tag">{{ t('shop.resting') }}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div
      v-if="cart.totalQty > 0 || !storeOpen"
      class="cart-bar"
      :class="{
        disabled: !storeOpen,
        'below-min': storeOpen && belowMinOrder,
      }"
      @click="goCheckout"
    >
      <div class="cart-bar-left">
        <div class="cart-icon-wrap">
          <van-icon name="shopping-cart-o" size="24" color="#fff" />
          <span v-if="cart.totalQty > 0" class="cart-badge">{{ cart.totalQty }}</span>
        </div>
        <div class="cart-amount">
          <span class="cart-total">
            {{ storeOpen ? formatVND(cart.totalAmount) : t('shop.resting') }}
          </span>
          <span v-if="storeOpen && minOrderAmount > 0" class="cart-min">
            {{ t('shop.minOrder', { amount: formatVND(minOrderAmount) }) }}
          </span>
        </div>
      </div>
      <div class="cart-bar-right" :class="{ warn: storeOpen && belowMinOrder }">
        {{ cartBarActionText }}
      </div>
    </div>

    <van-popup v-model:show="optVisible" position="bottom" round :style="{ maxHeight: '85%' }">
      <div class="opt" v-if="optDish">
        <div class="opt-head">
          <img v-if="optDish.image" :src="optDish.image" class="opt-img" alt="" />
          <div class="opt-head-text">
            <h3>{{ dishName(optDish) }}</h3>
            <div class="opt-price">{{ formatVND(optUnitPrice) }}</div>
            <div
              class="opt-desc"
              v-if="
                (loc === 'vi' ? optDish.descVi : optDish.descZh) &&
                (loc === 'vi' ? optDish.descVi : optDish.descZh) !== dishName(optDish)
              "
            >
              {{ loc === 'vi' ? optDish.descVi : optDish.descZh }}
            </div>
          </div>
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
            {{ t('shop.addToCart') }} · {{ formatVND(optUnitPrice * optQty) }}
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.shop-home {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f7f8fa;
  box-sizing: border-box;
}
.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lang-btn {
  font-size: 13px;
  color: #323233;
  cursor: pointer;
  font-weight: 600;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 2px 6px;
}
.store-banner {
  flex-shrink: 0;
  background: #fff;
}
.env-swipe {
  height: 120px;
}
.env-slide {
  height: 120px;
  background: #f3f4f6 center/cover no-repeat;
  position: relative;
}
.env-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
}
.store-info {
  padding: 12px 16px;
}
.store-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.store-details {
  flex: 1;
}
.store-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.store-name {
  font-size: 16px;
  font-weight: 700;
  color: #323233;
}
.open-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.open-tag.is-open {
  color: #07c160;
  background: #e8f8ef;
}
.open-tag.is-closed {
  color: #969799;
  background: #f2f3f5;
}
.store-meta {
  font-size: 12px;
  color: #969799;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.store-meta-row {
  flex-wrap: wrap;
}
.meta-text {
  flex: 1;
  min-width: 0;
}
.meta-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: #1989fa;
  font-size: 12px;
  flex-shrink: 0;
}
.meta-link.tel {
  text-decoration: none;
}
.closed-banner {
  margin: 0 12px 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7e8;
  color: #ed6a0c;
  font-size: 13px;
  line-height: 1.4;
}
.menu-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.menu-loading {
  padding: 16px;
  overflow: auto;
}
.menu-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  overflow: hidden;
}
.cat-sidebar {
  width: 88px;
  flex-shrink: 0;
  align-self: stretch;
  overflow-x: hidden;
  overflow-y: auto;
  background: #f7f8fa;
  -webkit-overflow-scrolling: touch;
}
.cat-sidebar :deep(.van-sidebar-item) {
  padding: 16px 8px;
  line-height: 1.3;
  word-break: break-word;
}
.dish-list {
  flex: 1;
  min-width: 0;
  min-height: 0;
  align-self: stretch;
  overflow-x: hidden;
  overflow-y: auto;
  background: #fff;
  padding: 0 0 16px;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: auto;
  position: relative;
}
.shop-home.has-cart-bar .dish-list {
  padding-bottom: 72px;
}
.cat-section {
  scroll-margin-top: 0;
}
.cat-section-title {
  margin: 0;
  padding: 10px 12px 6px;
  font-size: 13px;
  font-weight: 700;
  color: #646566;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 2;
}
.cat-empty {
  padding: 8px 0 16px;
}
.dish-card {
  display: flex;
  padding: 12px;
  border-bottom: 1px solid #f7f8fa;
  gap: 10px;
  cursor: pointer;
}
.dish-card.unavailable .dish-name,
.dish-card.unavailable .dish-price {
  color: #c8c9cc;
}
.dish-img-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}
.dish-img {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
}
.dish-card.unavailable .dish-img {
  filter: grayscale(0.7);
  opacity: 0.7;
}
.dish-img-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f7f8fa;
}
.img-sold-tag {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.dish-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
}
.dish-name {
  font-size: 14px;
  font-weight: 600;
  color: #323233;
  margin-bottom: 4px;
}
.dish-desc {
  font-size: 12px;
  color: #969799;
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.spec-hint {
  font-size: 11px;
  color: #ff6a00;
  margin-bottom: 4px;
}
.dish-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dish-price {
  font-size: 15px;
  font-weight: 700;
  color: #ff6a00;
}
.sold-out-tag {
  font-size: 12px;
  color: #969799;
  background: #f7f8fa;
  padding: 2px 8px;
  border-radius: 4px;
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
.cart-bar {
  position: fixed;
  left: 16px;
  right: 16px;
  width: auto;
  box-sizing: border-box;
  min-height: 54px;
  background: #323233;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 14px;
  z-index: 100;
  cursor: pointer;
  border-radius: 27px;
  bottom: 56px;
  overflow: visible;
}
.cart-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.cart-icon-wrap {
  position: relative;
  flex-shrink: 0;
  line-height: 1;
}
.cart-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #ff6a00;
  color: #fff;
  font-size: 10px;
  border-radius: 8px;
  min-width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  line-height: 1;
}
.cart-amount {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}
.cart-total {
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}
.cart-min {
  color: #c8c9cc;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
}
.cart-bar-right {
  background: #ff6a00;
  color: #fff;
  padding: 8px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 600;
  flex: 0 0 auto;
  max-width: 46%;
  white-space: nowrap;
  line-height: 1.25;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cart-bar-right.warn {
  background: #ff976a;
}
.cart-bar.below-min {
  cursor: pointer;
}
.cart-bar.disabled {
  background: #969799;
  cursor: not-allowed;
}
.cart-bar.disabled .cart-bar-right {
  background: #7d7e80;
}
.cart-bar.disabled .cart-total {
  font-size: 15px;
  font-weight: 600;
}
.empty-tip {
  padding-top: 40px;
}
.opt {
  padding: 16px 16px 24px;
}
.opt-head {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.opt-img {
  width: 88px;
  height: 88px;
  border-radius: 10px;
  object-fit: cover;
}
.opt-head-text {
  flex: 1;
  min-width: 0;
}
.opt-head-text h3 {
  margin: 0 0 6px;
  font-size: 16px;
}
.opt-price {
  color: #ff6a00;
  font-weight: 700;
  font-size: 16px;
}
.opt-desc {
  margin-top: 6px;
  font-size: 12px;
  color: #969799;
  line-height: 1.4;
}
.og {
  margin-bottom: 18px;
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
  color: #323233;
}
.og-hint {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: #969799;
}
.req {
  color: #ee0a24;
  margin-left: 2px;
}
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
  transition: border-color 0.15s, background 0.15s, color 0.15s, box-shadow 0.15s;
  appearance: none;
  -webkit-appearance: none;
}
.chip.active {
  border-color: #ff6a00 !important;
  background: #fff5eb !important;
  color: #ff6a00 !important;
  box-shadow: 0 0 0 1px #ff6a00;
}
.chip-name {
  text-align: center;
}
.chip-extra {
  font-size: 11px;
  font-weight: 700;
  color: #ff6a00;
  white-space: nowrap;
}
.chip:not(.active) .chip-extra {
  color: #ff8f3d;
}
.opt-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-top: 4px;
}
.opt-add {
  flex: 1;
}
</style>
