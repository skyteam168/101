<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { showToast } from 'vant';
import { getAuthConfig } from '../api/delivery';

const emit = defineEmits<{
  (e: 'credential', idToken: string): void;
}>();

const { t, locale } = useI18n();
const host = ref<HTMLElement | null>(null);
const enabled = ref(false);
const loading = ref(true);
let clientId = '';

type GoogleAccounts = {
  accounts: {
    id: {
      initialize: (cfg: {
        client_id: string;
        callback: (res: { credential: string }) => void;
        ux_mode?: string;
        auto_select?: boolean;
      }) => void;
      renderButton: (
        el: HTMLElement,
        opts: {
          theme?: string;
          size?: string;
          width?: number;
          text?: string;
          locale?: string;
        },
      ) => void;
      cancel: () => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gsi load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.dataset.googleGsi = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gsi load failed'));
    document.head.appendChild(s);
  });
}

onMounted(async () => {
  try {
    const cfg = await getAuthConfig();
    enabled.value = !!cfg.google.enabled && !!cfg.google.clientId;
    if (!enabled.value || !cfg.google.clientId) return;
    clientId = cfg.google.clientId;
    await loadScript();
    if (!host.value || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (res) => {
        if (res.credential) emit('credential', res.credential);
        else showToast(t('shop.auth.googleFailed'));
      },
      auto_select: false,
    });
    window.google.accounts.id.renderButton(host.value, {
      theme: 'outline',
      size: 'large',
      width: Math.min(320, host.value.parentElement?.clientWidth || 280),
      text: 'continue_with',
      locale: locale.value === 'zh-CN' ? 'zh-CN' : 'vi',
    });
  } catch {
    enabled.value = false;
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  try {
    window.google?.accounts.id.cancel();
  } catch {
    // ignore
  }
});
</script>

<template>
  <div v-show="enabled" class="google-wrap">
    <div class="divider"><span>{{ t('shop.auth.or') }}</span></div>
    <div ref="host" class="google-btn" />
    <p v-if="loading" class="hint">…</p>
  </div>
</template>

<style scoped>
.google-wrap {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.divider {
  width: 100%;
  text-align: center;
  margin: 8px 0 12px;
  color: #969799;
  font-size: 13px;
  position: relative;
}
.divider::before,
.divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 36%;
  height: 1px;
  background: #ebedf0;
}
.divider::before {
  left: 0;
}
.divider::after {
  right: 0;
}
.google-btn {
  min-height: 40px;
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #969799;
}
</style>
