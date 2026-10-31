<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Picture, Promotion } from '@element-plus/icons-vue';
import {
  Events,
  formatChatClock,
  isSafeMediaUrl,
  shouldShowChatTimeDivider,
} from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import {
  listChatConversationsApi,
  listChatMessagesApi,
  markChatReadApi,
  replyChatApi,
  translateChatApi,
  uploadChatImageApi,
  type ChatConversation,
  type ChatMessage,
  type ChatTranslateLang,
} from '../../api/chat';
import { formatChatTime } from '../../utils/chat-time';
import { getAccessToken } from '../../utils/auth-storage';

const { t, locale } = useI18n();

const PAGE_SIZE = 20;
const TRANSLATE_KEY = 'chat_translate_target_admin';
const AUTO_KEY = 'chat_auto_translate_admin';

function defaultTranslateLang(): ChatTranslateLang {
  const saved = localStorage.getItem(TRANSLATE_KEY);
  if (saved === 'zh' || saved === 'vi' || saved === 'en') return saved;
  // 商家端默认：界面越南语→译成越南语，否则中文（可手动改）
  return String(locale.value).startsWith('vi') ? 'vi' : 'zh';
}

const conversations = ref<ChatConversation[]>([]);
const activeId = ref<string | null>(null);
const messages = ref<ChatMessage[]>([]);
const text = ref('');
const sending = ref(false);
const loadingMessages = ref(false);
const loadingMore = ref(false);
const hasMore = ref(false);
const translations = ref<Record<string, string>>({});
const translateTarget = ref<ChatTranslateLang>(defaultTranslateLang());
const autoTranslate = ref(localStorage.getItem(AUTO_KEY) === '1');
const listRef = ref<HTMLElement | null>(null);
const nowTick = ref(Date.now());
const translatingIds = new Set<string>();
let socket: Socket | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

/** 商家端：自动翻译顾客发来的文本 */
function isPeerText(m: ChatMessage) {
  return m.contentType === 'text' && m.senderType === 'customer';
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
  if (m.contentType !== 'text' || translations.value[m.id] || translatingIds.has(m.id)) return;
  const lang = translateTarget.value;
  const cached = m.translations?.[lang];
  if (cached) {
    rememberTranslation(m, lang, cached);
    return;
  }
  translatingIds.add(m.id);
  try {
    const res = await translateChatApi({
      messageId: m.id,
      text: m.content,
      targetLang: lang,
    });
    rememberTranslation(m, lang, res.translated);
  } catch {
    /* 失败不打断聊天 */
  } finally {
    translatingIds.delete(m.id);
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

function msgTime(iso: string | null | undefined) {
  void nowTick.value;
  return formatChatTime(iso, t, nowTick.value);
}

function showTimeDivider(idx: number) {
  void nowTick.value;
  const curr = messages.value[idx]?.createdAt;
  const prev = idx > 0 ? messages.value[idx - 1]?.createdAt : null;
  return shouldShowChatTimeDivider(prev, curr);
}

const activeConversation = computed(() =>
  conversations.value.find((c) => c.id === activeId.value) || null,
);

const activeTitle = computed(() => {
  const c = activeConversation.value;
  if (!c) return '';
  return c.customer?.name || c.customer?.email || c.customerId;
});

async function scrollBottom() {
  await nextTick();
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
}

/** HTTP 与 Socket 可能先后到达，按 id 去重插入 */
function appendMessage(m: ChatMessage) {
  if (!m?.id) return false;
  if (messages.value.some((x) => x.id === m.id)) return false;
  messages.value.push(m);
  return true;
}

async function loadConversations() {
  conversations.value = await listChatConversationsApi();
}

async function openConversation(id: string) {
  activeId.value = id;
  loadingMessages.value = true;
  messages.value = [];
  hasMore.value = false;
  try {
    const page = await listChatMessagesApi(id, { limit: PAGE_SIZE });
    messages.value = page.items;
    hasMore.value = page.hasMore;
    await markChatReadApi(id);
    const c = conversations.value.find((x) => x.id === id);
    if (c) c.unreadStaff = 0;
    await scrollBottom();
    hydrateCachedTranslations();
  } catch {
    /* http 拦截器已提示 */
  } finally {
    loadingMessages.value = false;
  }
}

async function loadOlder() {
  if (!activeId.value || !hasMore.value || loadingMore.value || loadingMessages.value) return;
  const oldest = messages.value[0];
  if (!oldest) return;
  const el = listRef.value;
  const prevHeight = el?.scrollHeight ?? 0;
  const prevTop = el?.scrollTop ?? 0;
  loadingMore.value = true;
  try {
    const page = await listChatMessagesApi(activeId.value, {
      beforeId: oldest.id,
      limit: PAGE_SIZE,
    });
    const existing = new Set(messages.value.map((m) => m.id));
    const older = page.items.filter((m) => !existing.has(m.id));
    messages.value = [...older, ...messages.value];
    hasMore.value = page.hasMore;
    await nextTick();
    if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop;
    hydrateCachedTranslations();
  } catch {
    /* http 拦截器已提示 */
  } finally {
    loadingMore.value = false;
  }
}

function onMsgsScroll() {
  const el = listRef.value;
  if (!el) return;
  if (el.scrollTop <= 40) void loadOlder();
}

async function send() {
  if (!activeId.value || !text.value.trim() || sending.value) return;
  sending.value = true;
  const content = text.value.trim();
  text.value = '';
  try {
    const msg = await replyChatApi(activeId.value, {
      contentType: 'text',
      content,
    });
    appendMessage(msg);
    await loadConversations();
    await scrollBottom();
  } catch {
    text.value = content;
  } finally {
    sending.value = false;
  }
}

async function onUpload(file: File) {
  if (!activeId.value) return false;
  try {
    const { url } = await uploadChatImageApi(file);
    const msg = await replyChatApi(activeId.value, { contentType: 'image', content: url });
    appendMessage(msg);
    await loadConversations();
    await scrollBottom();
  } catch {
    /* http 拦截器已提示 */
  }
  return false;
}

async function translate(m: ChatMessage) {
  if (m.contentType !== 'text') return;
  if (translations.value[m.id]) {
    delete translations.value[m.id];
    translations.value = { ...translations.value };
    return;
  }
  await ensureTranslated(m);
}

function connectSocket() {
  const token = getAccessToken();
  if (!token) return;
  socket?.disconnect();
  socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'], auth: { token } });
  socket.off(Events.CHAT_MESSAGE);
  socket.on(Events.CHAT_MESSAGE, (payload: { conversationId?: string; message?: ChatMessage }) => {
    void loadConversations();
    if (payload.conversationId === activeId.value && payload.message) {
      if (appendMessage(payload.message)) {
        void scrollBottom();
        if (autoTranslate.value && isPeerText(payload.message)) {
          void ensureTranslated(payload.message);
        }
      }
    }
  });
}

onMounted(async () => {
  await loadConversations();
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
  <div class="chat-admin">
    <div class="head">
      <h3>{{ t('chat.title') }}</h3>
      <p class="sub">{{ t('chat.subtitle') }}</p>
    </div>
    <div class="layout">
      <aside class="list">
        <div
          v-for="c in conversations"
          :key="c.id"
          class="item"
          :class="{ active: c.id === activeId }"
          @click="openConversation(c.id)"
        >
          <div class="avatar">{{ (c.customer?.name || c.customer?.email || '?').slice(0, 1) }}</div>
          <div class="meta">
            <div class="name-row">
              <span class="name">{{ c.customer?.name || c.customer?.email || c.customerId }}</span>
              <span class="list-time">{{ msgTime(c.lastMessageAt) }}</span>
              <el-badge v-if="c.unreadStaff" :value="c.unreadStaff" />
            </div>
            <div class="preview">{{ c.lastPreview || '—' }}</div>
          </div>
        </div>
        <el-empty v-if="!conversations.length" :description="t('chat.noConversations')" />
      </aside>
      <section class="panel">
        <template v-if="activeId">
          <header class="panel-head">
            <div class="peer-row">
              <div>
                <div class="peer">{{ activeTitle }}</div>
                <div v-if="activeConversation?.customer?.phone" class="peer-sub">
                  {{ activeConversation.customer.phone }}
                </div>
              </div>
              <div class="lang-pick">
                <el-switch
                  :model-value="autoTranslate"
                  inline-prompt
                  :active-text="t('chat.autoOn')"
                  :inactive-text="t('chat.autoOff')"
                  @change="(v: string | number | boolean) => onAutoTranslateChange(Boolean(v))"
                />
                <span class="lang-label">{{ t('chat.translateTo') }}</span>
                <el-radio-group
                  :model-value="translateTarget"
                  size="small"
                  @change="(v: string | number | boolean | undefined) => onTranslateTargetChange(String(v) as ChatTranslateLang)"
                >
                  <el-radio-button value="zh">{{ t('chat.langZh') }}</el-radio-button>
                  <el-radio-button value="vi">{{ t('chat.langVi') }}</el-radio-button>
                  <el-radio-button value="en">{{ t('chat.langEn') }}</el-radio-button>
                </el-radio-group>
              </div>
            </div>
          </header>
          <div v-loading="loadingMessages" ref="listRef" class="msgs" @scroll.passive="onMsgsScroll">
            <div class="top-status">
              <template v-if="loadingMore">{{ t('chat.loadingMore') }}</template>
              <template v-else-if="!hasMore && messages.length">{{ t('chat.noMore') }}</template>
              <template v-else-if="hasMore">{{ t('chat.pullOlder') }}</template>
            </div>
            <template v-for="(m, idx) in messages" :key="m.id">
              <div v-if="showTimeDivider(idx)" class="time-divider">
                {{ msgTime(m.createdAt) }}
              </div>
              <div class="msg" :class="m.senderType === 'staff' ? 'mine' : 'theirs'">
                <div class="bubble">
                  <el-image
                    v-if="m.contentType === 'image' && isSafeMediaUrl(m.content)"
                    :src="m.content"
                    :preview-src-list="[m.content]"
                    fit="cover"
                    class="img"
                    preview-teleported
                  />
                  <template v-else>
                    <div class="txt">{{ m.content }}</div>
                    <div v-if="translations[m.id]" class="trans">{{ translations[m.id] }}</div>
                    <button type="button" class="tr-btn" @click="translate(m)">
                      {{ translations[m.id] ? t('chat.hideTranslation') : t('chat.translate') }}
                    </button>
                  </template>
                  <div class="msg-time">{{ formatChatClock(m.createdAt) }}</div>
                </div>
              </div>
            </template>
          </div>
          <div class="composer">
            <div class="toolbar">
              <el-upload :show-file-list="false" :before-upload="onUpload" accept="image/*">
                <button type="button" class="tool-btn" :title="t('chat.image')">
                  <el-icon :size="20"><Picture /></el-icon>
                </button>
              </el-upload>
            </div>
            <div class="input-row">
              <el-input
                v-model="text"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 4 }"
                resize="none"
                :placeholder="t('chat.placeholder')"
                @keydown.enter.exact.prevent="send"
              />
              <el-button
                class="send-btn"
                type="primary"
                :loading="sending"
                :disabled="!text.trim()"
                @click="send"
              >
                <el-icon class="send-ico"><Promotion /></el-icon>
                {{ t('chat.send') }}
              </el-button>
            </div>
          </div>
        </template>
        <el-empty v-else :description="t('chat.pickConversation')" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.chat-admin {
  padding: 16px 20px;
}
.head h3 {
  margin: 0;
}
.sub {
  margin: 4px 0 12px;
  color: #909399;
  font-size: 13px;
}
.layout {
  display: flex;
  height: calc(100vh - 160px);
  min-height: 480px;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #ebeef5;
}
.list {
  width: 280px;
  border-right: 1px solid #ebeef5;
  overflow-y: auto;
  background: #fafafa;
}
.item {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  align-items: center;
}
.item:hover,
.item.active {
  background: #fff8e6;
}
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd666, #ff9f43);
  color: #7a4a00;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.meta {
  min-width: 0;
  flex: 1;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.name {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.list-time {
  font-size: 11px;
  color: #c0c4cc;
  flex-shrink: 0;
  font-weight: 400;
}
.preview {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #f5f6f8;
}
.panel-head {
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
}
.peer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.peer {
  font-weight: 700;
  font-size: 15px;
}
.peer-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}
.lang-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.lang-label {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}
.msgs {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.top-status {
  text-align: center;
  font-size: 12px;
  color: #909399;
  min-height: 24px;
  margin-bottom: 8px;
}
.msg {
  display: flex;
  margin-bottom: 12px;
}
.msg.mine {
  justify-content: flex-end;
}
.bubble {
  max-width: 68%;
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.mine .bubble {
  background: #ffe08a;
}
.txt {
  white-space: pre-wrap;
}
.trans {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #e5e7eb;
  color: #6b7280;
  font-size: 13px;
}
.tr-btn {
  margin-top: 6px;
  border: none;
  background: transparent;
  color: #e6a23c;
  font-size: 12px;
  padding: 0;
  cursor: pointer;
}
.img {
  max-width: 220px;
  max-height: 280px;
  border-radius: 8px;
  display: block;
  cursor: zoom-in;
}
.img :deep(img) {
  border-radius: 8px;
}
.time-divider {
  text-align: center;
  font-size: 12px;
  color: #909399;
  margin: 12px 0 10px;
}
.msg-time {
  margin-top: 4px;
  font-size: 11px;
  color: #c0c4cc;
}
.mine .msg-time {
  text-align: right;
}
.composer {
  background: #fff;
  border-top: 1px solid #ebeef5;
  padding: 8px 12px 12px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}
.tool-btn {
  width: 36px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #606266;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.tool-btn:hover {
  background: #f5f7fa;
  color: #e6a23c;
}
.input-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.input-row :deep(.el-textarea__inner) {
  border-radius: 10px;
  background: #f5f7fa;
  box-shadow: none;
  border: 1px solid transparent;
  padding: 10px 12px;
  min-height: 40px !important;
}
.input-row :deep(.el-textarea__inner:focus) {
  border-color: #f0c78a;
  background: #fff;
}
.send-btn {
  height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  flex-shrink: 0;
}
.send-ico {
  margin-right: 4px;
}
</style>
