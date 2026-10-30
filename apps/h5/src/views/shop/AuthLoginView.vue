<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { login } from '../../api/delivery';
import { useCustomerStore } from '../../stores/customer';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const customer = useCustomerStore();

const form = reactive({ email: '', password: '' });
const loading = ref(false);

async function handleLogin() {
  if (!form.email) {
    showToast(t('shop.auth.emailRequired'));
    return;
  }
  if (!form.password) {
    showToast(t('shop.auth.passwordRequired'));
    return;
  }
  loading.value = true;
  try {
    const res = await login({ email: form.email, password: form.password });
    customer.setAuth(res.accessToken, res.customer);
    showToast(t('shop.auth.loginSuccess'));
    const redirect = route.query.redirect as string | undefined;
    router.replace(redirect || { name: 'shop' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <van-nav-bar :title="t('shop.auth.login')" left-arrow @click-left="router.back()" />
    <div class="auth-body">
      <h2 class="auth-title">{{ t('shop.auth.loginTitle') }}</h2>
      <van-cell-group inset>
        <van-field v-model="form.email" type="email" :label="t('shop.auth.email')" />
        <van-field
          v-model="form.password"
          type="password"
          :label="t('shop.auth.password')"
        />
      </van-cell-group>
      <div class="btns">
        <van-button type="primary" block round :loading="loading" @click="handleLogin">
          {{ t('shop.auth.login') }}
        </van-button>
        <van-button block plain round to="/shop/register">{{ t('shop.auth.register') }}</van-button>
        <van-button block plain round to="/shop/forgot">{{ t('shop.auth.forgot') }}</van-button>
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
.auth-title {
  text-align: center;
  margin: 16px 0 24px;
}
.btns {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
