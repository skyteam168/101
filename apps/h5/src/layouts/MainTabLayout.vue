<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { io, type Socket } from 'socket.io-client';
import { Events } from '@restaurant/shared';
import { useCartStore } from '../stores/cart';
import { useInboxStore } from '../stores/inbox';
import { getCustomerToken } from '../utils/customer-storage';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const cart = useCartStore();
const inbox = useInboxStore();
let socket: Socket | null = null;

function connectInbox() {
  const token = getCustomerToken();
  if (!token) {
    socket?.disconnect();
    socket = null;
    inbox.clear();
    return;
  }
  if (socket?.connected) return;
  socket?.disconnect();
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
  });
  socket.on(Events.CHAT_MESSAGE, (payload: { message?: { content?: string } }) => {
    if (route.name === 'shop-chat') return;
    const content = payload?.message?.content;
    inbox.bump(typeof content === 'string' ? content : undefined);
  });
}

onMounted(() => {
  connectInbox();
  void inbox.refresh();
});

watch(
  () => route.fullPath,
  () => {
    connectInbox();
    if (route.name !== 'shop-chat') void inbox.refresh();
  },
);

onUnmounted(() => {
  socket?.disconnect();
  socket = null;
});

const active = computed({
  get() {
    const name = String(route.name || '');
    if (name === 'shop') return 'shop';
    if (name === 'shop-cart') return 'cart';
    if (name === 'shop-chat') return 'chat';
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
    if (name === 'chat') {
      if (getCustomerToken()) router.push({ name: 'shop-chat' });
      else router.push({ name: 'shop-login', query: { redirect: '/shop/chat' } });
      return;
    }
    if (name === 'mine') {
      if (getCustomerToken()) router.push({ name: 'shop-me' });
      else router.push({ name: 'shop-login', query: { redirect: '/shop/me' } });
    }
  },
});

/** 这些页自己管内部滚动，外层不再跟着滚 */
const innerScroll = computed(() =>
  ['shop', 'chat', 'cart', 'mine'].includes(active.value),
);
</script>

<template>
  <div class="main-tab-layout" :class="{ 'is-inner': innerScroll }">
    <div class="main-tab-content">
      <router-view />
    </div>
    <van-tabbar
      v-model="active"
      :fixed="false"
      :placeholder="false"
      :border="false"
      safe-area-inset-bottom
      active-color="#ff6a00"
    >
      <van-tabbar-item name="home" icon="home-o">{{ t('home.tab.home') }}</van-tabbar-item>
      <van-tabbar-item name="shop" icon="orders-o">{{ t('home.tab.menu') }}</van-tabbar-item>
      <van-tabbar-item name="chat" icon="chat-o" :badge="inbox.unread || undefined">
        {{ t('home.tab.chat') }}
      </van-tabbar-item>
      <van-tabbar-item name="cart" icon="shopping-cart-o" :badge="cart.totalQty || undefined">
        {{ t('home.tab.cart') }}
      </van-tabbar-item>
      <van-tabbar-item name="mine" icon="user-o">{{ t('home.tab.mine') }}</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.main-tab-layout {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f6f7f9;
}
.main-tab-layout :deep(.van-tabbar) {
  position: relative;
  flex-shrink: 0;
  box-shadow: 0 -8px 24px rgba(28, 25, 23, 0.06);
  background: #fff;
}
.main-tab-content {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.main-tab-layout.is-inner .main-tab-content {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.main-tab-layout.is-inner .main-tab-content > * {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
