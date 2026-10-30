<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useCartStore } from '../stores/cart';
import { getCustomerToken } from '../utils/customer-storage';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const cart = useCartStore();

const active = computed({
  get() {
    const name = String(route.name || '');
    if (name === 'shop') return 'shop';
    if (name === 'shop-cart') return 'cart';
    if (name === 'shop-me') return 'mine';
    return 'home';
  },
  set(name: string) {
    if (name === 'home') {
      router.push({ name: 'home' });
      return;
    }
    if (name === 'shop') {
      router.push({ name: 'shop' });
      return;
    }
    if (name === 'cart') {
      router.push({ name: 'shop-cart' });
      return;
    }
    if (name === 'mine') {
      if (getCustomerToken()) router.push({ name: 'shop-me' });
      else router.push({ name: 'shop-login', query: { redirect: '/shop/me' } });
    }
  },
});
</script>

<template>
  <div class="main-tab-layout">
    <div class="main-tab-content">
      <router-view />
    </div>
    <van-tabbar v-model="active" :placeholder="true" safe-area-inset-bottom active-color="#ff6a00">
      <van-tabbar-item name="home" icon="home-o">{{ t('home.tab.home') }}</van-tabbar-item>
      <van-tabbar-item name="shop" icon="orders-o">{{ t('home.tab.menu') }}</van-tabbar-item>
      <van-tabbar-item name="cart" icon="shopping-cart-o" :badge="cart.totalQty || undefined">
        {{ t('home.tab.cart') }}
      </van-tabbar-item>
      <van-tabbar-item name="mine" icon="user-o">{{ t('home.tab.mine') }}</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.main-tab-layout {
  min-height: 100vh;
  background: #f7f8fa;
}
.main-tab-content {
  min-height: calc(100vh - 50px);
}
</style>
