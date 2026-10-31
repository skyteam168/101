/** 发给顾客聊天的系统消息（优惠券、生日等），由 ChatService 落库并推送 */
export const CUSTOMER_INBOX_MESSAGE = 'customer.inbox_message';

export type CustomerInboxPayload = {
  storeId: string;
  customerId: string;
  content: string;
};
