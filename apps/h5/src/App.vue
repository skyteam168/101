<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getPublicStoreId } from './utils/store-id';
import { applyVantLocale } from './utils/vant-locale';

// 启动时解析 ?storeId= 并写入 sessionStorage，供后续公开 API 使用
getPublicStoreId();

const { locale } = useI18n();
watch(
  locale,
  (lang) => {
    applyVantLocale(String(lang));
  },
  { immediate: true },
);
</script>

<template>
  <router-view />
</template>

<style>
:root {
  --mt-yellow: #ffc300;
  --mt-black: #191919;
  --mt-orange: #ff6a00;
  --van-primary-color: #ffc300;
  --van-danger-color: #ff6a00;
  --van-tabbar-item-active-color: #191919;
  --van-nav-bar-background: #ffc300;
  --van-nav-bar-title-text-color: #191919;
  --van-nav-bar-icon-color: #191919;
  --van-button-primary-color: #191919;
  --van-button-primary-background: #ffc300;
  --van-button-primary-border-color: #ffc300;
  --van-submit-bar-button-background: #ffc300;
}
html,
body,
#app {
  margin: 0;
  min-height: 100%;
  background: #f5f5f5;
  color: #191919;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
}
</style>
