<script setup lang="ts">
import { computed, onMounted, ref, watch, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  Bell,
  Box,
  DataAnalysis,
  Dish,
  Expand,
  Fold,
  Grid,
  HomeFilled,
  List,
  Microphone,
  Mute,
  Present,
  Printer,
  Setting,
  ShoppingCart,
  SwitchButton,
  Ticket,
  User,
  Van,
  Calendar,
  Food,
} from '@element-plus/icons-vue';
import { localeField } from '@restaurant/shared';
import { updateProfileApi } from '../api/auth';
import { stopVoiceAlertGlobal, useVoiceAlert } from '../composables/useVoiceAlert';
import { useBrandStore } from '../stores/brand';
import { useOpsAlertStore } from '../stores/ops-alert';
import { useUserStore } from '../stores/user';
import { setElementLocale } from '../i18n';
import type { MenuNode } from '../api/auth';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const brandStore = useBrandStore();
const opsAlert = useOpsAlertStore();
const collapsed = ref(false);
const { unlocked, muted, unlockVoice, setVoiceMuted, start: startVoice } = useVoiceAlert();

/** 菜单角标（扫码/预定/外卖/消息/团购） */
function menuBadge(path?: string | null) {
  return opsAlert.badgeForPath(path);
}

type TabItem = { path: string; titleZh: string; titleVi: string; affix?: boolean };
const tabs = ref<TabItem[]>([
  { path: '/dashboard', titleZh: '工作台', titleVi: 'Tổng quan', affix: true },
]);

const menuLocale = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const brandTitle = computed(() => {
  const name = localeField(
    { nameZh: brandStore.nameZh, nameVi: brandStore.nameVi },
    'name',
    menuLocale.value,
  );
  return (typeof name === 'string' ? name.trim() : '') || t('app.title');
});

const MENU_ICONS: Record<string, Component> = {
  '/dashboard': HomeFilled,
  '/cashier': Present,
  '/menu': Dish,
  '/combos': Food,
  '/tables': Grid,
  '/reservations': Calendar,
  '/group-meals': Food,
  '/orders': List,
  '/members': User,
  '/marketing': Ticket,
  '/delivery': Van,
  '/print': Printer,
  '/assets': Box,
  '/inventory': ShoppingCart,
  '/reports': DataAnalysis,
  '/system': Setting,
  '/system/users': User,
  '/system/roles': User,
  '/system/settings': Setting,
};

function menuIcon(pathOrCode?: string | null) {
  if (!pathOrCode) return List;
  return MENU_ICONS[pathOrCode] || List;
}

function menuTitle(node: MenuNode) {
  return localeField(node as unknown as Record<string, unknown>, 'name', menuLocale.value);
}

function tabTitle(tab: TabItem) {
  return menuLocale.value === 'vi' ? tab.titleVi : tab.titleZh;
}

watch(
  () => route.fullPath,
  () => {
    if (!route.path || route.path === '/login') return;
    const exists = tabs.value.find((x) => x.path === route.path);
    if (!exists) {
      tabs.value.push({
        path: route.path,
        titleZh: String(route.meta.titleZh || route.name || route.path),
        titleVi: String(route.meta.titleVi || route.meta.titleZh || route.path),
      });
    }
  },
  { immediate: true },
);

async function onLocaleChange(val: string) {
  locale.value = val;
  localStorage.setItem('locale', val);
  setElementLocale(val);
  const lang = val === 'vi-VN' ? 'vi' : 'zh';
  try {
    await updateProfileApi({ lang });
    if (userStore.profile) userStore.profile.lang = lang;
  } catch {
    // ignore
  }
}

async function onLogout() {
  stopVoiceAlertGlobal();
  opsAlert.stop();
  await userStore.logout();
  router.replace('/login');
}

function removeTab(path: string) {
  const idx = tabs.value.findIndex((t) => t.path === path);
  if (idx < 0 || tabs.value[idx].affix) return;
  tabs.value.splice(idx, 1);
  if (route.path === path) {
    const next = tabs.value[Math.max(0, idx - 1)];
    router.push(next?.path || '/dashboard');
  }
}

onMounted(() => {
  void startVoice();
  void brandStore.fetchBrand();
});
</script>

<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="aside">
      <div class="brand" :class="{ collapsed }" :title="brandTitle">
        <span class="brand-mark">
          <img
            v-if="brandStore.adminLogo"
            :src="brandStore.adminLogo"
            alt=""
            class="brand-logo"
          />
          <template v-else>{{ brandStore.markChar }}</template>
        </span>
        <span v-if="!collapsed" class="brand-text">{{ brandTitle }}</span>
      </div>
      <div class="aside-scroll">
        <el-menu
          :default-active="route.path"
          :collapse="collapsed"
          router
          class="mt-menu"
          background-color="#ffffff"
          text-color="#333333"
          active-text-color="#191919"
        >
          <el-menu-item index="/dashboard">
            <el-icon><HomeFilled /></el-icon>
            <span>{{ t('menu.dashboard') }}</span>
          </el-menu-item>
          <template v-for="item in userStore.menus" :key="item.id">
            <el-sub-menu v-if="item.children?.length" :index="item.code">
              <template #title>
                <el-icon><component :is="menuIcon(item.path || item.code)" /></el-icon>
                <span>{{ menuTitle(item) }}</span>
              </template>
              <el-menu-item
                v-for="child in item.children"
                :key="child.id"
                :index="child.path || child.code"
              >
                <el-icon><component :is="menuIcon(child.path || child.code)" /></el-icon>
                <span>{{ menuTitle(child) }}</span>
                <span
                  v-if="menuBadge(child.path)"
                  class="aside-badge"
                >{{ menuBadge(child.path) > 99 ? '99+' : menuBadge(child.path) }}</span>
              </el-menu-item>
            </el-sub-menu>
            <el-menu-item v-else-if="item.path" :index="item.path">
              <el-icon><component :is="menuIcon(item.path)" /></el-icon>
              <span>{{ menuTitle(item) }}</span>
              <span
                v-if="menuBadge(item.path)"
                class="aside-badge"
              >{{ menuBadge(item.path) > 99 ? '99+' : menuBadge(item.path) }}</span>
            </el-menu-item>
          </template>
        </el-menu>
      </div>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="left">
          <el-icon class="toggle" @click="collapsed = !collapsed">
            <Fold v-if="!collapsed" />
            <Expand v-else />
          </el-icon>
          <span class="user-name">{{ userStore.profile?.displayName }}</span>
        </div>
        <div class="right">
          <el-button
            v-if="!unlocked"
            type="warning"
            size="small"
            :icon="Bell"
            @click="unlockVoice()"
          >
            {{ t('voice.unlock') }}
          </el-button>
          <el-button
            v-else
            text
            size="small"
            :icon="muted ? Mute : Microphone"
            @click="setVoiceMuted(!muted)"
          >
            {{ muted ? t('voice.unmute') : t('voice.mute') }}
          </el-button>
          <el-select
            :model-value="locale"
            style="width: 120px"
            size="small"
            @change="onLocaleChange"
          >
            <el-option label="中文" value="zh-CN" />
            <el-option label="Tiếng Việt" value="vi-VN" />
          </el-select>
          <el-button text :icon="SwitchButton" @click="onLogout">{{ t('auth.logout') }}</el-button>
        </div>
      </el-header>

      <div v-if="!unlocked" class="voice-banner">
        <span>{{ t('voice.unlockHint') }}</span>
        <el-button type="primary" size="small" @click="unlockVoice()">
          {{ t('voice.unlock') }}
        </el-button>
      </div>

      <div class="tags">
        <el-tag
          v-for="tab in tabs"
          :key="tab.path"
          :closable="!tab.affix"
          :effect="tab.path === route.path ? 'dark' : 'plain'"
          :type="tab.path === route.path ? 'warning' : 'info'"
          class="tag"
          @click="router.push(tab.path)"
          @close="removeTab(tab.path)"
        >
          {{ tabTitle(tab) }}
        </el-tag>
      </div>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}
.aside {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
  border-right: 1px solid var(--mt-border);
  transition: width 0.2s;
  overflow: hidden;
}
.brand {
  flex-shrink: 0;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 12px;
  background: var(--mt-yellow);
  font-weight: 800;
  color: var(--mt-black);
  z-index: 2;
  overflow: hidden;
}
.brand.collapsed {
  justify-content: center;
  padding: 0;
}
.brand-mark {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #191919;
  color: var(--mt-yellow);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  overflow: hidden;
}
.brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.brand-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.2;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.aside-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* 默认隐藏，悬停时显示 */
  scrollbar-width: none;
}
.aside-scroll:hover {
  scrollbar-width: thin;
  scrollbar-color: #d0d0d0 transparent;
}
.aside-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}
.aside-scroll:hover::-webkit-scrollbar {
  width: 4px;
}
.aside-scroll::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
}
.aside-scroll:hover::-webkit-scrollbar-thumb {
  background: #d0d0d0;
}
.aside-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.mt-menu {
  border-right: none;
}
.mt-menu :deep(.el-menu-item) {
  position: relative;
}
.aside-badge {
  position: absolute;
  top: 50%;
  right: 14px;
  transform: translateY(-50%);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  box-sizing: border-box;
  pointer-events: none;
}
.mt-menu :deep(.el-menu-item.is-active) {
  background: var(--mt-yellow-light) !important;
  color: var(--mt-black) !important;
}
.mt-menu :deep(.el-menu-item:hover),
.mt-menu :deep(.el-sub-menu__title:hover) {
  background: #fafafa !important;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--mt-border);
  background: #fff;
}
.left,
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.toggle {
  cursor: pointer;
  font-size: 18px;
}
.tags {
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid var(--mt-border);
}
.tag {
  margin-right: 8px;
  cursor: pointer;
}
.main {
  background: var(--mt-bg);
}
.user-name {
  color: var(--mt-gray);
  font-weight: 600;
}
.voice-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: var(--mt-yellow-light);
  color: #8a6d00;
  border-bottom: 1px solid #ffe08a;
  font-size: 13px;
}
</style>
