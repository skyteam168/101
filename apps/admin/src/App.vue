<script setup lang="ts">
import { getCurrentInstance, watch } from 'vue';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import vi from 'element-plus/es/locale/lang/vi';
import { provideGlobalConfig } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { elementLocale } from './i18n';

const { locale } = useI18n();
const app = getCurrentInstance()?.appContext.app;

watch(
  locale,
  (val) => {
    const next = val === 'vi-VN' ? vi : zhCn;
    elementLocale.value = next;
    // MessageBox / Message 等命令式组件不在 ConfigProvider 子树内，需同步全局 locale
    provideGlobalConfig({ locale: next }, app, true);
  },
  { immediate: true },
);
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <router-view />
  </el-config-provider>
</template>

<style>
html,
body,
#app {
  margin: 0;
  height: 100%;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
</style>
