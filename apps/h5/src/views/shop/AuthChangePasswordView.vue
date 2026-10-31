<script setup lang="ts">
import { isPasswordComplex } from '@restaurant/shared';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { changePassword } from '../../api/delivery';
import { useCustomerStore } from '../../stores/customer';

const { t } = useI18n();
const router = useRouter();
const customer = useCustomerStore();

const hasPassword = computed(() => !!customer.profile?.hasPassword);
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const loading = ref(false);

async function handleSubmit() {
  if (!form.newPassword) {
    showToast(t('shop.auth.passwordRequired'));
    return;
  }
  if (!isPasswordComplex(form.newPassword)) {
    showToast(t('shop.auth.passwordTooWeak'));
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    showToast(t('shop.auth.passwordMismatch'));
    return;
  }
  if (hasPassword.value && !form.oldPassword) {
    showToast(t('shop.auth.oldPasswordRequired'));
    return;
  }
  loading.value = true;
  try {
    const updated = await changePassword({
      oldPassword: hasPassword.value ? form.oldPassword : undefined,
      newPassword: form.newPassword,
    });
    if (customer.token) customer.setAuth(customer.token, updated);
    showToast(t('shop.auth.passwordChanged'));
    router.back();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <van-nav-bar
      :title="hasPassword ? t('shop.auth.changePassword') : t('shop.auth.setPassword')"
      left-arrow
      @click-left="router.back()"
    />
    <div class="auth-body">
      <p class="hint">
        {{ hasPassword ? t('shop.auth.changePasswordHint') : t('shop.auth.setPasswordHint') }}
      </p>
      <van-cell-group inset>
        <van-field
          v-if="hasPassword"
          v-model="form.oldPassword"
          type="password"
          :label="t('shop.auth.oldPassword')"
        />
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
      <div class="btns">
        <van-button type="primary" block round :loading="loading" @click="handleSubmit">
          {{ t('shop.me.save') }}
        </van-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  background: #f7f8fa;
}
.auth-body {
  padding: 24px 16px;
}
.hint {
  margin: 0 16px 16px;
  color: #969799;
  font-size: 13px;
  line-height: 1.5;
}
.btns {
  margin-top: 24px;
}
</style>
