<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <div style="padding: 48px; text-align: center">
    <h2>404</h2>
    <el-button type="primary" @click="router.push('/dashboard')">{{ t('common.backHome') }}</el-button>
  </div>
</template>
