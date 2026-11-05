<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showImagePreview, showToast } from 'vant';
import {
  Events,
  formatChatClock,
  isSafeMediaUrl,
  shouldShowChatTimeDivider,
} from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import {
  getChatConversation,
  listChatMessages,
  markChatRead,
  sendChatMessage,
  translateChatText,
  uploadChatImage,
  type ChatMessage,
  type ChatTranslateLang,
} from '../../api/chat';
import { formatChatTime } from '../../utils/chat-time';
import { getCustomerToken } from '../../utils/customer-storage';
import { useInboxStore } from '../../stores/inbox';
import { getStoreInfo, type StoreInfo } from '../../api/delivery';
import { formatBusinessHoursLine } from '../../utils/business-hours-display';

const PAGE_SIZE = 20;
const TRANSLATE_KEY = 'chat_translate_target_h5';
const AUTO_KEY = 'chat_auto_translate_h5';

const { t, locale } = useI18n();
const router = useRouter();
const inbox = useInboxStore();

function defaultTranslateLang(): ChatTranslateLang {
  const saved = localStorage.getItem(TRANSLATE_KEY);
  if (saved === 'zh' || saved === 'vi' || saved === 'en') return saved;
  // 顾客端默认跟界面语言；可选手动改成中/越/英
  return String(locale.value).startsWith('vi') ? 'vi' : 'zh';
}

const storeInfo = ref<StoreInfo | null>(null);
const messages = ref<ChatMessage[]>([]);
const text = ref('');
const sending = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const hasMore = ref(false);
const translations = ref<Record<string, string>>({});
const translatingId = ref<string | null>(null);
const translateTarget = ref<ChatTranslateLang>(defaultTranslateLang());
const autoTranslate = ref(localStorage.getItem(AUTO_KEY) === '1');
const listRef = ref<HTMLElement | null>(null);
const galleryInput = ref<HTMLInputElement | null>(null);
const cameraInput = ref<HTMLInputElement | null>(null);
const nowTick = ref(Date.now());
const translatingIds = new Set<string>();
let socket: Socket | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

const storeOpen = computed(() => storeInfo.value?.openNow !== false);
const hoursText = computed(() => formatBusinessHoursLine(storeInfo.value?.businessHours, t));
const chatClosedTip = computed(() => {
  if (storeOpen.value) return '';
  if (storeInfo.value?.closedReason === 'paused') return t('shop.storePaused');
  if (hoursText.value) return t('shop.storeClosedHours', { hours: hoursText.value });
  return t('shop.storeClosed');
});
const composerDisabled = computed(() => !storeOpen.value || sending.value);

/** 顾客端：自动翻译商家发来的文本 */
function isPeerText(m: ChatMessage) {
  return m.contentType === 'text' && m.senderType === 'staff';
}

/** 仅回填服务端已缓存的译文，不调大模型 */
function hydrateCachedTranslations() {
  if (!autoTranslate.value) return;
  const lang = translateTarget.value;
  const next = { ...translations.value };
  let changed = false;
  for (const m of messages.value) {
    if (!isPeerText(m) || next[m.id]) continue;
    const cached = m.translations?.[lang];
    if (cached) {
      next[m.id] = cached;
      changed = true;
    }
  }
  if (changed) translations.value = next;
}

function rememberTranslation(m: ChatMessage, lang: ChatTranslateLang, text: string) {
  translations.value = { ...translations.value, [m.id]: text };
  const idx = messages.value.findIndex((x) => x.id === m.id);
  if (idx >= 0) {
    const row = messages.value[idx];
    messages.value[idx] = {
      ...row,
      translations: { ...(row.translations || {}), [lang]: text },
    };
  }
}

/** 调 API：有 messageId 时服务端先查库缓存再决定是否调用模型 */
async function ensureTranslated(m: ChatMessage) {
  if (!isPeerText(m) || translations.value[m.id] || translatingIds.has(m.id)) return;
  const lang = translateTarget.value;
  const cached = m.translations?.[lang];
  if (cached) {
    rememberTranslation(m, lang, cached);
    return;
  }
  translatingIds.add(m.id);
  translatingId.value = m.id;
  try {
    const res = await translateChatText({
      messageId: m.id,
      targetLang: lang,
    });
    rememberTranslation(m, lang, res.translated);
  } catch {
    /* 失败不打断聊天 */
  } finally {
    translatingIds.delete(m.id);
    if (translatingId.value === m.id) translatingId.value = null;
  }
}

function onTranslateTargetChange(lang: ChatTranslateLang) {
  translateTarget.value = lang;
  localStorage.setItem(TRANSLATE_KEY, lang);
  translations.value = {};
  // 切换语言：只展示该语言已缓存译文，不批量重译历史
  hydrateCachedTranslations();
}

function onAutoTranslateChange(val: boolean) {
  autoTranslate.value = val;
  localStorage.setItem(AUTO_KEY, val ? '1' : '0');
  // 打开自动翻译：历史只回显缓存，不整页重译
  if (val) hydrateCachedTranslations();
  else translations.value = {};
}

function msgTime(iso: string) {
  void nowTick.value;
  return formatChatTime(iso, t, nowTick.value);
}

function showTimeDivider(idx: number) {
  void nowTick.value;
  const curr = messages.value[idx]?.createdAt;
  const prev = idx > 0 ? messages.value[idx - 1]?.createdAt : null;
  return shouldShowChatTimeDivider(prev, curr);
}

async function scrollBottom() {
  await nextTick();
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
}

function appendMessage(m: ChatMessage) {
  if (!m?.id) return false;
  if (messages.value.some((x) => x.id === m.id)) return false;
  messages.value.push(m);
  return true;
}

async function load() {
  loading.value = true;
  try {
    await getChatConversation();
    const page = await listChatMessages({ limit: PAGE_SIZE });
    messages.value = page.items;
    hasMore.value = page.hasMore;
    await markChatRead();
    inbox.clear();
    await scrollBottom();
    hydrateCachedTranslations();
  } catch {
    /* http 拦截器已 toast */
  } finally {
    loading.value = false;
  }
}

/** 滑到顶部加载更早的历史消息 */
async function loadOlder() {
  if (!hasMore.value || loadingMore.value || loading.value) return;
  const oldest = messages.value[0];
  if (!oldest) return;
  const el = listRef.value;
  const prevHeight = el?.scrollHeight ?? 0;
  const prevTop = el?.scrollTop ?? 0;
  loadingMore.value = true;
  try {
    const page = await listChatMessages({ beforeId: oldest.id, limit: PAGE_SIZE });
    const existing = new Set(messages.value.map((m) => m.id));
    const older = page.items.filter((m) => !existing.has(m.id));
    messages.value = [...older, ...messages.value];
    hasMore.value = page.hasMore;
    await nextTick();
    if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop;
    hydrateCachedTranslations();
  } catch {
    /* http 拦截器已 toast */
  } finally {
    loadingMore.value = false;
  }
}

function onListScroll() {
  const el = listRef.value;
  if (!el) return;
  if (el.scrollTop <= 48) void loadOlder();
}

function connectSocket() {
  const token = getCustomerToken();
  if (!token) return;
  socket?.disconnect();
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
  });
  socket.off(Events.CHAT_MESSAGE);
  socket.on(Events.CHAT_MESSAGE, (payload: { message?: ChatMessage }) => {
    const m = payload?.message;
    if (!m) return;
    if (appendMessage(m)) {
      void markChatRead();
      inbox.clear();
      void scrollBottom();
      if (autoTranslate.value && isPeerText(m)) void ensureTranslated(m);
    }
  });
}

async function sendText() {
  if (!storeOpen.value) {
    showToast(chatClosedTip.value || t('chat.storeClosedTip'));
    return;
  }
  const content = text.value.trim();
  if (!content || sending.value) return;
  sending.value = true;
  try {
    const msg = await sendChatMessage({ contentType: 'text', content });
    appendMessage(msg);
    text.value = '';
    await scrollBottom();
  } catch {
    /* http 拦截器已 toast */
  } finally {
    sending.value = false;
  }
}

function previewImage(url: string) {
  if (!url) return;
  showImagePreview({ images: [url], closeable: true });
}

function openGallery() {
  if (composerDisabled.value) {
    if (!storeOpen.value) showToast(chatClosedTip.value || t('chat.storeClosedTip'));
    return;
  }
  galleryInput.value?.click();
}

function openCamera() {
  if (composerDisabled.value) {
    if (!storeOpen.value) showToast(chatClosedTip.value || t('chat.storeClosedTip'));
    return;
  }
  cameraInput.value?.click();
}

async function onFileInputChange(e: Event) {
  if (!storeOpen.value) {
    showToast(chatClosedTip.value || t('chat.storeClosedTip'));
    return;
  }
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) {
    showToast(t('chat.imageTypeInvalid'));
    return;
  }
  if (f.size > 8 * 1024 * 1024) {
    showToast(t('chat.imageTooLarge'));
    return;
  }
  sending.value = true;
  try {
    const { url } = await uploadChatImage(f);
    const msg = await sendChatMessage({ contentType: 'image', content: url });
    appendMessage(msg);
    await scrollBottom();
  } catch {
    /* http 拦截器已 toast */
  } finally {
    sending.value = false;
  }
}

async function translate(m: ChatMessage) {
  if (!isPeerText(m)) return;
  if (translations.value[m.id]) {
    delete translations.value[m.id];
    translations.value = { ...translations.value };
    return;
  }
  await ensureTranslated(m);
}

onMounted(async () => {
  if (!getCustomerToken()) {
    router.replace({ name: 'shop-login', query: { redirect: '/shop/chat' } });
    return;
  }
  try {
    storeInfo.value = await getStoreInfo();
  } catch {
    storeInfo.value = null;
  }
  await load();
  connectSocket();
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 30_000);
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  socket?.off(Events.CHAT_MESSAGE);
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <div class="chat-page">
    <van-nav-bar :title="t('chat.title')" fixed placeholder />
    <div class="chat-body">
      <div class="lang-bar">
        <div class="lang-row">
          <span class="lang-label">{{ t('chat.autoTranslate') }}</span>
          <van-switch
            :model-value="autoTranslate"
            size="18px"
            @update:model-value="onAutoTranslateChange"
          />
        </div>
        <div class="lang-row">
          <span class="lang-label">{{ t('chat.translateTo') }}</span>
          <van-radio-group
            :model-value="translateTarget"
            direction="horizontal"
            @update:model-value="(v) => onTranslateTargetChange(v as ChatTranslateLang)"
          >
            <van-radio name="zh">{{ t('chat.langZh') }}</van-radio>
            <van-radio name="vi">{{ t('chat.langVi') }}</van-radio>
            <van-radio name="en">{{ t('chat.langEn') }}</van-radio>
          </van-radio-group>
        </div>
      </div>
      <div v-if="loading" class="pad">
        <van-skeleton title :row="6" />
        <div class="loading-tip">{{ t('chat.loading') }}</div>
      </div>
      <div v-else ref="listRef" class="msg-list" @scroll.passive="onListScroll">
        <div class="top-status">
          <template v-if="loadingMore">
            <van-loading size="16" />
            <span>{{ t('chat.loadingMore') }}</span>
          </template>
          <template v-else-if="!hasMore && messages.length">
            <span>{{ t('chat.noMore') }}</span>
          </template>
          <template v-else-if="hasMore">
            <span>{{ t('chat.pullOlder') }}</span>
          </template>
        </div>
        <div v-if="!messages.length" class="empty">{{ t('chat.empty') }}</div>
        <template v-for="(m, idx) in messages" :key="m.id">
          <div v-if="showTimeDivider(idx)" class="time-divider">
            {{ msgTime(m.createdAt) }}
          </div>
          <div class="msg-row" :class="m.senderType === 'customer' ? 'mine' : 'theirs'">
            <div class="bubble">
              <button
                v-if="m.contentType === 'image' && isSafeMediaUrl(m.content)"
                type="button"
                class="msg-img-btn"
                @click="previewImage(m.content)"
              >
                <img :src="m.content" class="msg-img" alt="" />
              </button>
              <template v-else>
                <div class="msg-text">{{ m.content }}</div>
                <div v-if="isPeerText(m) && translations[m.id]" class="msg-trans">
                  {{ translations[m.id] }}
                </div>
                <button
                  v-if="isPeerText(m)"
                  type="button"
                  class="tr-btn"
                  :disabled="translatingId === m.id"
                  @click="translate(m)"
                >
                  <van-icon name="exchange" size="14" />
                  {{
                    translations[m.id]
                      ? t('chat.hideTranslation')
                      : translatingId === m.id
                        ? t('chat.translating')
                        : t('chat.translate')
                  }}
                </button>
              </template>
              <div class="msg-time">{{ formatChatClock(m.createdAt) }}</div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div v-if="!storeOpen && chatClosedTip" class="chat-closed-tip">{{ chatClosedTip }}</div>

    <div class="composer" :class="{ 'composer-closed': !storeOpen }">
      <button
        type="button"
        class="icon-tool"
        :disabled="composerDisabled"
        :aria-label="t('chat.image')"
        @click="openGallery"
      >
        <van-icon name="photo-o" size="22" />
      </button>
      <button
        type="button"
        class="icon-tool"
        :disabled="composerDisabled"
        :aria-label="t('chat.camera')"
        @click="openCamera"
      >
        <van-icon name="photograph" size="22" />
      </button>
      <input
        ref="galleryInput"
        type="file"
        accept="image/*"
        class="file-hidden"
        @change="onFileInputChange"
      />
      <input
        ref="cameraInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="file-hidden"
        @change="onFileInputChange"
      />
      <van-field
        v-model="text"
        class="input"
        rows="1"
        autosize
        type="textarea"
        :disabled="!storeOpen"
        :placeholder="storeOpen ? t('chat.placeholder') : t('chat.storeClosedTip')"
        @keydown.enter.exact.prevent="sendText"
      />
      <van-button
        type="danger"
        size="small"
        round
        :loading="sending"
        :disabled="!storeOpen"
        class="send-btn"
        @click="sendText"
      >
        {{ t('chat.send') }}
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.chat-page {
  height: 100%;
  min-height: 0;
  background: #f7f8fa;
  display: flex;
  flex-direction: column;
}
.chat-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.lang-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}
.lang-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lang-label {
  font-size: 12px;
  color: #969799;
  white-space: nowrap;
}
.lang-bar :deep(.van-radio) {
  margin-right: 10px;
}
.lang-bar :deep(.van-radio__label) {
  font-size: 13px;
}
.msg-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 12px 16px;
  -webkit-overflow-scrolling: touch;
}
.top-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
  margin-bottom: 6px;
  font-size: 11px;
  color: #969799;
}
.loading-tip {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  color: #969799;
}
.empty {
  text-align: center;
  color: #969799;
  padding: 40px 0;
  font-size: 13px;
}
.msg-row {
  display: flex;
  margin-bottom: 10px;
}
.msg-row.mine {
  justify-content: flex-end;
}
.msg-row.theirs {
  justify-content: flex-start;
}
.bubble {
  max-width: 78%;
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.mine .bubble {
  background: #fff3e8;
}
.msg-text {
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-trans {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #eee;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.4;
}
.tr-btn {
  margin-top: 6px;
  border: none;
  background: transparent;
  color: #1989fa;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
}
.msg-img-btn {
  border: 0;
  padding: 0;
  background: transparent;
  display: block;
  cursor: zoom-in;
}
.msg-img {
  max-width: 180px;
  border-radius: 8px;
  display: block;
}
.file-hidden {
  display: none;
}
.icon-tool:disabled {
  opacity: 0.5;
}
.time-divider {
  text-align: center;
  font-size: 11px;
  color: #969799;
  margin: 10px 0 8px;
  line-height: 1.4;
}
.msg-time {
  margin-top: 4px;
  font-size: 10px;
  color: #c8c9cc;
  line-height: 1.2;
}
.mine .msg-time {
  text-align: right;
}
.chat-closed-tip {
  flex-shrink: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: #ed6a0c;
  background: #fff7e8;
  border-top: 1px solid #ffe2b8;
  line-height: 1.4;
}
.composer {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 10px;
  background: #fff;
  border-top: 1px solid #eee;
}
.composer-closed {
  opacity: 0.72;
}
.composer-closed .send-btn:disabled {
  background: #c8c9cc;
  border-color: #c8c9cc;
}
.icon-tool {
  border: none;
  background: #f3f4f6;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #374151;
}
.input {
  flex: 1;
  padding: 4px 8px;
  background: #f7f8fa;
  border-radius: 8px;
}
.pad {
  padding: 16px;
}
</style>
