import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getChatConversation } from '../api/chat';
import { getCustomerToken } from '../utils/customer-storage';

export const useInboxStore = defineStore('inbox', () => {
  const unread = ref(0);
  const preview = ref('');

  async function refresh() {
    if (!getCustomerToken()) {
      unread.value = 0;
      preview.value = '';
      return;
    }
    try {
      const conv = await getChatConversation();
      unread.value = conv.unreadCustomer || 0;
      preview.value = conv.lastPreview || '';
    } catch {
      /* 未登录时忽略 */
    }
  }

  function clear() {
    unread.value = 0;
  }

  function bump(text?: string) {
    unread.value += 1;
    if (text) preview.value = text.slice(0, 120);
  }

  return { unread, preview, refresh, clear, bump };
});
