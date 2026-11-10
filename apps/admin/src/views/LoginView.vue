<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import TurnstileWidget from '../components/TurnstileWidget.vue';
import { useUserStore } from '../stores/user';
import { addDynamicRoutes, resetDynamicRoutes } from '../router';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const loading = ref(false);
const cfToken = ref('');
const turnstileEnabled = ref(false);
const turnstileReset = ref(0);
const form = reactive({
  username: '',
  password: '',
});

async function onSubmit() {
  if (turnstileEnabled.value && !cfToken.value) {
    ElMessage.warning(t('auth.turnstileRequired'));
    return;
  }
  loading.value = true;
  try {
    resetDynamicRoutes();
    await userStore.login(form.username, form.password, cfToken.value || undefined);
    addDynamicRoutes(userStore.menus);
    const redirect = (route.query.redirect as string) || '/dashboard';
    await router.replace(redirect);
  } catch {
    turnstileReset.value += 1;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <el-card class="card">
      <h2>{{ t('app.title') }}</h2>
      <p class="sub">{{ t('auth.loginSubtitle') }}</p>
      <el-form label-position="top" @submit.prevent="onSubmit">
        <el-form-item :label="t('auth.username')">
          <el-input
            v-model="form.username"
            autocomplete="username"
            :placeholder="t('auth.usernamePlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('auth.password')">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="current-password"
            :placeholder="t('auth.passwordPlaceholder')"
          />
        </el-form-item>
        <TurnstileWidget
          :reset-key="turnstileReset"
          @update:token="(v) => (cfToken = v)"
          @ready="(v) => (turnstileEnabled = v)"
        />
        <el-button type="primary" native-type="submit" :loading="loading" style="width: 100%">
          {{ t('auth.login') }}
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 20% 20%, rgba(255, 195, 0, 0.35), transparent 40%),
    linear-gradient(145deg, #191919 0%, #3d3200 55%, #ffc300 160%);
}
.card {
  width: 400px;
  border-radius: 16px;
}
.card :deep(.el-button--primary) {
  height: 42px;
  font-size: 15px;
}
.sub {
  color: #909399;
  margin-bottom: 16px;
}
</style>
