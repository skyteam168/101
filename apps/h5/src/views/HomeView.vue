<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { formatVND, isSafeExternalHttpUrl, isSafeMediaUrl, localeField } from '@restaurant/shared';
import {
  getMemberBenefits,
  getMyMembership,
  joinMemberApi,
  type MemberBenefitLevel,
  type Membership,
} from '../api/member';
import {
  getHomeFeedApi,
  type HomeBanner,
  type HomeNewDish,
  type HomeNotice,
  type HomeStore,
} from '../api/home';
import { useCartStore } from '../stores/cart';
import { useCustomerStore } from '../stores/customer';
import { useInboxStore } from '../stores/inbox';
import { getCustomerToken } from '../utils/customer-storage';
import { listChatMessages, type ChatMessage } from '../api/chat';
import { formatBusinessHoursLine } from '../utils/business-hours-display';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const cart = useCartStore();
const customer = useCustomerStore();
const inbox = useInboxStore();

const store = ref<HomeStore | null>(null);
const banners = ref<HomeBanner[]>([]);
const notices = ref<HomeNotice[]>([]);
const personalMessages = ref<ChatMessage[]>([]);
const newDishes = ref<HomeNewDish[]>([]);
const showNotices = ref(false);
const showJoin = ref(false);
const joinLevels = ref<MemberBenefitLevel[]>([]);
const membership = ref<Membership | null>(null);
const joinBirthday = ref('');
const joinAgree = ref(false);
const joining = ref(false);

const loc = computed(() => (String(locale.value).startsWith('vi') ? 'vi' : 'zh'));

const storeName = computed(() => {
  if (!store.value) return t('home.title');
  return localeField(store.value as unknown as Record<string, unknown>, 'name', loc.value);
});

const noticeText = computed(() => {
  if (!notices.value.length) return '';
  return notices.value
    .map((n) => {
      const title = localeField(n as unknown as Record<string, unknown>, 'title', loc.value);
      const content = localeField(n as unknown as Record<string, unknown>, 'content', loc.value);
      return `${title}：${content}`;
    })
    .join('　　');
});

/** 欢迎区展示门头图，不再用菜品图 */
const heroImage = computed(() => {
  if (store.value?.storefrontImage) return store.value.storefrontImage;
  const envFirst = store.value?.envGallery?.find((g) => g.image)?.image;
  if (envFirst) return envFirst;
  return '';
});

function switchLocale() {
  locale.value = locale.value === 'zh-CN' ? 'vi-VN' : 'zh-CN';
  localStorage.setItem('locale', String(locale.value));
}

function dishName(d: HomeNewDish) {
  return localeField(d as unknown as Record<string, unknown>, 'name', loc.value);
}

function bannerTitle(b: HomeBanner) {
  return localeField(b as unknown as Record<string, unknown>, 'title', loc.value) || t('home.bannerDefault');
}

function noticeIcon(level?: string) {
  if (level === 'important') return 'warning-o';
  if (level === 'warn') return 'info-o';
  return 'volume-o';
}

function noticeLevelLabel(level?: string) {
  if (level === 'important') return t('home.noticeLevel.important');
  if (level === 'warn') return t('home.noticeLevel.warn');
  return t('home.noticeLevel.info');
}

function goReserve() {
  if (!storeOpen.value) {
    showToast(closedTip.value || t('errors.STORE_CLOSED'));
    return;
  }
  router.push({ name: 'reserve' });
}

function goMyReservations() {
  router.push({ name: 'my-reservations' });
}

function goShop() {
  if (!storeOpen.value) {
    showToast(closedTip.value || t('errors.STORE_CLOSED'));
    return;
  }
  router.push({ name: 'shop' });
}

function goChat() {
  if (!storeOpen.value) {
    showToast(closedTip.value || t('errors.STORE_CLOSED'));
    return;
  }
  if (customer.isLoggedIn() || getCustomerToken()) {
    router.push({ name: 'shop-chat' });
  } else {
    router.push({ name: 'shop-login', query: { redirect: '/shop/chat' } });
  }
}

function goGroupMeal() {
  if (!storeOpen.value) {
    showToast(closedTip.value || t('errors.STORE_CLOSED'));
    return;
  }
  router.push({ name: 'group-meal' });
}

function goCoupons() {
  router.push({ name: 'shop-coupons' });
}

function levelName(lv: { nameZh: string; nameVi: string }) {
  return localeField(lv as unknown as Record<string, unknown>, 'name', loc.value);
}

async function openJoin() {
  if (!(customer.isLoggedIn() || getCustomerToken())) {
    router.push({ name: 'shop-login', query: { redirect: '/?join=1' } });
    return;
  }
  try {
    const [benefits, mine] = await Promise.all([getMemberBenefits(), getMyMembership()]);
    joinLevels.value = benefits.levels;
    membership.value = mine;
    joinBirthday.value = mine.birthday || '';
    joinAgree.value = false;
    showJoin.value = true;
  } catch {
    /* http 已提示 */
  }
}

async function submitJoin() {
  if (!joinBirthday.value) {
    showToast(t('errors.MEMBER_BIRTHDAY_REQUIRED'));
    return;
  }
  if (!joinAgree.value) {
    showToast(t('errors.MEMBER_AGREE_REQUIRED'));
    return;
  }
  joining.value = true;
  try {
    membership.value = await joinMemberApi({ birthday: joinBirthday.value, agree: true });
    showToast(t('home.joinOk'));
    showJoin.value = false;
  } catch {
    /* http 已提示 */
  } finally {
    joining.value = false;
  }
}

function goMine() {
  if (customer.isLoggedIn() || getCustomerToken()) {
    router.push({ name: 'shop-me' });
  } else {
    router.push({ name: 'shop-login', query: { redirect: '/shop/me' } });
  }
}

function goSearch() {
  router.push({ name: 'shop' });
}

const greeting = computed(() => {
  const name = customer.profile?.name?.trim();
  if (name) return t('home.welcomeName', { name });
  return t('home.welcome');
});

function onBannerClick(b: HomeBanner) {
  if (!b.link) {
    goShop();
    return;
  }
  if (isSafeExternalHttpUrl(b.link)) {
    window.open(b.link, '_blank', 'noopener,noreferrer');
    return;
  }
  // 仅允许站内相对路径，拒绝 javascript: 等
  if (b.link.startsWith('/') && !b.link.startsWith('//')) {
    router.push(b.link);
    return;
  }
  goShop();
}

const storeOpen = computed(() => store.value?.openNow !== false);
const hoursText = computed(() => formatBusinessHoursLine(store.value?.businessHours, t));
const closedTip = computed(() => {
  if (storeOpen.value) return '';
  if (store.value?.closedReason === 'paused') return t('shop.storePaused');
  if (hoursText.value) return t('shop.storeClosedHours', { hours: hoursText.value });
  return t('shop.storeClosed');
});

function isNewDishUnavailable(d: HomeNewDish) {
  if (d.status && d.status !== 'on') return true;
  if (d.stock !== null && d.stock !== undefined && d.stock <= 0) return true;
  return false;
}

function canAddNewDish(d: HomeNewDish) {
  if (!storeOpen.value) {
    showToast(closedTip.value || t('errors.STORE_CLOSED'));
    return false;
  }
  if (d.status && d.status !== 'on') {
    showToast(t('errors.DISH_NOT_AVAILABLE'));
    return false;
  }
  if (d.stock !== null && d.stock !== undefined && d.stock <= 0) {
    showToast(t('errors.DISH_SOLD_OUT'));
    return false;
  }
  return true;
}

const optVisible = ref(false);
const optDish = ref<HomeNewDish | null>(null);
const optQty = ref(1);
const optSelected = ref<Record<string, string[]>>({});

function optionGroups(dish: HomeNewDish) {
  const map = new Map<string, NonNullable<HomeNewDish['options']>>();
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

function addWithOptions(
  dish: HomeNewDish,
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

/** 有规格时打开选择弹窗；无规格直接加购（与外卖点餐页一致） */
function addNewDish(d: HomeNewDish) {
  if (!canAddNewDish(d)) return;
  const groups = optionGroups(d);
  if (!groups.length) {
    cart.add({
      dishId: String(d.id),
      nameZh: d.nameZh,
      nameVi: d.nameVi,
      price: Number(d.takeawayPrice ?? d.price),
    });
    showToast(t('home.addedCart'));
    return;
  }
  optDish.value = d;
  optQty.value = 1;
  const initial: Record<string, string[]> = {};
  for (const g of groups) {
    if (g.required && !g.multi && g.opts[0]) {
      initial[g.key] = [String(g.opts[0].id)];
    } else {
      initial[g.key] = [];
    }
  }
  optSelected.value = initial;
  optVisible.value = true;
}

function removeNewDish(d: HomeNewDish) {
  cart.remove(d.id);
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
      ids.push(String(o.id));
      labels.push(loc.value === 'vi' ? o.optionNameVi : o.optionNameZh);
    }
  }
  addWithOptions(optDish.value, optQty.value, snapshot, labels.join(' / '), ids);
  optVisible.value = false;
}

function personalKind(content: string) {
  if (/优惠券|phiếu giảm/i.test(content)) return 'coupon';
  if (/生日|sinh nhật/i.test(content)) return 'birthday';
  return 'info';
}

async function loadPersonal() {
  if (!(customer.isLoggedIn() || getCustomerToken())) {
    personalMessages.value = [];
    return;
  }
  try {
    const page = await listChatMessages({ limit: 20 });
    personalMessages.value = page.items
      .filter((m) => m.senderType === 'staff' && !m.senderId && m.contentType === 'text')
      .filter((m) => personalKind(m.content) !== 'info')
      .slice(-4)
      .reverse();
  } catch {
    personalMessages.value = [];
  }
}

async function loadHome() {
  try {
    const data = await getHomeFeedApi();
    store.value = data.store;
    banners.value = data.banners || data.store?.banners || [];
    notices.value = data.notices || [];
    newDishes.value = data.newDishes || [];
  } catch {
    store.value = null;
    banners.value = [];
    notices.value = [];
    newDishes.value = [];
  }
}

onMounted(async () => {
  await loadHome();
  if (customer.isLoggedIn() || getCustomerToken()) {
    try {
      await customer.loadMe();
    } catch {
      /* 未登录或 token 失效时保持本地资料 */
    }
    void inbox.refresh();
    void loadPersonal();
    try {
      membership.value = await getMyMembership();
    } catch {
      membership.value = null;
    }
  }
  if (route.query.join === '1' && (customer.isLoggedIn() || getCustomerToken())) {
    await openJoin();
  }
});
</script>

<template>
  <div class="home-app">
    <header class="top-bar">
      <button type="button" class="store-pin" @click="goSearch">
        <span class="pin-dot">
          <van-icon name="location" size="16" />
        </span>
        <span class="store-name">{{ storeName }}</span>
        <van-icon name="arrow-down" size="12" class="pin-chevron" />
        <span
          v-if="store"
          class="home-open-tag"
          :class="storeOpen ? 'is-open' : 'is-closed'"
        >
          {{ storeOpen ? t('shop.openNow') : t('shop.resting') }}
        </span>
      </button>
      <div class="top-actions">
        <button type="button" class="icon-btn" @click="showNotices = true">
          <van-icon name="bell" size="20" />
          <i v-if="notices.length || personalMessages.length || inbox.unread" class="dot" />
        </button>
        <button type="button" class="lang-mini" @click="switchLocale">
          {{ locale === 'zh-CN' ? 'VI' : '中' }}
        </button>
        <button type="button" class="icon-btn avatar-btn" @click="goMine">
          <img
            v-if="customer.profile?.avatar"
            :src="customer.profile.avatar"
            alt=""
            class="avatar-photo"
          />
          <van-icon v-else name="user-o" size="18" />
        </button>
      </div>
    </header>

    <div v-if="!storeOpen && closedTip" class="home-closed-banner">
      {{ closedTip }}
    </div>

    <section class="hero">
      <div class="hero-text">
        <h1>{{ greeting }} <span class="wave" aria-hidden="true">👋</span></h1>
        <p>{{ t('home.subtitle') }}</p>
      </div>
      <div class="hero-media" :class="{ empty: !heroImage }">
        <img v-if="heroImage" :src="heroImage" alt="" />
        <van-icon v-else name="shop-o" size="42" color="#86efac" />
      </div>
    </section>

    <button type="button" class="search-bar" @click="goSearch">
      <van-icon name="search" size="18" />
      <span>{{ t('home.searchPh') }}</span>
    </button>

    <button
      v-if="inbox.unread"
      type="button"
      class="inbox-strip"
      :class="{ disabled: !storeOpen }"
      :disabled="!storeOpen"
      @click="goChat"
    >
      <van-icon name="chat-o" size="16" />
      <span>{{ inbox.preview || t('home.inboxNew') }}</span>
    </button>

    <van-notice-bar
      v-if="noticeText"
      class="notice-bar"
      left-icon="volume-o"
      background="transparent"
      color="#b45309"
      scrollable
      :text="noticeText"
      @click="showNotices = true"
    />

    <section class="entry-row">
      <button
        type="button"
        class="entry"
        :class="{ disabled: !storeOpen }"
        :disabled="!storeOpen"
        @click="goReserve"
      >
        <span class="entry-icon c-orange"><van-icon name="shop-o" size="26" /></span>
        <span class="entry-label">{{ t('home.reserve.title') }}</span>
      </button>
      <button
        type="button"
        class="entry"
        :class="{ disabled: !storeOpen }"
        :disabled="!storeOpen"
        @click="goShop"
      >
        <span class="entry-icon c-green"><van-icon name="logistics" size="26" /></span>
        <span class="entry-label">{{ t('home.delivery.title') }}</span>
      </button>
      <button
        type="button"
        class="entry"
        :class="{ disabled: !storeOpen }"
        :disabled="!storeOpen"
        @click="goGroupMeal"
      >
        <span class="entry-icon c-purple"><van-icon name="friends-o" size="26" /></span>
        <span class="entry-label">{{ t('home.group.title') }}</span>
      </button>
      <button type="button" class="entry" @click="goCoupons">
        <span class="entry-icon c-blue"><van-icon name="coupon-o" size="26" /></span>
        <span class="entry-label">{{ t('home.coupon.title') }}</span>
      </button>
    </section>
    <div class="entry-sub">
      <button type="button" class="entry-sub-link" @click="goMyReservations">
        {{ t('reserve.myTitle') }}
        <van-icon name="arrow" size="12" />
      </button>
    </div>

    <section v-if="banners.length" class="banner-wrap">
      <van-swipe :autoplay="4000" indicator-color="#fff" :show-indicators="banners.length > 1">
        <van-swipe-item v-for="(b, idx) in banners" :key="idx">
          <button type="button" class="banner-card" @click="onBannerClick(b)">
            <img v-if="b.image && isSafeMediaUrl(b.image)" :src="b.image" class="banner-img" alt="" />
            <div class="banner-mask">
              <span class="hot-pill">{{ t('home.hot') }}</span>
              <div class="banner-title">{{ bannerTitle(b) }}</div>
              <span class="banner-cta">{{ t('home.orderNow') }}</span>
            </div>
          </button>
        </van-swipe-item>
      </van-swipe>
    </section>
    <section v-else class="banner-wrap">
      <button type="button" class="banner-card banner-fallback" @click="goShop">
        <div class="banner-mask">
          <span class="hot-pill">{{ t('home.hot') }}</span>
          <div class="banner-title">{{ t('home.bannerDefault') }}</div>
          <span class="banner-cta">{{ t('home.orderNow') }}</span>
        </div>
      </button>
    </section>

    <section v-if="newDishes.length" class="new-section">
      <div class="section-head">
        <h2 class="section-title">{{ t('home.newDishes') }}</h2>
        <button type="button" class="see-all" @click="goSearch">
          {{ t('home.seeAll') }}
          <van-icon name="arrow" size="12" />
        </button>
      </div>
      <div class="dish-scroll">
        <div
          v-for="d in newDishes"
          :key="d.id"
          class="dish-card"
          :class="{ unavailable: isNewDishUnavailable(d) || !storeOpen }"
        >
          <div class="dish-cover" :style="d.image ? { backgroundImage: `url(${d.image})` } : undefined">
            <span class="new-badge">{{ t('home.newBadge') }}</span>
            <span v-if="d.stock !== null && d.stock !== undefined && d.stock <= 0" class="cover-sold">
              {{ t('shop.soldOut') }}
            </span>
            <span v-else-if="d.status && d.status !== 'on'" class="cover-sold">
              {{ t('shop.offShelf') }}
            </span>
          </div>
          <div class="dish-meta">
            <div class="dish-name">{{ dishName(d) }}</div>
            <div v-if="d.options?.length" class="spec-hint">{{ t('shop.hasOptions') }}</div>
            <div class="dish-foot">
              <div class="dish-price">{{ formatVND(d.takeawayPrice || d.price) }}</div>
              <div class="dish-actions">
                <div v-if="storeOpen && !isNewDishUnavailable(d)" class="qty-ctrl">
                  <button
                    v-if="cart.getQty(d.id) > 0"
                    type="button"
                    class="qty-btn qty-minus"
                    @click.stop="removeNewDish(d)"
                  >
                    <van-icon name="minus" size="12" />
                  </button>
                  <span v-if="cart.getQty(d.id) > 0" class="qty-num">{{ cart.getQty(d.id) }}</span>
                  <button type="button" class="qty-btn qty-plus" @click.stop="addNewDish(d)">
                    <van-icon name="plus" size="14" />
                  </button>
                </div>
                <span v-else-if="d.stock !== null && d.stock !== undefined && d.stock <= 0" class="mini-sold">
                  {{ t('shop.soldOut') }}
                </span>
                <span v-else-if="d.status && d.status !== 'on'" class="mini-sold">
                  {{ t('shop.offShelf') }}
                </span>
                <span v-else class="mini-sold">{{ t('shop.resting') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <van-popup v-model:show="optVisible" position="bottom" round teleport="body" :style="{ maxHeight: '85%' }">
      <div v-if="optDish" class="opt">
        <div class="opt-head">
          <img v-if="optDish.image" :src="optDish.image" class="opt-img" alt="" />
          <div class="opt-head-text">
            <h3>{{ dishName(optDish) }}</h3>
            <div class="opt-price">{{ formatVND(optUnitPrice) }}</div>
            <div
              v-if="
                (loc === 'vi' ? optDish.descVi : optDish.descZh) &&
                (loc === 'vi' ? optDish.descVi : optDish.descZh) !== dishName(optDish)
              "
              class="opt-desc"
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

    <button type="button" class="member-banner" @click="openJoin">
      <span class="member-crown" aria-hidden="true">
        <van-icon name="diamond-o" size="22" />
      </span>
      <span class="member-copy">
        <strong>{{ t('home.memberTitle') }}</strong>
        <em>{{ membership?.joined && membership.memberLevel ? levelName(membership.memberLevel) : t('home.memberSub') }}</em>
      </span>
      <span class="member-cta">{{ membership?.joined ? t('home.joined') : t('home.joinNow') }}</span>
    </button>

    <van-popup
      v-model:show="showJoin"
      position="bottom"
      round
      close-on-click-overlay
      teleport="body"
      :style="{ height: 'min(88vh, 720px)' }"
      class="sheet-popup"
    >
      <div class="join-sheet">
        <div class="join-sheet-head">
          <h3>{{ t('home.joinTitle') }}</h3>
          <button type="button" class="notice-close" @click="showJoin = false">
            <van-icon name="cross" size="16" />
          </button>
        </div>
        <div class="join-sheet-scroll">
          <p class="join-lead">{{ t('home.joinLead') }}</p>
          <article v-for="lv in joinLevels" :key="lv.id" class="join-level">
            <strong>{{ levelName(lv) }}</strong>
            <ul>
              <li v-if="lv.minSpend > 0">{{ t('home.benefitSpend', { amount: formatVND(lv.minSpend) }) }}</li>
              <li v-if="lv.discountPercent">{{ t('home.benefitDiscount', { n: lv.discountPercent }) }}</li>
              <li v-if="lv.deliveryFeeOff">{{ t('home.benefitFee', { amount: formatVND(lv.deliveryFeeOff) }) }}</li>
              <li v-if="lv.priorityReserve">{{ t('home.benefitReserve') }}</li>
              <li v-if="lv.priorityDelivery">{{ t('home.benefitDelivery') }}</li>
              <li v-if="lv.birthdayGift">{{ t('home.benefitBirthday') }}</li>
              <li v-if="lv.birthdayBonusPoints">{{ t('home.benefitPoints', { n: lv.birthdayBonusPoints }) }}</li>
            </ul>
          </article>
        </div>
        <div v-if="!membership?.joined" class="join-sheet-footer">
          <label class="join-date">
            <span>{{ t('home.birthday') }}</span>
            <input v-model="joinBirthday" type="date" />
          </label>
          <label class="join-agree">
            <input v-model="joinAgree" type="checkbox" />
            <span>{{ t('home.agree') }}</span>
          </label>
          <button type="button" class="join-submit" :disabled="joining" @click="submitJoin">
            {{ t('home.joinSubmit') }}
          </button>
        </div>
      </div>
    </van-popup>

    <van-popup
      v-model:show="showNotices"
      position="bottom"
      round
      teleport="body"
      :style="{ height: 'min(80vh, 640px)' }"
      class="notice-sheet sheet-popup"
    >
      <div class="notice-popup">
        <div class="notice-handle" aria-hidden="true" />
        <div class="notice-head">
          <div class="notice-head-left">
            <span class="notice-head-icon">
              <van-icon name="volume-o" size="18" />
            </span>
            <div>
              <h3>{{ t('home.notices') }}</h3>
              <p class="notice-sub">{{ t('home.noticesSub', { n: notices.length + personalMessages.length }) }}</p>
            </div>
          </div>
          <button type="button" class="notice-close" @click="showNotices = false">
            <van-icon name="cross" size="16" />
          </button>
        </div>

        <div class="notice-scroll">
        <div v-if="!notices.length && !personalMessages.length" class="empty">
          <van-icon name="notes-o" size="36" color="#c8c9cc" />
          <p>{{ t('home.noNotices') }}</p>
        </div>

        <div v-if="personalMessages.length" class="notice-list">
          <p class="notice-group">{{ t('home.mineNotices') }}</p>
          <button
            v-for="m in personalMessages"
            :key="m.id"
            type="button"
            class="notice-item personal"
            @click="goChat"
          >
            <div class="n-icon-wrap">
              <van-icon :name="personalKind(m.content) === 'birthday' ? 'gift-o' : 'coupon-o'" size="18" />
            </div>
            <div class="n-main">
              <div class="n-top">
                <h4 class="n-title">
                  {{
                    personalKind(m.content) === 'birthday'
                      ? t('home.birthdayNotice')
                      : personalKind(m.content) === 'coupon'
                        ? t('home.couponNotice')
                        : t('home.mineNotices')
                  }}
                </h4>
                <span class="n-badge">{{ t('home.mineNotices') }}</span>
              </div>
              <p class="n-body">{{ m.content }}</p>
            </div>
          </button>
        </div>

        <div v-if="notices.length" class="notice-list">
          <article
            v-for="n in notices"
            :key="n.id"
            class="notice-item"
            :class="`level-${n.level || 'info'}`"
          >
            <div class="n-icon-wrap">
              <van-icon :name="noticeIcon(n.level)" size="18" />
            </div>
            <div class="n-main">
              <div class="n-top">
                <h4 class="n-title">
                  {{ localeField(n as unknown as Record<string, unknown>, 'title', loc) }}
                </h4>
                <span class="n-badge">{{ noticeLevelLabel(n.level) }}</span>
              </div>
              <p class="n-body">
                {{ localeField(n as unknown as Record<string, unknown>, 'content', loc) }}
              </p>
            </div>
          </article>
        </div>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.home-app {
  padding: 14px 16px 28px;
  box-sizing: border-box;
  background:
    radial-gradient(120% 80% at 100% -10%, #d9fbe8 0%, transparent 46%),
    radial-gradient(90% 50% at 0% 0%, #fff4e8 0%, transparent 42%),
    #f6f7f9;
  font-family: "Avenir Next", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif;
}
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}
.store-pin {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  color: #1c1917;
}
.pin-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #ecfdf3;
  color: #16a34a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.store-name {
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pin-chevron {
  color: #78716c;
  flex-shrink: 0;
}
.home-open-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  flex-shrink: 0;
}
.home-open-tag.is-open {
  color: #15803d;
  background: #dcfce7;
}
.home-open-tag.is-closed {
  color: #78716c;
  background: #f5f5f4;
}
.home-closed-banner {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff7e8;
  color: #c2410c;
  font-size: 13px;
  line-height: 1.4;
}
.entry.disabled {
  opacity: 0.45;
  pointer-events: none;
}
.inbox-strip.disabled {
  opacity: 0.55;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.icon-btn {
  position: relative;
  border: none;
  background: #fff;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #292524;
  box-shadow: 0 6px 16px rgba(28, 25, 23, 0.06);
}
.avatar-btn {
  background: #fff7ed;
  color: #ea580c;
  overflow: hidden;
  padding: 0;
}
.avatar-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.icon-btn .dot {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 2px #fff;
}
.lang-mini {
  border: 0;
  background: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 8px 9px;
  border-radius: 999px;
  color: #44403c;
  box-shadow: 0 6px 16px rgba(28, 25, 23, 0.06);
}
.hero {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.hero-text {
  flex: 1;
  min-width: 0;
}
.hero-text h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 800;
  color: #1c1917;
  letter-spacing: -0.03em;
}
.wave {
  font-size: 24px;
}
.hero-text p {
  margin: 6px 0 0;
  font-size: 14px;
  color: #78716c;
}
.hero-media {
  width: 112px;
  height: 92px;
  border-radius: 28px 28px 18px 28px;
  overflow: hidden;
  flex-shrink: 0;
  background: linear-gradient(160deg, #fff, #dcfce7);
  display: flex;
  align-items: center;
  justify-content: center;
}
.hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.search-bar {
  width: 100%;
  height: 48px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(28, 25, 23, 0.06);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  color: #a8a29e;
  font-size: 14px;
  margin-bottom: 16px;
}
.inbox-strip {
  width: 100%;
  margin: 0 0 12px;
  border: 0;
  border-radius: 12px;
  background: #fff7ed;
  color: #9a3412;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  text-align: left;
  font-size: 13px;
  line-height: 1.4;
}
.inbox-strip span {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.notice-bar {
  margin: -8px 0 12px;
  border-radius: 10px;
}
.entry-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 18px;
}
.entry {
  border: 0;
  background: transparent;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.entry:active .entry-icon {
  transform: scale(0.96);
}
.entry-icon {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 8px 16px rgba(28, 25, 23, 0.08);
}
.c-orange { background: linear-gradient(160deg, #ffb067, #ff7a1a); }
.c-green { background: linear-gradient(160deg, #6ee7a8, #22c55e); }
.c-purple { background: linear-gradient(160deg, #c4b5fd, #8b5cf6); }
.c-blue { background: linear-gradient(160deg, #7dd3fc, #38bdf8); }
.entry-label {
  font-size: 12px;
  font-weight: 650;
  color: #292524;
  text-align: center;
  line-height: 1.25;
}
.entry-sub {
  display: flex;
  justify-content: flex-end;
  margin: -10px 4px 14px;
}
.entry-sub-link {
  border: 0;
  background: transparent;
  color: #ea580c;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
}
.banner-wrap {
  margin-bottom: 18px;
  border-radius: 22px;
  overflow: hidden;
}
.banner-card {
  position: relative;
  width: 100%;
  height: 148px;
  border: none;
  padding: 0;
  display: block;
  overflow: hidden;
  background: #1c1917;
}
.banner-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.banner-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 8px;
  padding: 16px 18px;
  background: linear-gradient(90deg, rgba(18, 14, 10, 0.72) 0%, rgba(18, 14, 10, 0.15) 72%);
  text-align: left;
  color: #fff;
}
.banner-fallback {
  background:
    linear-gradient(120deg, #1c1917 0%, #44403c 55%, #ea580c 140%);
}
.hot-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #ff6a00;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.banner-title {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
  max-width: 78%;
  letter-spacing: -0.02em;
}
.banner-cta {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: #fff;
  color: #1c1917;
  font-size: 12px;
  font-weight: 700;
}
.new-section {
  margin-bottom: 16px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #1c1917;
  letter-spacing: -0.02em;
}
.see-all {
  border: 0;
  background: transparent;
  color: #78716c;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
}
.dish-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  /* 给卡片阴影与加号留出边距，避免横向滚动容器裁切 */
  padding: 4px 4px 12px;
  -webkit-overflow-scrolling: touch;
}
.dish-card {
  flex: 0 0 160px;
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(28, 25, 23, 0.06);
}
.dish-card.unavailable .dish-name,
.dish-card.unavailable .dish-price {
  color: #a8a29e;
}
.dish-card.unavailable .dish-cover {
  filter: grayscale(0.65);
  opacity: 0.75;
}
.dish-cover {
  position: relative;
  height: 108px;
  background: #f5f5f4 center/cover no-repeat;
}
.cover-sold {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  z-index: 1;
}
.new-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(28, 25, 23, 0.72);
  color: #fff;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 999px;
}
.dish-meta {
  /* 右侧多留一点，避免 +/- 贴边被 overflow 裁成半圆 */
  padding: 10px 12px 12px;
  box-sizing: border-box;
}
.dish-name {
  font-size: 14px;
  font-weight: 700;
  color: #1c1917;
  line-height: 1.3;
  min-height: 36px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.spec-hint {
  margin-top: 4px;
  font-size: 11px;
  color: #ff6a00;
  font-weight: 600;
}
.dish-foot {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  /* 价格与加减分行，避免加号被卡片 overflow 裁掉一半 */
  flex-wrap: wrap;
}
.dish-price {
  font-size: 14px;
  color: #ea580c;
  font-weight: 800;
  min-width: 0;
  flex: 1 1 auto;
  line-height: 1.2;
}
.dish-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 28px;
  flex: 0 0 auto;
  margin-left: auto;
}
.mini-sold {
  font-size: 11px;
  color: #a8a29e;
}
.qty-ctrl {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.qty-num {
  min-width: 14px;
  text-align: center;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  color: #292524;
}
.qty-btn {
  box-sizing: border-box;
  width: 26px;
  height: 26px;
  min-width: 26px;
  min-height: 26px;
  border: none;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.qty-plus {
  background: #ff6a00;
  color: #fff;
  box-shadow: 0 2px 6px rgba(255, 106, 0, 0.28);
}
.qty-minus {
  border: 1px solid #ebedf0;
  background: #fff;
  color: #646566;
}
.member-banner {
  width: 100%;
  border: 0;
  border-radius: 20px;
  padding: 14px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  background: linear-gradient(100deg, #ecfdf3 0%, #f0fdf4 55%, #fff7ed 100%);
  box-shadow: 0 8px 20px rgba(22, 163, 74, 0.08);
}
.member-crown {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: #dcfce7;
  color: #16a34a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.member-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.member-copy strong {
  font-size: 15px;
  color: #14532d;
}
.member-copy em {
  font-style: normal;
  font-size: 12px;
  color: #4d7c0f;
  line-height: 1.35;
}
.member-cta {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: #1c1917;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
}
.join-sheet {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  box-sizing: border-box;
}
.join-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 0;
  flex-shrink: 0;
}
.join-sheet-head h3 {
  margin: 0;
  font-size: 18px;
}
.join-sheet-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px 16px 12px;
}
.join-sheet-footer {
  flex-shrink: 0;
  padding: 8px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid #f0f0f0;
  background: #fff;
}
.join-sheet h3 {
  margin: 0;
  font-size: 18px;
}
.join-lead {
  margin: 0 0 12px;
  color: #78716c;
  font-size: 13px;
  line-height: 1.45;
}
.join-level {
  background: #f6f7f9;
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 10px;
}
.join-level ul {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #44403c;
  font-size: 13px;
  line-height: 1.5;
}
.join-date,
.join-agree {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 14px;
}
.join-date input {
  flex: 1;
  height: 36px;
  border: 1px solid #e7e5e4;
  border-radius: 10px;
  padding: 0 8px;
}
.join-submit {
  width: 100%;
  margin-top: 14px;
  height: 44px;
  border: 0;
  border-radius: 999px;
  background: #ff6a00;
  color: #fff;
  font-weight: 700;
}
.notice-popup {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 8px 0 0;
  box-sizing: border-box;
  background: linear-gradient(180deg, #fff8f2 0%, #fff 56px);
}
.notice-popup .notice-head {
  padding: 0 16px;
  flex-shrink: 0;
}
.notice-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 16px calc(20px + env(safe-area-inset-bottom, 0px));
}
.notice-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #e5e6eb;
  margin: 4px auto 14px;
}
.notice-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.notice-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.notice-head-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #fff1e6;
  color: #ff6a00;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.notice-popup h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #1f2329;
  line-height: 1.2;
}
.notice-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: #969799;
}
.notice-close {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: #f2f3f5;
  color: #646566;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  cursor: pointer;
}
.notice-group {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: #ea580c;
}
.notice-item.personal {
  width: 100%;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.notice-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(52vh, 420px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}
.notice-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  border: 1px solid #f0f1f2;
  box-shadow: 0 4px 14px rgba(31, 35, 41, 0.04);
}
.n-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #fff1e6;
  color: #ff6a00;
}
.notice-item.level-warn .n-icon-wrap {
  background: #fff7e8;
  color: #ed6a0c;
}
.notice-item.level-important .n-icon-wrap {
  background: #ffecec;
  color: #ee0a24;
}
.notice-item.level-warn {
  border-color: #ffe2b8;
  background: linear-gradient(180deg, #fffaf0 0%, #fff 70%);
}
.notice-item.level-important {
  border-color: #ffd0d0;
  background: linear-gradient(180deg, #fff5f5 0%, #fff 70%);
}
.n-main {
  flex: 1;
  min-width: 0;
}
.n-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.n-title {
  margin: 0;
  font-weight: 650;
  font-size: 14px;
  color: #323233;
  line-height: 1.35;
}
.n-badge {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 4px 7px;
  border-radius: 999px;
  background: #fff1e6;
  color: #ff6a00;
  font-weight: 600;
}
.notice-item.level-warn .n-badge {
  background: #fff7e8;
  color: #ed6a0c;
}
.notice-item.level-important .n-badge {
  background: #ffecec;
  color: #ee0a24;
}
.n-body {
  margin: 0;
  font-size: 13px;
  color: #646566;
  white-space: pre-wrap;
  line-height: 1.55;
}
.empty {
  color: #969799;
  font-size: 13px;
  text-align: center;
  padding: 36px 0 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty p {
  margin: 0;
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
