<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { formatVND, localeField } from '@restaurant/shared';
import {
  getHomeFeedApi,
  type HomeBanner,
  type HomeNewDish,
  type HomeNotice,
  type HomeStore,
} from '../api/home';
import { useCartStore } from '../stores/cart';
import { useCustomerStore } from '../stores/customer';
import { getCustomerToken } from '../utils/customer-storage';

const { t, locale } = useI18n();
const router = useRouter();
const cart = useCartStore();
const customer = useCustomerStore();

const store = ref<HomeStore | null>(null);
const banners = ref<HomeBanner[]>([]);
const notices = ref<HomeNotice[]>([]);
const newDishes = ref<HomeNewDish[]>([]);
const showNotices = ref(false);

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

const heroImage = computed(() => {
  const withImg = newDishes.value.find((d) => d.image);
  if (withImg?.image) return withImg.image;
  if (banners.value[0]?.image) return banners.value[0].image;
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

function goReserve() {
  router.push({ name: 'reserve' });
}

function goShop() {
  router.push({ name: 'shop' });
}

function goGroupMeal() {
  router.push({ name: 'group-meal' });
}

function goCoupons() {
  router.push({ name: 'shop-coupons' });
}

function goMine() {
  if (customer.isLoggedIn() || getCustomerToken()) {
    router.push({ name: 'shop-me' });
  } else {
    router.push({ name: 'shop-login', query: { redirect: '/shop/me' } });
  }
}

function onBannerClick(b: HomeBanner) {
  if (!b.link) {
    goShop();
    return;
  }
  if (b.link.startsWith('http')) {
    window.open(b.link, '_blank');
  } else {
    router.push(b.link);
  }
}

function addNewDish(d: HomeNewDish) {
  if (d.status && d.status !== 'on') {
    showToast(t('errors.DISH_NOT_AVAILABLE'));
    return;
  }
  if (d.stock !== null && d.stock !== undefined && d.stock <= 0) {
    showToast(t('errors.DISH_SOLD_OUT'));
    return;
  }
  cart.add({
    dishId: String(d.id),
    nameZh: d.nameZh,
    nameVi: d.nameVi,
    price: Number(d.takeawayPrice ?? d.price),
  });
  showToast(t('home.addedCart'));
}

async function loadHome() {
  try {
    const data = await getHomeFeedApi('1');
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

onMounted(loadHome);
</script>

<template>
  <div class="home-app">
    <header class="top-bar">
      <div class="store-pin">
        <van-icon name="location-o" color="#ff6a00" />
        <span class="store-name">{{ storeName }}</span>
      </div>
      <div class="top-actions">
        <button type="button" class="icon-btn" @click="showNotices = true">
          <van-icon name="bell" size="20" />
          <i v-if="notices.length" class="dot" />
        </button>
        <button type="button" class="lang-mini" @click="switchLocale">
          {{ locale === 'zh-CN' ? 'VI' : '中' }}
        </button>
        <button type="button" class="icon-btn" @click="goMine">
          <van-icon name="user-o" size="20" />
        </button>
      </div>
    </header>

    <section class="hero">
      <div class="hero-text">
        <h1>{{ t('home.title') }}</h1>
        <p>{{ t('home.subtitle') }}</p>
      </div>
      <div class="hero-media" :class="{ empty: !heroImage }">
        <img v-if="heroImage" :src="heroImage" alt="" />
        <van-icon v-else name="shop-o" size="48" color="#ffb380" />
      </div>
    </section>

    <van-notice-bar
      v-if="noticeText"
      class="notice-bar"
      left-icon="volume-o"
      background="#fff7f0"
      color="#c2410c"
      scrollable
      :text="noticeText"
      @click="showNotices = true"
    />

    <section class="grid-4">
      <button type="button" class="grid-item c-orange" @click="goReserve">
        <van-icon name="calendar-o" size="28" />
        <span class="g-title">{{ t('home.reserve.title') }}</span>
        <span class="g-desc">{{ t('home.reserve.desc') }}</span>
      </button>
      <button type="button" class="grid-item c-blue" @click="goShop">
        <van-icon name="logistics" size="28" />
        <span class="g-title">{{ t('home.delivery.title') }}</span>
        <span class="g-desc">{{ t('home.delivery.desc') }}</span>
      </button>
      <button type="button" class="grid-item c-green" @click="goGroupMeal">
        <van-icon name="friends-o" size="28" />
        <span class="g-title">{{ t('home.group.title') }}</span>
        <span class="g-desc">{{ t('home.group.desc') }}</span>
      </button>
      <button type="button" class="grid-item c-purple" @click="goCoupons">
        <van-icon name="coupon-o" size="28" />
        <span class="g-title">{{ t('home.coupon.title') }}</span>
        <span class="g-desc">{{ t('home.coupon.desc') }}</span>
      </button>
    </section>

    <section v-if="banners.length" class="banner-wrap">
      <van-swipe :autoplay="4000" indicator-color="#ff6a00">
        <van-swipe-item v-for="(b, idx) in banners" :key="idx">
          <button type="button" class="banner-card" @click="onBannerClick(b)">
            <img v-if="b.image" :src="b.image" class="banner-img" alt="" />
            <div class="banner-mask">
              <div class="banner-title">{{ bannerTitle(b) }}</div>
            </div>
          </button>
        </van-swipe-item>
      </van-swipe>
    </section>
    <section v-else class="banner-wrap">
      <button type="button" class="banner-card banner-fallback" @click="goShop">
        <div class="banner-mask">
          <div class="banner-title">{{ t('home.bannerDefault') }}</div>
          <div class="banner-sub">{{ t('home.bannerDefaultSub') }}</div>
        </div>
      </button>
    </section>

    <section v-if="newDishes.length" class="new-section">
      <h2 class="section-title">{{ t('home.newDishes') }}</h2>
      <div class="dish-scroll">
        <div v-for="d in newDishes" :key="d.id" class="dish-card">
          <div class="dish-cover" :style="d.image ? { backgroundImage: `url(${d.image})` } : undefined">
            <span class="new-badge">{{ t('home.newBadge') }}</span>
          </div>
          <div class="dish-meta">
            <div class="dish-name">{{ dishName(d) }}</div>
            <div class="dish-row">
              <span class="dish-price">{{ formatVND(d.takeawayPrice || d.price) }}</span>
              <button type="button" class="add-btn" @click="addNewDish(d)">
                <van-icon name="plus" size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <van-popup v-model:show="showNotices" position="bottom" round :style="{ maxHeight: '60%' }">
      <div class="notice-popup">
        <h3>{{ t('home.notices') }}</h3>
        <div v-if="!notices.length" class="empty">{{ t('home.noNotices') }}</div>
        <div v-for="n in notices" :key="n.id" class="notice-item" :class="`level-${n.level}`">
          <div class="n-title">
            {{ localeField(n as unknown as Record<string, unknown>, 'title', loc) }}
          </div>
          <div class="n-body">
            {{ localeField(n as unknown as Record<string, unknown>, 'content', loc) }}
          </div>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.home-app {
  padding: 12px 16px 24px;
  background: linear-gradient(180deg, #fff 0%, #f7f8fa 120px);
  box-sizing: border-box;
}
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.store-pin {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.store-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background: #f3f4f6;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #374151;
}
.icon-btn .dot {
  position: absolute;
  top: 6px;
  right: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
}
.lang-mini {
  border: none;
  background: #fff;
  border: 1px solid #e5e7eb;
  font-size: 11px;
  padding: 6px 8px;
  border-radius: 999px;
  color: #4b5563;
}
.hero {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.hero-text {
  flex: 1;
  min-width: 0;
}
.hero-text h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: #1e3a5f;
  letter-spacing: 0.02em;
}
.hero-text p {
  margin: 8px 0 0;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.45;
}
.hero-media {
  width: 108px;
  height: 108px;
  border-radius: 20px;
  overflow: hidden;
  flex-shrink: 0;
  background: #fff7f0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 20px rgba(255, 106, 0, 0.12);
}
.hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.notice-bar {
  margin-bottom: 14px;
  border-radius: 10px;
  overflow: hidden;
}
.grid-4 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}
.grid-item {
  border: none;
  border-radius: 16px;
  padding: 16px 14px;
  text-align: left;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-height: 96px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}
.grid-item:active {
  transform: scale(0.98);
}
.c-orange {
  background: linear-gradient(135deg, #ff9a4d, #ff6a00);
}
.c-blue {
  background: linear-gradient(135deg, #60a5fa, #2563eb);
}
.c-green {
  background: linear-gradient(135deg, #4ade80, #16a34a);
}
.c-purple {
  background: linear-gradient(135deg, #c084fc, #7c3aed);
}
.g-title {
  font-size: 15px;
  font-weight: 700;
  margin-top: 4px;
}
.g-desc {
  font-size: 11px;
  opacity: 0.92;
  line-height: 1.3;
}
.banner-wrap {
  margin-bottom: 16px;
  border-radius: 14px;
  overflow: hidden;
}
.banner-card {
  position: relative;
  width: 100%;
  height: 120px;
  border: none;
  padding: 0;
  display: block;
  overflow: hidden;
  background: linear-gradient(135deg, #ff8a3d, #ff6a00);
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
  justify-content: center;
  padding: 16px 18px;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.45), transparent 70%);
  text-align: left;
  color: #fff;
}
.banner-fallback .banner-mask {
  background: transparent;
}
.banner-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  max-width: 70%;
}
.banner-sub {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.9;
}
.new-section {
  margin-top: 4px;
}
.section-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
}
.dish-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}
.dish-card {
  flex: 0 0 140px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}
.dish-cover {
  position: relative;
  height: 100px;
  background: #f3f4f6 center/cover no-repeat;
}
.new-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: #ff6a00;
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}
.dish-meta {
  padding: 8px 10px 10px;
}
.dish-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 34px;
}
.dish-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dish-price {
  font-size: 13px;
  color: #ff6a00;
  font-weight: 700;
}
.add-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: #ff6a00;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.notice-popup {
  padding: 16px 16px 28px;
}
.notice-popup h3 {
  margin: 0 0 12px;
  font-size: 16px;
}
.notice-item {
  background: #f9fafb;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
  border-left: 3px solid #ff8a3d;
}
.notice-item.level-warn {
  background: #fffbeb;
  border-left-color: #f59e0b;
}
.notice-item.level-important {
  background: #fef2f2;
  border-left-color: #ef4444;
}
.n-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}
.n-body {
  font-size: 13px;
  color: #4b5563;
  white-space: pre-wrap;
  line-height: 1.45;
}
.empty {
  color: #9ca3af;
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}
</style>
