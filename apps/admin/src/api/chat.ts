import { apiGet, apiPost } from './http';
import http from './http';

export type ChatCustomer = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
};

export type ChatConversation = {
  id: string;
  storeId: string;
  customerId: string;
  lastMessageAt: string | null;
  lastPreview: string | null;
  unreadStaff: number;
  unreadCustomer: number;
  customer?: ChatCustomer;
};

export type ChatTranslateLang = 'zh' | 'vi' | 'en';

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderType: string;
  senderId: string | null;
  contentType: string;
  content: string;
  /** 服务端译文缓存 */
  translations?: Partial<Record<ChatTranslateLang, string>> | null;
  createdAt: string;
};

export type ChatMessagePage = {
  items: ChatMessage[];
  hasMore: boolean;
};

export const listChatConversationsApi = () =>
  apiGet<ChatConversation[]>('/chat/conversations');

/** 顾客消息未读总数（菜单角标） */
export const getChatUnreadCountApi = () => apiGet<{ count: number }>('/chat/unread-count');

export const listChatMessagesApi = (
  id: string,
  params?: { beforeId?: string; limit?: number },
) => apiGet<ChatMessagePage>(`/chat/conversations/${id}/messages`, params);

export const replyChatApi = (
  id: string,
  dto: { contentType: 'text' | 'image'; content: string },
) => apiPost<ChatMessage>(`/chat/conversations/${id}/messages`, dto);

export const markChatReadApi = (id: string) =>
  apiPost<{ ok: boolean }>(`/chat/conversations/${id}/read`, {});

export const translateChatApi = (dto: {
  text?: string;
  messageId?: string;
  targetLang: ChatTranslateLang;
  sourceLang?: ChatTranslateLang;
}) =>
  apiPost<{ translated: string; targetLang: string; cached?: boolean }>(
    '/chat/translate',
    dto,
  );

export async function uploadChatImageApi(file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await http.post<{ code: number; data: { url: string; key: string } }>(
    '/chat/upload',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}
