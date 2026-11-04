import { ChatService } from './chat.service';
import { BusinessError } from '../../common/errors/business.error';

describe('ChatService', () => {
  const prisma = {
    chatConversation: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    chatMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    order: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const events = { emit: jest.fn() };
  const storeService = {
    getAiSettingsRaw: jest.fn(),
  };
  const redis = {
    incr: jest.fn(),
  };

  const service = new ChatService(
    prisma as never,
    events as never,
    storeService as never,
    redis as never,
  );

  const baseConv = {
    id: BigInt(1),
    storeId: BigInt(1),
    customerId: BigInt(2),
    lastMessageAt: null,
    lastPreview: null,
    unreadStaff: 0,
    unreadCustomer: 0,
    mutedUntil: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.chatConversation.upsert.mockResolvedValue({ ...baseConv });
    redis.incr.mockResolvedValue(1);
    prisma.order.findFirst.mockResolvedValue(null);
    prisma.chatMessage.count.mockResolvedValue(0);
  });

  it('sendFromCustomer allows first two messages without order', async () => {
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        chatMessage: {
          create: jest.fn().mockResolvedValue({
            id: BigInt(10),
            conversationId: BigInt(1),
            senderType: 'customer',
            senderId: BigInt(2),
            contentType: 'text',
            content: 'hi',
            createdAt: new Date(),
          }),
        },
        chatConversation: { update: jest.fn() },
      };
      return fn(tx);
    });
    const msg = await service.sendFromCustomer('1', '2', {
      contentType: 'text',
      content: 'hi',
    });
    expect(msg.content).toBe('hi');
  });

  it('sendFromCustomer rejects third message without valid order', async () => {
    prisma.chatMessage.count.mockResolvedValue(2);
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(
      service.sendFromCustomer('1', '2', { contentType: 'text', content: 'spam' }),
    ).rejects.toMatchObject({ errorCode: 'CHAT_NEED_ORDER' });
  });

  it('sendFromCustomer allows after valid order', async () => {
    prisma.chatMessage.count.mockResolvedValue(5);
    prisma.order.findFirst.mockResolvedValue({ id: BigInt(99) });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        chatMessage: {
          create: jest.fn().mockResolvedValue({
            id: BigInt(11),
            conversationId: BigInt(1),
            senderType: 'customer',
            senderId: BigInt(2),
            contentType: 'text',
            content: 'ok',
            createdAt: new Date(),
          }),
        },
        chatConversation: { update: jest.fn() },
      };
      return fn(tx);
    });
    const msg = await service.sendFromCustomer('1', '2', {
      contentType: 'text',
      content: 'ok',
    });
    expect(msg.content).toBe('ok');
  });

  it('sendFromCustomer rejects when muted', async () => {
    prisma.chatConversation.upsert.mockResolvedValue({
      ...baseConv,
      mutedUntil: new Date(Date.now() + 3600_000),
    });
    await expect(
      service.sendFromCustomer('1', '2', { contentType: 'text', content: 'x' }),
    ).rejects.toMatchObject({ errorCode: 'CHAT_MUTED' });
  });

  it('sendFromCustomer rejects when rate limited', async () => {
    redis.incr.mockResolvedValueOnce(2);
    await expect(
      service.sendFromCustomer('1', '2', { contentType: 'text', content: 'x' }),
    ).rejects.toMatchObject({ errorCode: 'CHAT_RATE_LIMITED' });
  });

  it('translate requires messageId', async () => {
    await expect(
      service.translate('1', { messageId: '', targetLang: 'vi' }),
    ).rejects.toMatchObject({ errorCode: 'CHAT_TRANSLATE_MESSAGE_REQUIRED' });
  });

  it('translate rejects translating own staff message for staff', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: BigInt(9),
      contentType: 'text',
      content: '你好',
      senderType: 'staff',
      translations: null,
      conversation: { storeId: BigInt(1), customerId: BigInt(2) },
    });
    await expect(
      service.translate('1', { messageId: '9', targetLang: 'vi' }),
    ).rejects.toMatchObject({ errorCode: 'CHAT_TRANSLATE_PEER_ONLY' });
  });

  it('translate returns cached translation without calling AI', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: BigInt(9),
      contentType: 'text',
      content: '你好',
      senderType: 'customer',
      translations: { vi: 'Xin chào' },
      conversation: { storeId: BigInt(1), customerId: BigInt(2) },
    });
    const res = await service.translate('1', {
      messageId: '9',
      targetLang: 'vi',
    });
    expect(res).toEqual({ translated: 'Xin chào', targetLang: 'vi', cached: true });
    expect(storeService.getAiSettingsRaw).not.toHaveBeenCalled();
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('translate throws when AI disabled after quota', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: BigInt(9),
      contentType: 'text',
      content: 'hello',
      senderType: 'customer',
      translations: null,
      conversation: { storeId: BigInt(1), customerId: BigInt(2) },
    });
    storeService.getAiSettingsRaw.mockResolvedValue({
      enabled: false,
      provider: 'openai',
      apiBase: '',
      apiKey: '',
      model: '',
    });
    await expect(
      service.translate('1', { messageId: '9', targetLang: 'vi' }),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  it('translate throws when api key missing', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: BigInt(9),
      contentType: 'text',
      content: '你好',
      senderType: 'customer',
      translations: null,
      conversation: { storeId: BigInt(1), customerId: BigInt(2) },
    });
    storeService.getAiSettingsRaw.mockResolvedValue({
      enabled: true,
      provider: 'openai',
      apiBase: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
    });
    try {
      await service.translate('1', { messageId: '9', targetLang: 'vi' });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessError);
      expect((e as BusinessError).errorCode).toBe('AI_API_KEY_MISSING');
    }
  });
});
