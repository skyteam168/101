<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { formatVND, localeField } from '@restaurant/shared';
import { getDeliveryMenu, getStoreInfo, type MenuCategory, type StoreInfo } from '../../api/delivery';
import { useCartStore } from '../../stores/cart';
import { useCustomerStore } from '../../stores/customer';

const { t, locale } = useI18n();
const router = useRouter();
const cart = useCartStore();
const customer = useCustomerStore();

const store = ref<StoreInfo | null>(null);
const categories = ref<MenuCategory[]>([]);
const activeCat = ref(0);
const loading = ref(true);

// 语言切换
function switchLocale() {
  locale.value = locale.value === 'zh-CN' ? 'vi-VN' : 'zh-CN';
  localStorage.setItem('locale', locale.value);
}

// 语言字段帮助
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

function dishName(dish: MenuCategory['dishes'][0]) {
  return loc.value === 'vi' ? dish.nameVi || dish.nameZh : dish.nameZh || dish.nameVi;
}

function catName(cat: MenuCategory) {
  return loc.value === 'vi' ? cat.nameVi || cat.nameZh : cat.nameZh || cat.nameVi;
}

function storeName(s: StoreInfo) {
  return loc.value === 'vi' ? s.nameVi || s.nameZh : s.nameZh || s.nameVi;
}

// 加载数据
onMounted(async () => {
  try {
    const [storeData, menuData] = await Promise.all([getStoreInfo(), getDeliveryMenu()]);
    store.value = storeData;
    categories.value = menuData;
  } catch {
    showToast(t('errors.HTTP_ERROR'));
  } finally {
    loading.value = false;
  }
});

// 选分类
function selectCat(idx: number) {
  activeCat.value = idx;
}

// 当前分类的菜品列表
const currentDishes = computed(() => categories.value[activeCat.value]?.dishes ?? []);

// 加入购物车
function addToCart(dish: MenuCategory['dishes'][0]) {
  if (dish.status !== 'on') {
    showToast(t('errors.DISH_NOT_AVAILABLE'));
    return;
  }
  if (dish.stock !== null && dish.stock <= 0) {
    showToast(t('errors.DISH_SOLD_OUT'));
    return;
  }
  cart.add({
    dishId: String(dish.id),
    nameZh: dish.nameZh,
    nameVi: dish.nameVi,
    price: Number(dish.takeawayPrice ?? dish.price),
  });
}

function removeFromCart(dish: MenuCategory['dishes'][0]) {
  cart.remove(dish.id);
}

function goCheckout() {
  if (!customer.isLoggedIn()) {
    router.push({ name: 'shop-login', query: { redirect: '/shop/checkout' } });
    return;
  }
  if (cart.totalQty === 0) {
    showToast(t('errors.CART_EMPTY'));
    return;
  }
  router.push({ name: 'shop-checkout' });
}
</script>

<template>
  <div class="shop-home">
    <!-- 顶部导航 -->
    <van-nav-bar :title="store ? storeName(store) : t('shop.title')" fixed>
      <template #right>
        <div class="nav-actions">
          <span class="lang-btn" @click="switchLocale">{{ locale === 'zh-CN' ? 'VI' : '中' }}</span>
          <van-icon name="manager" size="22" @click="router.push({ name: customer.isLoggedIn() ? 'shop-me' : 'shop-login' })" />
        </div>
      </template>
    </van-nav-bar>

    <!-- 门店头图 / banner -->
    <div class="store-banner" style="padding-top: 46px">
      <div class="store-info" v-if="store">
        <div class="store-header">
          <van-icon name="shop-o" size="28" color="#ff6a00" />
          <div class="store-details">
            <div class="store-name">{{ storeName(store) }}</div>
            <div class="store-meta">
              <van-icon name="location-o" size="12" />
              {{ store.address }}
            </div>
            <div class="store-meta">
              <van-icon name="phone-o" size="12" />
              {{ store.phone }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 骨架屏 -->
    <div v-if="loading" style="padding: 16px">
      <van-skeleton title :row="8" />
    </div>

    <!-- 菜单区域 -->
    <div v-else class="menu-layout">
      <!-- 左侧分类 -->
      <van-sidebar v-model="activeCat" class="cat-sidebar">
        <van-sidebar-item
          v-for="(cat, idx) in categories"
          :key="cat.id"
          :title="catName(cat)"
          @click="selectCat(idx)"
        />
      </van-sidebar>

      <!-- 右侧菜品 -->
      <div class="dish-list">
        <div v-if="currentDishes.length === 0" class="empty-tip">
          <van-empty :description="t('shop.noDishes')" />
        </div>
        <div v-for="dish in currentDishes" :key="dish.id" class="dish-card">
          <img v-if="dish.image" :src="dish.image" class="dish-img" />
          <div v-else class="dish-img dish-img-placeholder">
            <van-icon name="photo-o" size="32" color="#ccc" />
          </div>
          <div class="dish-info">
            <div class="dish-name">{{ dishName(dish) }}</div>
            <div class="dish-desc" v-if="loc === 'vi' ? dish.descVi : dish.descZh">
              {{ loc === 'vi' ? dish.descVi : dish.descZh }}
            </div>
            <div class="dish-price-row">
              <span class="dish-price">{{ formatVND(dish.price) }}</span>
              <span v-if="dish.stock !== null && dish.stock <= 0" class="sold-out-tag">
                {{ t('shop.soldOut') }}
              </span>
              <span v-else-if="dish.status !== 'on'" class="sold-out-tag">
                {{ t('shop.offShelf') }}
              </span>
              <div v-else class="qty-ctrl">
                <van-button
                  v-if="cart.getQty(dish.id) > 0"
                  round
                  icon="minus"
                  size="mini"
                  type="default"
                  @click="removeFromCart(dish)"
                />
                <span v-if="cart.getQty(dish.id) > 0" class="qty-num">
                  {{ cart.getQty(dish.id) }}
                </span>
                <van-button
                  round
                  icon="plus"
                  size="mini"
                  type="danger"
                  @click="addToCart(dish)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部购物车栏 -->
    <div v-if="cart.totalQty > 0" class="cart-bar" @click="goCheckout">
      <div class="cart-bar-left">
        <div class="cart-icon-wrap">
          <van-icon name="shopping-cart-o" size="24" color="#fff" />
          <span class="cart-badge">{{ cart.totalQty }}</span>
        </div>
        <span class="cart-total">{{ formatVND(cart.totalAmount) }}</span>
      </div>
      <div class="cart-bar-right">
        {{ t('shop.goCheckout') }}
      </div>
    </div>

  </div>
</template>

<style scoped>
.shop-home {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 100px;
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
  background: #fff;
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
.store-name {
  font-size: 16px;
  font-weight: 700;
  color: #323233;
  margin-bottom: 4px;
}
.store-meta {
  font-size: 12px;
  color: #969799;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.menu-layout {
  display: flex;
  height: calc(100vh - 180px);
}
.cat-sidebar {
  width: 88px;
  overflow-y: auto;
  flex-shrink: 0;
  background: #f7f8fa;
}
.dish-list {
  flex: 1;
  overflow-y: auto;
  background: #fff;
  padding: 0 0 16px;
}
.dish-card {
  display: flex;
  padding: 12px;
  border-bottom: 1px solid #f7f8fa;
  gap: 10px;
}
.dish-img {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.dish-img-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f7f8fa;
}
.dish-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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
  gap: 6px;
}
.qty-num {
  font-size: 14px;
  font-weight: 700;
  min-width: 20px;
  text-align: center;
}
.cart-bar {
  position: fixed;
  bottom: 50px;
  left: 0;
  right: 0;
  height: 50px;
  background: #323233;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 100;
  cursor: pointer;
  border-radius: 25px;
  margin: 0 16px;
  bottom: 56px;
}
.cart-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cart-icon-wrap {
  position: relative;
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
}
.cart-total {
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}
.cart-bar-right {
  background: #ff6a00;
  color: #fff;
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
}
.empty-tip {
  padding-top: 40px;
}
</style>
