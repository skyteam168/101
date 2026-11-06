<script setup lang="ts">
import { isPasswordComplex } from '@restaurant/shared';
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { loginWithGoogle, register, sendCode } from '../../api/delivery';
import GoogleSignInButton from '../../components/GoogleSignInButton.vue';
import TurnstileWidget from '../../components/TurnstileWidget.vue';
import { useCustomerStore } from '../../stores/customer';

const { t, locale } = useI18n();
const router = useRouter();
const customer = useCustomerStore();

const form = reactive({ email: '', code: '', name: '', phone: '', password: '', confirmPassword: '' });
const loading = ref(false);
const codeSending = ref(false);
const countdown = ref(0);
const cfToken = ref('');
const turnstileEnabled = ref(false);
const turnstileReset = ref(0);

let timer: ReturnType<typeof setInterval>;

async function handleSendCode() {
  if (!form.email) {
    showToast(t('shop.auth.emailRequired'));
    return;
  }
  codeSending.value = true;
  try {
    const res = await sendCode({ email: form.email, purpose: 'register' });
    const base = res.devCode
      ? `${t('shop.auth.codeSent')} (${res.devCode})`
      : t('shop.auth.codeSent');
    const gmail = /@(gmail|googlemail)\.com$/i.test(form.email.trim());
    showToast(gmail ? `${base}\n${t('shop.auth.gmailSpamHint')}` : base);
    countdown.value = 60;
    timer = setInterval(() => {
      countdown.value--;
      if (countdown.value <= 0) clearInterval(timer);
    }, 1000);
  } finally {
    codeSending.value = false;
  }
}

async function handleRegister() {
  if (!form.email || !form.code || !form.name || !form.password) {
    showToast(t('shop.auth.fillAll'));
    return;
  }
  if (form.password !== form.confirmPassword) {
    showToast(t('shop.auth.passwordMismatch'));
    return;
  }
  if (!isPasswordComplex(form.password)) {
    showToast(t('shop.auth.passwordTooWeak'));
    return;
  }
  if (turnstileEnabled.value && !cfToken.value) {
    showToast(t('shop.auth.turnstileRequired'));
    return;
  }
  loading.value = true;
  try {
    const res = await register({
      email: form.email,
      code: form.code,
      name: form.name,
      phone: form.phone.trim() || undefined,
      password: form.password,
      cfTurnstileToken: cfToken.value || undefined,
    });
    customer.setAuth(res.accessToken, res.customer);
    showToast(t('shop.auth.registerSuccess'));
    router.replace({ name: 'shop' });
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
    customer.setAuth(res.accessToken, res.customer);
    showToast(t('shop.auth.registerSuccess'));
    router.replace({ name: 'shop' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <van-nav-bar
      :title="t('shop.auth.register')"
      left-arrow
      fixed
      placeholder
      @click-left="router.back()"
    />

    <div class="auth-body">
      <div class="auth-logo">
        <van-icon name="manager" size="52" color="#ee0a24" />
      </div>
      <h2 class="auth-title">{{ t('shop.auth.registerTitle') }}</h2>

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
          v-model="form.name"
          :label="t('shop.auth.name')"
          :placeholder="t('shop.auth.namePlaceholder')"
        />
        <van-field
          v-model="form.phone"
          type="tel"
          :label="t('shop.auth.phone')"
          :placeholder="t('shop.auth.phonePlaceholder')"
        />
        <van-field
          v-model="form.password"
          type="password"
          :label="t('shop.auth.password')"
          :placeholder="t('shop.auth.passwordPlaceholder')"
        />
        <van-field
          v-model="form.confirmPassword"
          type="password"
          :label="t('shop.auth.confirmPassword')"
          :placeholder="t('shop.auth.confirmPasswordPlaceholder')"
        />
      </van-cell-group>

      <TurnstileWidget
        :reset-key="turnstileReset"
        @update:token="(v) => (cfToken = v)"
        @ready="(v) => (turnstileEnabled = v)"
      />

      <div class="auth-actions">
        <van-button
          block
          type="danger"
          round
          :loading="loading"
          @click="handleRegister"
          style="margin-bottom: 12px"
        >
          {{ t('shop.auth.register') }}
        </van-button>
        <GoogleSignInButton @credential="onGoogleCredential" />
        <van-button block plain round @click="router.push({ name: 'shop-login' })">
          {{ t('shop.auth.toLogin') }}
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
