<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <div class="forbidden">
    <h1>403</h1>
    <p>{{ t('errors.FORBIDDEN') }}</p>
    <el-button type="primary" @click="router.replace('/dashboard')">
      {{ t('menu.dashboard') }}
    </el-button>
  </div>
</template>

<style scoped>
.forbidden {
  min-height: 50vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #606266;
}
.forbidden h1 {
  margin: 0;
  font-size: 56px;
  font-weight: 700;
  color: #909399;
  letter-spacing: 2px;
}
.forbidden p {
  margin: 0 0 8px;
  font-size: 15px;
}
</style>
