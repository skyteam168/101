import { ElNotification } from 'element-plus';
import { Events } from '@restaurant/shared';
import { computed, onUnmounted, ref, shallowRef } from 'vue';
import { i18n } from '../i18n';
import { getAnnounceApi, type AnnounceSettings } from '../api/store';
import { getAccessToken } from '../utils/auth-storage';
import { useUserStore } from '../stores/user';
import { io, type Socket } from 'socket.io-client';

export type VoiceKind =
  | 'dineInNew'
  | 'addItem'
  | 'deliveryNew'
  | 'callWaiter'
  | 'requestBill'
  | 'orderCancel'
  | 'printFailed'
  | 'reservationNew';

type QueueItem = {
  kind: VoiceKind;
  text: string;
  title: string;
  notify?: boolean;
};

const MUTE_KEY = 'voice_muted';

const unlocked = ref(false);
const muted = ref(localStorage.getItem(MUTE_KEY) === '1');
const playing = ref(false);
const announceLang = ref<'zh' | 'vi'>('zh');
const settings = ref<AnnounceSettings>({
  dineInNew: true,
  addItem: true,
  deliveryNew: true,
  callWaiter: true,
  requestBill: true,
  orderCancel: true,
  printFailed: true,
  reservationNew: true,
});

const queue: QueueItem[] = [];
let socket: Socket | null = null;
let deliveryTimers = new Map<string, ReturnType<typeof setInterval>>();
let started = false;

function t(key: string, params?: Record<string, unknown>) {
  return String(i18n.global.t(key, params || {}));
}

function pickVoice(lang: 'zh' | 'vi'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefer = lang === 'vi' ? ['vi-VN', 'vi'] : ['zh-CN', 'zh-TW', 'zh-HK', 'zh'];
  for (const code of prefer) {
    const found = voices.find((v) => v.lang.toLowerCase().startsWith(code.toLowerCase()));
    if (found) return found;
  }
  return null;
}

function playMp3(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(src);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('audio failed'));
    void audio.play().catch(reject);
  });
}

function speakText(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve();
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    const lang = announceLang.value === 'vi' ? 'vi-VN' : 'zh-CN';
    utter.lang = lang;
    const voice = pickVoice(announceLang.value);
    if (voice) utter.voice = voice;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

async function playFallbackAnnounce() {
  const base = announceLang.value === 'vi' ? '/audio/announce-vi' : '/audio/announce-zh';
  try {
    await playMp3(`${base}.wav`);
  } catch {
    try {
      await playMp3(`${base}.mp3`);
    } catch {
      // ignore
    }
  }
}

async function processQueue() {
  if (playing.value || muted.value || !unlocked.value) return;
  const item = queue.shift();
  if (!item) return;
  playing.value = true;
  try {
    if (item.notify !== false) {
      ElNotification({
        title: item.title,
        message: item.text,
        position: 'bottom-right',
        duration: 5000,
        type: item.kind === 'printFailed' || item.kind === 'orderCancel' ? 'error' : 'info',
      });
    }
    try {
      await playMp3('/audio/ding.wav');
    } catch {
      try {
        await playMp3('/audio/ding.mp3');
      } catch {
        // ding optional
      }
    }
    const voice = pickVoice(announceLang.value);
    if (voice) {
      await speakText(item.text);
    } else {
      await playFallbackAnnounce();
    }
  } finally {
    playing.value = false;
    void processQueue();
  }
}

function enqueue(kind: VoiceKind, text: string, title: string) {
  if (!settings.value[kind]) return;
  queue.push({ kind, text, title });
  void processQueue();
}

function stopDeliveryRepeat(orderId: string) {
  const timer = deliveryTimers.get(orderId);
  if (timer) {
    clearInterval(timer);
    deliveryTimers.delete(orderId);
  }
}

function startDeliveryRepeat(orderId: string, text: string, title: string) {
  stopDeliveryRepeat(orderId);
  enqueue('deliveryNew', text, title);
  const timer = setInterval(() => {
    enqueue('deliveryNew', text, title);
  }, 30000);
  deliveryTimers.set(orderId, timer);
}

function tableCode(payload: Record<string, unknown>) {
  return String(
    payload.tableCode ||
      (payload.table as { code?: string } | undefined)?.code ||
      (payload.order as { tableCode?: string } | undefined)?.tableCode ||
      '',
  );
}

function bindEvents(s: Socket) {
  s.on(Events.ORDER_CREATED, (payload: Record<string, unknown>) => {
    const order = (payload.order || payload) as {
      type?: string;
      id?: string;
      tableCode?: string;
      orderNo?: string;
    };
    const code = order.tableCode || tableCode(payload);
    if (order.type === 'delivery' || order.type === 'takeaway') {
      const text = t('voice.deliveryNew', { no: order.orderNo || order.id || '' });
      startDeliveryRepeat(String(order.id || order.orderNo), text, t('voice.title.deliveryNew'));
      return;
    }
    enqueue(
      'dineInNew',
      t('voice.dineInNew', { table: code || '-' }),
      t('voice.title.dineInNew'),
    );
  });

  s.on(Events.ORDER_BATCH_ADDED, (payload: Record<string, unknown>) => {
    const roundNo = Number(payload.roundNo || (payload.batch as { roundNo?: number })?.roundNo || 0);
    if (roundNo <= 1) return;
    const order = payload.order as { tableCode?: string } | undefined;
    const code = order?.tableCode || tableCode(payload);
    enqueue('addItem', t('voice.addItem', { table: code || '-', round: roundNo }), t('voice.title.addItem'));
  });

  s.on(Events.DELIVERY_NEW, (payload: Record<string, unknown>) => {
    const order = (payload.order || payload) as { id?: string; orderNo?: string };
    const text = t('voice.deliveryNew', { no: order.orderNo || order.id || '' });
    startDeliveryRepeat(String(order.id || order.orderNo), text, t('voice.title.deliveryNew'));
  });

  s.on(Events.DELIVERY_STATUS_CHANGED, (payload: Record<string, unknown>) => {
    const order = (payload.order || payload) as { id?: string; orderNo?: string; status?: string };
    const id = String(order.id || order.orderNo || '');
    if (order.status && order.status !== 'pending') stopDeliveryRepeat(id);
  });

  s.on(Events.TABLE_CALL_WAITER, (payload: Record<string, unknown>) => {
    enqueue(
      'callWaiter',
      t('voice.callWaiter', { table: tableCode(payload) || '-', name: String(payload.nickname || '') }),
      t('voice.title.callWaiter'),
    );
  });

  s.on(Events.TABLE_REQUEST_BILL, (payload: Record<string, unknown>) => {
    enqueue(
      'requestBill',
      t('voice.requestBill', { table: tableCode(payload) || '-' }),
      t('voice.title.requestBill'),
    );
  });

  s.on(Events.ORDER_CANCELLED, (payload: Record<string, unknown>) => {
    const order = (payload.order || payload) as { orderNo?: string; tableCode?: string };
    enqueue(
      'orderCancel',
      t('voice.orderCancel', { table: order.tableCode || tableCode(payload) || '-', no: order.orderNo || '' }),
      t('voice.title.orderCancel'),
    );
  });

  s.on(Events.PRINT_FAILED, (payload: Record<string, unknown>) => {
    enqueue(
      'printFailed',
      t('voice.printFailed', { tip: String(payload.error || payload.message || '') }),
      t('voice.title.printFailed'),
    );
  });

  s.on(Events.RESERVATION_CREATED, (payload: Record<string, unknown>) => {
    const r = (payload.reservation || payload) as {
      customerName?: string;
      guestCount?: number;
      phone?: string;
    };
    enqueue(
      'reservationNew',
      t('voice.reservationNew', {
        name: r.customerName || '-',
        guests: r.guestCount ?? '-',
        phone: r.phone || '',
      }),
      t('voice.title.reservationNew'),
    );
  });
}

async function loadAnnounceConfig() {
  try {
    const data = await getAnnounceApi();
    announceLang.value = data.announceLang;
    settings.value = { ...settings.value, ...data.announceSettings };
  } catch {
    // 无桌台权限时忽略
  }
}

function connectSocket() {
  const userStore = useUserStore();
  const storeId = userStore.profile?.storeId;
  if (!storeId) return;
  socket?.disconnect();
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: getAccessToken() },
  });
  socket.on('connect', () => {
    socket?.emit('join', { room: `store:${storeId}:front` });
  });
  bindEvents(socket);
}

/** 浏览器要求用户手势后才能出声 */
export function unlockVoice() {
  unlocked.value = true;
  // 预热 TTS voices + 静音短 ding
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
  void playMp3('/audio/ding.wav').catch(() => playMp3('/audio/ding.mp3').catch(() => undefined));
  void processQueue();
}

export function setVoiceMuted(value: boolean) {
  muted.value = value;
  localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  if (value && window.speechSynthesis) window.speechSynthesis.cancel();
  if (!value) void processQueue();
}

export function useVoiceAlert() {
  async function start() {
    if (started) return;
    started = true;
    await loadAnnounceConfig();
    connectSocket();
  }

  function stop() {
    started = false;
    socket?.disconnect();
    socket = null;
    for (const id of deliveryTimers.keys()) stopDeliveryRepeat(id);
    queue.length = 0;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  onUnmounted(() => {
    // 布局级常驻，不在组件卸载时 stop；由 logout 调用
  });

  return {
    unlocked: computed(() => unlocked.value),
    muted: computed(() => muted.value),
    playing: computed(() => playing.value),
    announceLang: computed(() => announceLang.value),
    settings: shallowRef(settings),
    unlockVoice,
    setVoiceMuted,
    start,
    stop,
    reloadSettings: loadAnnounceConfig,
    enqueue,
  };
}

export function stopVoiceAlertGlobal() {
  started = false;
  socket?.disconnect();
  socket = null;
  for (const id of [...deliveryTimers.keys()]) {
    const timer = deliveryTimers.get(id);
    if (timer) clearInterval(timer);
  }
  deliveryTimers.clear();
  queue.length = 0;
  unlocked.value = false;
}
