<script setup lang="ts">
import { isPasswordComplex } from '@restaurant/shared';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { forgotPassword, sendCode } from '../../api/delivery';

const { t } = useI18n();
const router = useRouter();

const form = reactive({ email: '', code: '', newPassword: '', confirmPassword: '' });
const loading = ref(false);
const codeSending = ref(false);
const countdown = ref(0);

let timer: ReturnType<typeof setInterval>;

async function handleSendCode() {
  if (!form.email) {
    showToast(t('shop.auth.emailRequired'));
    return;
  }
  codeSending.value = true;
  try {
    const res = await sendCode({ email: form.email, purpose: 'reset' });
    showToast(
      res.devCode
        ? `${t('shop.auth.codeSent')} (${res.devCode})`
        : t('shop.auth.codeSent'),
    );
    countdown.value = 60;
    timer = setInterval(() => {
      countdown.value--;
      if (countdown.value <= 0) clearInterval(timer);
    }, 1000);
  } finally {
    codeSending.value = false;
  }
}

async function handleReset() {
  if (!form.email || !form.code || !form.newPassword) {
    showToast(t('shop.auth.fillAll'));
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    showToast(t('shop.auth.passwordMismatch'));
    return;
  }
  if (!isPasswordComplex(form.newPassword)) {
    showToast(t('shop.auth.passwordTooWeak'));
    return;
  }
  loading.value = true;
  try {
    await forgotPassword({ email: form.email, code: form.code, newPassword: form.newPassword });
    showToast(t('shop.auth.resetSuccess'));
    router.replace({ name: 'shop-login' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <van-nav-bar
      :title="t('shop.auth.forgotPassword')"
      left-arrow
      fixed
      placeholder
      @click-left="router.back()"
    />

    <div class="auth-body">
      <div class="auth-logo">
        <van-icon name="lock" size="52" color="#ee0a24" />
      </div>
      <h2 class="auth-title">{{ t('shop.auth.resetTitle') }}</h2>

      <van-cell-group inset>
        <van-field
          v-model="form.email"
          type="email"
          :label="t('shop.auth.email')"
          :placeholder="t('shop.auth.emailPlaceholder')"
        />
        <van-field
          v-model="form.code"
          :label="t('shop.auth.code')"
          :placeholder="t('shop.auth.codePlaceholder')"
        >
          <template #button>
            <van-button
              size="small"
              type="primary"
              :disabled="countdown > 0 || codeSending"
              :loading="codeSending"
              @click="handleSendCode"
            >
              {{ countdown > 0 ? `${countdown}s` : t('shop.auth.sendCode') }}
            </van-button>
          </template>
        </van-field>
        <van-field
          v-model="form.newPassword"
          type="password"
          :label="t('shop.auth.newPassword')"
          :placeholder="t('shop.auth.passwordPlaceholder')"
        />
        <van-field
          v-model="form.confirmPassword"
          type="password"
          :label="t('shop.auth.confirmPassword')"
          :placeholder="t('shop.auth.confirmPasswordPlaceholder')"
        />
      </van-cell-group>

      <div class="auth-actions">
        <van-button
          block
          type="danger"
          round
          :loading="loading"
          @click="handleReset"
        >
          {{ t('shop.auth.resetPassword') }}
        </van-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page { min-height: 100vh; background: #f7f8fa; }
.auth-body { padding: 24px 16px; }
.auth-logo { text-align: center; margin-bottom: 12px; }
.auth-title { text-align: center; font-size: 20px; font-weight: 700; color: #323233; margin-bottom: 20px; }
.auth-actions { margin-top: 24px; }
</style>
