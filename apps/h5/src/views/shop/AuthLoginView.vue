<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { login, loginByCode, loginWithGoogle, sendCode } from '../../api/delivery';
import GoogleSignInButton from '../../components/GoogleSignInButton.vue';
import TurnstileWidget from '../../components/TurnstileWidget.vue';
import { useCustomerStore } from '../../stores/customer';

const { t, locale } = useI18n();
const router = useRouter();
const route = useRoute();
const customer = useCustomerStore();

const mode = ref<'password' | 'code'>('password');
const form = reactive({ email: '', password: '', code: '' });
const loading = ref(false);
const codeSending = ref(false);
const countdown = ref(0);
const cfToken = ref('');
const turnstileEnabled = ref(false);
const turnstileReset = ref(0);

let timer: ReturnType<typeof setInterval>;

function afterLogin(res: { accessToken: string; customer: Parameters<typeof customer.setAuth>[1] }) {
  customer.setAuth(res.accessToken, res.customer);
  showToast(t('shop.auth.loginSuccess'));
  const redirect = route.query.redirect as string | undefined;
  router.replace(redirect || { name: 'shop' });
}

async function handleSendCode() {
  if (!form.email) {
    showToast(t('shop.auth.emailRequired'));
    return;
  }
  codeSending.value = true;
  try {
    const res = await sendCode({
      email: form.email,
      purpose: 'login',
      lang: locale.value === 'zh-CN' ? 'zh' : 'vi',
    });
    showToast(
      res.devCode ? `${t('shop.auth.codeSent')} (${res.devCode})` : t('shop.auth.codeSent'),
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

async function handleLogin() {
  if (!form.email) {
    showToast(t('shop.auth.emailRequired'));
    return;
  }
  if (mode.value === 'password' && !form.password) {
    showToast(t('shop.auth.passwordRequired'));
    return;
  }
  if (mode.value === 'code' && !form.code) {
    showToast(t('shop.auth.codeRequired'));
    return;
  }
  if (turnstileEnabled.value && !cfToken.value) {
    showToast(t('shop.auth.turnstileRequired'));
    return;
  }
  loading.value = true;
  try {
    const token = cfToken.value || undefined;
    const res =
      mode.value === 'password'
        ? await login({ email: form.email, password: form.password, cfTurnstileToken: token })
        : await loginByCode({ email: form.email, code: form.code, cfTurnstileToken: token });
    afterLogin(res);
  } catch {
    turnstileReset.value += 1;
    cfToken.value = '';
  } finally {
    loading.value = false;
  }
}

async function onGoogleCredential(idToken: string) {
  loading.value = true;
  try {
    const res = await loginWithGoogle({
      idToken,
      lang: locale.value === 'zh-CN' ? 'zh' : 'vi',
    });
    afterLogin(res);
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

      <div class="mode-tabs">
        <button
          type="button"
          :class="{ active: mode === 'password' }"
          @click="mode = 'password'"
        >
          {{ t('shop.auth.passwordMode') }}
        </button>
        <button type="button" :class="{ active: mode === 'code' }" @click="mode = 'code'">
          {{ t('shop.auth.codeMode') }}
        </button>
      </div>

      <van-cell-group inset>
        <van-field v-model="form.email" type="email" :label="t('shop.auth.email')" />
        <van-field
          v-if="mode === 'password'"
          v-model="form.password"
          type="password"
          :label="t('shop.auth.password')"
        />
        <van-field
          v-else
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
      </van-cell-group>

      <TurnstileWidget
        :reset-key="turnstileReset"
        @update:token="(v) => (cfToken = v)"
        @ready="(v) => (turnstileEnabled = v)"
      />

      <div class="btns">
        <van-button type="primary" block round :loading="loading" @click="handleLogin">
          {{ t('shop.auth.login') }}
        </van-button>
        <GoogleSignInButton @credential="onGoogleCredential" />
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
  margin: 16px 0 16px;
}
.mode-tabs {
  display: flex;
  gap: 8px;
  margin: 0 16px 12px;
}
.mode-tabs button {
  flex: 1;
  border: 1px solid #ebedf0;
  background: #fff;
  border-radius: 999px;
  padding: 8px 0;
  font-size: 13px;
  color: #646566;
}
.mode-tabs button.active {
  border-color: #ee0a24;
  color: #ee0a24;
  font-weight: 600;
}
.btns {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
