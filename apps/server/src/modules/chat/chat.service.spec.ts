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
    },
    chatMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const events = { emit: jest.fn() };
  const storeService = {
    getAiSettingsRaw: jest.fn(),
  };

  const service = new ChatService(
    prisma as never,
    events as never,
    storeService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('translate throws when AI disabled', async () => {
    storeService.getAiSettingsRaw.mockResolvedValue({
      enabled: false,
      provider: 'openai',
      apiBase: '',
      apiKey: '',
      model: '',
    });
    await expect(
      service.translate('1', { text: 'hello', targetLang: 'vi' }),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  it('translate throws when api key missing', async () => {
    storeService.getAiSettingsRaw.mockResolvedValue({
      enabled: true,
      provider: 'openai',
      apiBase: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
    });
    try {
      await service.translate('1', { text: '你好', targetLang: 'vi' });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessError);
      expect((e as BusinessError).errorCode).toBe('AI_API_KEY_MISSING');
    }
  });

  it('translate returns cached translation without calling AI', async () => {
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: BigInt(9),
      contentType: 'text',
      content: '你好',
      translations: { vi: 'Xin chào' },
      conversation: { storeId: BigInt(1), customerId: BigInt(2) },
    });
    const res = await service.translate('1', {
      messageId: '9',
      targetLang: 'vi',
    });
    expect(res).toEqual({ translated: 'Xin chào', targetLang: 'vi', cached: true });
    expect(storeService.getAiSettingsRaw).not.toHaveBeenCalled();
  });
});

