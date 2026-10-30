<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatVND } from '@restaurant/shared';

const { t, locale } = useI18n();
const health = ref<string>('-');
const demoAmount = formatVND(125000);

onMounted(async () => {
  try {
    const res = await fetch('/api/health');
    const json = await res.json();
    health.value = JSON.stringify(json);
  } catch {
    health.value = 'unreachable';
  }
});

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'vi-VN' : 'zh-CN';
  localStorage.setItem('locale', String(locale.value));
}
</script>

<template>
  <div style="padding: 48px; font-family: system-ui">
    <h1>{{ t('app.title') }}</h1>
    <p>{{ t('app.subtitle') }}</p>
    <p>{{ t('app.apiHealth') }}: {{ health }}</p>
    <p>formatVND demo: {{ demoAmount }}</p>
    <el-button type="primary" @click="toggleLocale">中 / VI</el-button>
  </div>
</template>
