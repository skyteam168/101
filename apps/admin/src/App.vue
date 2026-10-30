<script setup lang="ts">
import { watch } from 'vue';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import vi from 'element-plus/es/locale/lang/vi';
import { useI18n } from 'vue-i18n';
import { elementLocale } from './i18n';

const { locale } = useI18n();

watch(
  locale,
  (val) => {
    elementLocale.value = val === 'vi-VN' ? vi : zhCn;
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
