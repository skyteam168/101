<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiGet } from '../api/http';

const props = defineProps<{
  /** 重置时递增，触发重新出题 */
  resetKey?: number;
}>();

const emit = defineEmits<{
  (e: 'update:token', token: string): void;
  (e: 'ready', enabled: boolean): void;
}>();

const host = ref<HTMLElement | null>(null);
const enabled = ref(false);
let widgetId: string | null = null;
let siteKey = '';

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
    },
  ) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cf-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.dataset.cfTurnstile = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile load failed'));
    document.head.appendChild(s);
  });
}

async function mountWidget() {
  if (!host.value || !siteKey || !window.turnstile) return;
  if (widgetId) {
    try {
      window.turnstile.remove(widgetId);
    } catch {
      // ignore
    }
    widgetId = null;
  }
  widgetId = window.turnstile.render(host.value, {
    sitekey: siteKey,
    callback: (token) => emit('update:token', token),
    'expired-callback': () => emit('update:token', ''),
    'error-callback': () => emit('update:token', ''),
    theme: 'light',
  });
}

onMounted(async () => {
  try {
    const cfg = await apiGet<{ enabled: boolean; siteKey: string | null }>(
      '/public/security/turnstile',
    );
    enabled.value = !!cfg.enabled && !!cfg.siteKey;
    emit('ready', enabled.value);
    if (!enabled.value || !cfg.siteKey) return;
    siteKey = cfg.siteKey;
    await loadScript();
    await mountWidget();
  } catch {
    enabled.value = false;
    emit('ready', false);
  }
});

watch(
  () => props.resetKey,
  () => {
    if (!enabled.value || !window.turnstile) return;
    emit('update:token', '');
    if (widgetId) window.turnstile.reset(widgetId);
    else void mountWidget();
  },
);

onBeforeUnmount(() => {
  if (widgetId && window.turnstile) {
    try {
      window.turnstile.remove(widgetId);
    } catch {
      // ignore
    }
  }
});
</script>

<template>
  <div v-show="enabled" class="turnstile-wrap">
    <div ref="host" />
  </div>
</template>

<style scoped>
.turnstile-wrap {
  display: flex;
  justify-content: center;
  margin: 16px 0 4px;
  min-height: 0;
}
</style>
