import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Events } from '@restaurant/shared';
import { BusinessError } from '../../common/errors/business.error';
import { assertSafeMediaUrl, sanitizePlainText } from '../../common/safe-url.util';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreService } from '../store/store.service';
import { CUSTOMER_INBOX_MESSAGE, CustomerInboxPayload } from './customer-inbox.event';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly storeService: StoreService,
  ) {}

  private mapTranslations(raw: unknown): Partial<Record<'zh' | 'vi' | 'en', string>> {
    const out: Partial<Record<'zh' | 'vi' | 'en', string>> = {};
    if (!raw || typeof raw !== 'object') return out;
    const obj = raw as Record<string, unknown>;
    for (const lang of ['zh', 'vi', 'en'] as const) {
      const v = obj[lang];
      if (typeof v === 'string' && v.trim()) out[lang] = v.trim();
    }
    return out;
  }

  private mapMessage(m: {
    id: bigint;
    conversationId: bigint;
    senderType: string;
    senderId: bigint | null;
    contentType: string;
    content: string;
    translations?: unknown;
    createdAt: Date;
  }) {
    const translations = this.mapTranslations(m.translations);
    return {
      id: m.id.toString(),
      conversationId: m.conversationId.toString(),
      senderType: m.senderType,
      senderId: m.senderId?.toString() ?? null,
      contentType: m.contentType,
      content: m.content,
      translations: Object.keys(translations).length ? translations : null,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private mapConversation(
    c: {
      id: bigint;
      storeId: bigint;
      customerId: bigint;
      lastMessageAt: Date | null;
      lastPreview: string | null;
      unreadStaff: number;
      unreadCustomer: number;
      createdAt: Date;
      updatedAt: Date;
      customer?: { id: bigint; name: string | null; email: string; phone: string | null } | null;
    },
  ) {
    return {
      id: c.id.toString(),
      storeId: c.storeId.toString(),
      customerId: c.customerId.toString(),
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastPreview: c.lastPreview,
      unreadStaff: c.unreadStaff,
      unreadCustomer: c.unreadCustomer,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      customer: c.customer
        ? {
            id: c.customer.id.toString(),
            name: c.customer.name,
            email: c.customer.email,
            phone: c.customer.phone,
          }
        : undefined,
    };
  }

  private async ensureConversation(storeId: string, customerId: string) {
    return this.prisma.chatConversation.upsert({
      where: {
        storeId_customerId: {
          storeId: BigInt(storeId),
          customerId: BigInt(customerId),
        },
      },
      create: {
        storeId: BigInt(storeId),
        customerId: BigInt(customerId),
      },
      update: {},
    });
  }

  async getOrCreateForCustomer(storeId: string, customerId: string) {
    const conv = await this.ensureConversation(storeId, customerId);
    return this.mapConversation(conv);
  }

  async listMessages(
    conversationId: string,
    opts?: {
      customerId?: string;
      storeId?: string;
      /** 加载此消息之前的更早记录（上拉/滑到顶部） */
      beforeId?: string;
      limit?: number;
    },
  ) {
    const conv = await this.prisma.chatConversation.findUnique({
      where: { id: BigInt(conversationId) },
    });
    if (!conv) throw new BusinessError('CHAT_NOT_FOUND');
    if (opts?.customerId && conv.customerId.toString() !== opts.customerId) {
      throw new BusinessError('FORBIDDEN', undefined, 403);
    }
    if (opts?.storeId && conv.storeId.toString() !== opts.storeId) {
      throw new BusinessError('FORBIDDEN', undefined, 403);
    }

    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
    const where: {
      conversationId: bigint;
      OR?: (
        | { createdAt: { lt: Date } }
        | { createdAt: Date; id: { lt: bigint } }
      )[];
    } = { conversationId: conv.id };

    if (opts?.beforeId) {
      const cursor = await this.prisma.chatMessage.findFirst({
        where: { id: BigInt(opts.beforeId), conversationId: conv.id },
      });
      if (!cursor) throw new BusinessError('CHAT_MESSAGE_NOT_FOUND');
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.chatMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
    return {
      items: page.map((m) => this.mapMessage(m)),
      hasMore,
    };
  }

  private normalizeMessageContent(dto: {
    contentType: 'text' | 'image';
    content: string;
  }): { contentType: 'text' | 'image'; content: string } {
    if (dto.contentType === 'image') {
      assertSafeMediaUrl(dto.content);
      return { contentType: 'image', content: dto.content.trim() };
    }
    const content = sanitizePlainText(dto.content, 4000);
    if (!content) throw new BusinessError('CHAT_EMPTY_CONTENT');
    return { contentType: 'text', content };
  }

  async sendFromCustomer(
    storeId: string,
    customerId: string,
    dto: { contentType: 'text' | 'image'; content: string },
  ) {
    const normalized = this.normalizeMessageContent(dto);
    const conv = await this.ensureConversation(storeId, customerId);
    const preview =
      normalized.contentType === 'image' ? '[image]' : normalized.content.slice(0, 120);
    const msg = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId: conv.id,
          senderType: 'customer',
          senderId: BigInt(customerId),
          contentType: normalized.contentType,
          content: normalized.content,
        },
      });
      await tx.chatConversation.update({
        where: { id: conv.id },
        data: {
          lastMessageAt: created.createdAt,
          lastPreview: preview,
          unreadStaff: { increment: 1 },
        },
      });
      return created;
    });
    const mapped = this.mapMessage(msg);
    const payload = {
      storeId,
      customerId,
      conversationId: conv.id.toString(),
      message: mapped,
    };
    this.events.emit(Events.CHAT_MESSAGE, payload);
    return mapped;
  }

  async sendFromStaff(
    storeId: string,
    conversationId: string,
    staffUserId: string,
    dto: { contentType: 'text' | 'image'; content: string },
  ) {
    const normalized = this.normalizeMessageContent(dto);
    const conv = await this.prisma.chatConversation.findFirst({
      where: { id: BigInt(conversationId), storeId: BigInt(storeId) },
    });
    if (!conv) throw new BusinessError('CHAT_NOT_FOUND');
    const preview =
      normalized.contentType === 'image' ? '[image]' : normalized.content.slice(0, 120);
    const msg = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId: conv.id,
          senderType: 'staff',
          senderId: BigInt(staffUserId),
          contentType: normalized.contentType,
          content: normalized.content,
        },
      });
      await tx.chatConversation.update({
        where: { id: conv.id },
        data: {
          lastMessageAt: created.createdAt,
          lastPreview: preview,
          unreadCustomer: { increment: 1 },
        },
      });
      return created;
    });
    const mapped = this.mapMessage(msg);
    const payload = {
      storeId,
      customerId: conv.customerId.toString(),
      conversationId: conv.id.toString(),
      message: mapped,
    };
    this.events.emit(Events.CHAT_MESSAGE, payload);
    return mapped;
  }

  /** 系统消息（生日祝福等），不绑定员工账号 */
  async sendSystemMessage(storeId: string, customerId: string, content: string) {
    const text = sanitizePlainText(content, 4000);
    if (!text) return null;
    const conv = await this.ensureConversation(storeId, customerId);
    const preview = text.slice(0, 120);
    const msg = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId: conv.id,
          senderType: 'staff',
          contentType: 'text',
          content: text,
        },
      });
      await tx.chatConversation.update({
        where: { id: conv.id },
        data: {
          lastMessageAt: created.createdAt,
          lastPreview: preview,
          unreadCustomer: { increment: 1 },
        },
      });
      return created;
    });
    const mapped = this.mapMessage(msg);
    this.events.emit(Events.CHAT_MESSAGE, {
      storeId,
      customerId,
      conversationId: conv.id.toString(),
      message: mapped,
    });
    return mapped;
  }

  @OnEvent(CUSTOMER_INBOX_MESSAGE)
  onCustomerInbox(payload: CustomerInboxPayload) {
    if (!payload?.storeId || !payload.customerId || !payload.content) return;
    void this.sendSystemMessage(payload.storeId, payload.customerId, payload.content);
  }

  async markReadByCustomer(storeId: string, customerId: string) {
    const conv = await this.ensureConversation(storeId, customerId);
    await this.prisma.chatConversation.update({
      where: { id: conv.id },
      data: { unreadCustomer: 0 },
    });
    this.events.emit(Events.CHAT_READ, {
      storeId,
      customerId,
      conversationId: conv.id.toString(),
      by: 'customer',
    });
    return { ok: true };
  }

  async markReadByStaff(storeId: string, conversationId: string) {
    const conv = await this.prisma.chatConversation.findFirst({
      where: { id: BigInt(conversationId), storeId: BigInt(storeId) },
    });
    if (!conv) throw new BusinessError('CHAT_NOT_FOUND');
    await this.prisma.chatConversation.update({
      where: { id: conv.id },
      data: { unreadStaff: 0 },
    });
    this.events.emit(Events.CHAT_READ, {
      storeId,
      customerId: conv.customerId.toString(),
      conversationId: conv.id.toString(),
      by: 'staff',
    });
    return { ok: true };
  }

  async listConversations(storeId: string) {
    const rows = await this.prisma.chatConversation.findMany({
      where: { storeId: BigInt(storeId) },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });
    return rows.map((c) => this.mapConversation(c));
  }

  /** 员工侧未读消息总数（菜单角标） */
  async countStaffUnread(storeId: string): Promise<number> {
    const agg = await this.prisma.chatConversation.aggregate({
      where: { storeId: BigInt(storeId), unreadStaff: { gt: 0 } },
      _sum: { unreadStaff: true },
    });
    return Number(agg._sum.unreadStaff ?? 0);
  }

  private langName(code: 'zh' | 'vi' | 'en') {
    if (code === 'zh') return 'Simplified Chinese';
    if (code === 'vi') return 'Vietnamese';
    return 'English';
  }

  async translate(
    storeId: string,
    dto: {
      text?: string;
      messageId?: string;
      targetLang: 'zh' | 'vi' | 'en';
      sourceLang?: 'zh' | 'vi' | 'en';
    },
    opts?: { customerId?: string },
  ) {
    let text = (dto.text || '').trim();
    let messageRow: {
      id: bigint;
      contentType: string;
      content: string;
      translations: unknown;
    } | null = null;

    if (dto.messageId) {
      const row = await this.prisma.chatMessage.findUnique({
        where: { id: BigInt(dto.messageId) },
        include: { conversation: true },
      });
      if (!row) throw new BusinessError('CHAT_MESSAGE_NOT_FOUND');
      if (row.conversation.storeId.toString() !== storeId) {
        throw new BusinessError('FORBIDDEN', undefined, 403);
      }
      if (opts?.customerId && row.conversation.customerId.toString() !== opts.customerId) {
        throw new BusinessError('FORBIDDEN', undefined, 403);
      }
      const cached = this.mapTranslations(row.translations);
      const hit = cached[dto.targetLang];
      if (hit) {
        return { translated: hit, targetLang: dto.targetLang, cached: true };
      }
      if (row.contentType !== 'text') throw new BusinessError('CHAT_TRANSLATE_TEXT_ONLY');
      messageRow = row;
      if (!text) text = row.content.trim();
    }

    if (!text) throw new BusinessError('CHAT_TRANSLATE_TEXT_REQUIRED');

    const ai = await this.storeService.getAiSettingsRaw(storeId);
    if (!ai.enabled) throw new BusinessError('AI_TRANSLATE_DISABLED');
    if (!ai.apiKey || ai.apiKey === '********') throw new BusinessError('AI_API_KEY_MISSING');

    const target = this.langName(dto.targetLang);
    const sourceHint = dto.sourceLang
      ? `The source language is ${this.langName(dto.sourceLang)}.`
      : 'Auto-detect the source language.';
    const system = [
      'You are a translation engine for restaurant customer-staff chat.',
      sourceHint,
      `Translate the user message into ${target}.`,
      `If the message is already in ${target}, return it unchanged.`,
      'Return ONLY the translated text, with no quotes, labels, or explanation.',
    ].join(' ');

    const base = (ai.apiBase || 'https://api.openai.com/v1').replace(/\/$/, '');
    const url = `${base}/chat/completions`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ai.apiKey}`,
        },
        body: JSON.stringify({
          model: ai.model || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: text },
          ],
        }),
      });
    } catch {
      throw new BusinessError('AI_TRANSLATE_FAILED');
    }
    if (!res.ok) {
      throw new BusinessError('AI_TRANSLATE_FAILED');
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const translated = data.choices?.[0]?.message?.content?.trim();
    if (!translated) throw new BusinessError('AI_TRANSLATE_FAILED');

    // 写回消息译文缓存，后续打开会话直接展示
    if (messageRow) {
      const next = {
        ...this.mapTranslations(messageRow.translations),
        [dto.targetLang]: translated,
      };
      await this.prisma.chatMessage.update({
        where: { id: messageRow.id },
        data: { translations: next },
      });
    }

    return { translated, targetLang: dto.targetLang, cached: false };
  }
}
