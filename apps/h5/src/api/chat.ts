import { apiGet, apiPost } from './http';
import http from './http';
import { getPublicStoreId } from '../utils/store-id';

function chatStoreParams(extra?: Record<string, string | number | undefined>) {
  return { storeId: getPublicStoreId(), ...extra };
}

export type ChatConversation = {
  id: string;
  storeId: string;
  customerId: string;
  lastMessageAt: string | null;
  lastPreview: string | null;
  unreadStaff: number;
  unreadCustomer: number;
};

export type ChatTranslateLang = 'zh' | 'vi' | 'en';

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderType: 'customer' | 'staff' | string;
  senderId: string | null;
  contentType: 'text' | 'image' | string;
  content: string;
  /** 服务端译文缓存 */
  translations?: Partial<Record<ChatTranslateLang, string>> | null;
  createdAt: string;
};

export type ChatMessagePage = {
  items: ChatMessage[];
  hasMore: boolean;
};

export function getChatConversation() {
  return apiGet<ChatConversation>('/public/delivery/chat', chatStoreParams());
}

export function listChatMessages(params?: { beforeId?: string; limit?: number }) {
  return apiGet<ChatMessagePage>('/public/delivery/chat/messages', chatStoreParams(params));
}

export function sendChatMessage(dto: { contentType: 'text' | 'image'; content: string }) {
  return apiPost<ChatMessage>(
    `/public/delivery/chat/messages?storeId=${encodeURIComponent(getPublicStoreId())}`,
    dto,
  );
}

export function markChatRead() {
  return apiPost<{ ok: boolean }>(
    `/public/delivery/chat/read?storeId=${encodeURIComponent(getPublicStoreId())}`,
    {},
  );
}

export function translateChatText(dto: {
  messageId: string;
  targetLang: ChatTranslateLang;
  sourceLang?: ChatTranslateLang;
}) {
  return apiPost<{ translated: string; targetLang: string; cached?: boolean }>(
    `/public/delivery/chat/translate?storeId=${encodeURIComponent(getPublicStoreId())}`,
    dto,
  );
}

/** 走 axios 拦截器，业务错误码会 toast */
export async function uploadChatImage(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await http.post<{ code: number; data: { url: string; key: string } }>(
    '/public/delivery/chat/upload',
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}
