<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';

const { t, locale } = useI18n();
const route = useRoute();
</script>

<template>
  <el-card>
    <h3>
      {{
        locale === 'vi-VN'
          ? route.meta.titleVi || route.meta.titleZh
          : route.meta.titleZh || route.name
      }}
    </h3>
    <p>{{ t('common.comingSoon') }}</p>
  </el-card>
</template>
