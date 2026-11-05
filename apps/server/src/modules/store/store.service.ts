import { Injectable } from '@nestjs/common';
import { Prisma, UserLang } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { assertSafeExternalHttpUrl, assertSafeMediaUrl } from '../../common/safe-url.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BusinessHours, getStoreOpenStatus } from '../delivery/geo.util';

export type AnnounceSettings = {
  dineInNew: boolean;
  addItem: boolean;
  deliveryNew: boolean;
  callWaiter: boolean;
  requestBill: boolean;
  orderCancel: boolean;
  printFailed: boolean;
  reservationNew: boolean;
  /** 扫码下单待确认 */
  qrNeedConfirm: boolean;
  /** 结账完成提示 */
  checkout: boolean;
  /** 顾客聊天新消息提示音 */
  chatMessage: boolean;
};

export type AnnounceClipPair = { zh?: string; vi?: string };
export type AnnounceClips = Partial<Record<keyof AnnounceSettings, AnnounceClipPair>>;

export type AiSettings = {
  enabled: boolean;
  provider: string;
  apiBase: string;
  apiKey: string;
  model: string;
};

export type EnvGalleryItem = {
  image: string;
  captionZh?: string;
  captionVi?: string;
};

export const DEFAULT_ANNOUNCE_SETTINGS: AnnounceSettings = {
  dineInNew: true,
  addItem: true,
  deliveryNew: true,
  callWaiter: true,
  requestBill: true,
  orderCancel: true,
  printFailed: true,
  reservationNew: true,
  qrNeedConfirm: true,
  checkout: true,
  chatMessage: true,
};

const ANNOUNCE_CLIP_KEYS: (keyof AnnounceSettings)[] = [
  'dineInNew',
  'addItem',
  'deliveryNew',
  'callWaiter',
  'requestBill',
  'orderCancel',
  'printFailed',
  'reservationNew',
  'qrNeedConfirm',
  'checkout',
  'chatMessage',
];

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: 'openai',
  apiBase: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private mergeAnnounce(raw: unknown): AnnounceSettings {
    const base = { ...DEFAULT_ANNOUNCE_SETTINGS };
    if (raw && typeof raw === 'object') {
      Object.assign(base, raw as Partial<AnnounceSettings>);
    }
    return base;
  }

  private mergeAnnounceClips(raw: unknown): AnnounceClips {
    const out: AnnounceClips = {};
    if (!raw || typeof raw !== 'object') return out;
    const obj = raw as Record<string, unknown>;
    for (const key of ANNOUNCE_CLIP_KEYS) {
      const pair = obj[key];
      if (!pair || typeof pair !== 'object') continue;
      const p = pair as { zh?: unknown; vi?: unknown };
      const next: AnnounceClipPair = {};
      if (typeof p.zh === 'string' && p.zh) next.zh = p.zh;
      if (typeof p.vi === 'string' && p.vi) next.vi = p.vi;
      if (next.zh || next.vi) out[key] = next;
    }
    return out;
  }

  mapAiSettings(raw: unknown, maskKey = true): AiSettings {
    const base = { ...DEFAULT_AI_SETTINGS };
    if (raw && typeof raw === 'object') Object.assign(base, raw as Partial<AiSettings>);
    if (maskKey && base.apiKey) base.apiKey = '********';
    return base;
  }

  /** 供翻译服务读取明文 Key（不脱敏） */
  async getAiSettingsRaw(storeId: string): Promise<AiSettings> {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    return this.mapAiSettings(store.aiSettings, false);
  }

  async getSettings(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    return {
      id: store.id.toString(),
      nameZh: store.nameZh,
      nameVi: store.nameVi,
      address: store.address,
      phone: store.phone,
      serviceChargeRate: Number(store.serviceChargeRate),
      taxRate: Number(store.taxRate),
      qrOrderNeedConfirm: store.qrOrderNeedConfirm,
      qrAutoOpen: store.qrAutoOpen,
      qrRequirePin: store.qrRequirePin,
      announceLang: store.announceLang,
      announceSettings: this.mergeAnnounce(store.announceSettings),
      announceClips: this.mergeAnnounceClips(store.announceClips),
      printSplitItem: store.printSplitItem,
      deliveryRadiusKm: Number(store.deliveryRadiusKm),
      deliveryFeeRules: store.deliveryFeeRules || [],
      minOrderAmount: Number(store.minOrderAmount),
      businessHours: store.businessHours || null,
      lat: store.lat != null ? Number(store.lat) : null,
      lng: store.lng != null ? Number(store.lng) : null,
      bankTransferQr: store.bankTransferQr,
      businessDayCutHour: store.businessDayCutHour,
      mailSettings: this.mapMailSettings(store.mailSettings),
      homeBanners: this.mapHomeBanners(store.homeBanners),
      storefrontImage: store.storefrontImage,
      adminLogo: store.adminLogo,
      envGallery: this.mapEnvGallery(store.envGallery),
      aiSettings: this.mapAiSettings(store.aiSettings, true),
      guestWifi: this.mapGuestWifi(store.guestWifi),
    };
  }

  /** 侧栏品牌：任意已登录员工可拉取 */
  async getBrand(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: BigInt(storeId) },
      select: { nameZh: true, nameVi: true, adminLogo: true },
    });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    return {
      nameZh: store.nameZh,
      nameVi: store.nameVi,
      adminLogo: store.adminLogo,
    };
  }

  private mapGuestWifi(raw: unknown): { ssid: string; password: string } {
    const base = { ssid: '', password: '' };
    if (raw && typeof raw === 'object') {
      const o = raw as { ssid?: string; password?: string };
      if (typeof o.ssid === 'string') base.ssid = o.ssid;
      if (typeof o.password === 'string') base.password = o.password;
    }
    return base;
  }

  private mapHomeBanners(raw: unknown): {
    image: string;
    link?: string;
    titleZh?: string;
    titleVi?: string;
  }[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x) => x && typeof x === 'object' && typeof (x as { image?: string }).image === 'string')
      .map((x) => {
        const b = x as {
          image: string;
          link?: string;
          titleZh?: string;
          titleVi?: string;
        };
        return {
          image: b.image,
          link: b.link || undefined,
          titleZh: b.titleZh || undefined,
          titleVi: b.titleVi || undefined,
        };
      });
  }

  private sanitizeOptionalMedia(url: string | null): string | null {
    if (url == null || url === '') return null;
    assertSafeMediaUrl(url);
    return url.trim();
  }

  private sanitizeHomeBanners(
    banners: {
      image: string;
      link?: string;
      titleZh?: string;
      titleVi?: string;
    }[],
  ) {
    return banners.map((b) => {
      assertSafeMediaUrl(b.image);
      const link = (b.link || '').trim();
      if (link) {
        if (link.startsWith('/') && !link.startsWith('//')) {
          // 站内相对路径
        } else {
          assertSafeExternalHttpUrl(link);
        }
      }
      return {
        image: b.image.trim(),
        link: link || undefined,
        titleZh: b.titleZh?.slice(0, 128),
        titleVi: b.titleVi?.slice(0, 128),
      };
    });
  }

  private sanitizeEnvGallery(items: EnvGalleryItem[]) {
    return items.map((g) => {
      assertSafeMediaUrl(g.image);
      return {
        image: g.image.trim(),
        captionZh: g.captionZh?.slice(0, 128),
        captionVi: g.captionVi?.slice(0, 128),
      };
    });
  }

  mapEnvGallery(raw: unknown): EnvGalleryItem[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x) => x && typeof x === 'object' && typeof (x as { image?: string }).image === 'string')
      .map((x) => {
        const b = x as EnvGalleryItem;
        return {
          image: b.image,
          captionZh: b.captionZh || undefined,
          captionVi: b.captionVi || undefined,
        };
      });
  }

  /** H5 首页门店摘要 */
  async getPublicHomeStore(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    const hours = store.businessHours as BusinessHours | null;
    const openStatus = getStoreOpenStatus(new Date(), hours);
    return {
      id: store.id.toString(),
      nameZh: store.nameZh,
      nameVi: store.nameVi,
      address: store.address,
      phone: store.phone,
      lat: store.lat != null ? Number(store.lat) : null,
      lng: store.lng != null ? Number(store.lng) : null,
      banners: this.mapHomeBanners(store.homeBanners),
      storefrontImage: store.storefrontImage,
      envGallery: this.mapEnvGallery(store.envGallery),
      businessHours: hours,
      ...openStatus,
    };
  }

  private mapMailSettings(raw: unknown) {
    const base = {
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: '',
    };
    if (raw && typeof raw === 'object') Object.assign(base, raw as object);
    // 接口不回传明文密码（有值则用占位）
    if (base.pass) base.pass = '********';
    return base;
  }

  async updateSettings(
    storeId: string,
    dto: {
      announceLang?: 'zh' | 'vi';
      announceSettings?: Partial<AnnounceSettings>;
      announceClips?: AnnounceClips;
      qrOrderNeedConfirm?: boolean;
      qrAutoOpen?: boolean;
      qrRequirePin?: boolean;
      printSplitItem?: boolean;
      nameZh?: string;
      nameVi?: string;
      address?: string | null;
      phone?: string | null;
      deliveryRadiusKm?: number;
      deliveryFeeRules?: unknown;
      minOrderAmount?: number;
      businessHours?: unknown;
      lat?: number | null;
      lng?: number | null;
      bankTransferQr?: string | null;
      businessDayCutHour?: number;
      mailSettings?: {
        enabled?: boolean;
        host?: string;
        port?: number;
        secure?: boolean;
        user?: string;
        pass?: string;
        from?: string;
      };
      homeBanners?: {
        image: string;
        link?: string;
        titleZh?: string;
        titleVi?: string;
      }[];
      storefrontImage?: string | null;
      adminLogo?: string | null;
      envGallery?: EnvGalleryItem[];
      aiSettings?: Partial<AiSettings>;
      guestWifi?: { ssid?: string; password?: string };
    },
    operatorId?: string,
  ) {
    const existing = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!existing) throw new BusinessError('STORE_REQUIRED');

    const nextAnnounce = {
      ...this.mergeAnnounce(existing.announceSettings),
      ...(dto.announceSettings || {}),
    };

    // 整表替换，便于前端清空某一语言的专属语音
    let nextClips: Prisma.InputJsonValue | undefined;
    if (dto.announceClips !== undefined) {
      nextClips = this.mergeAnnounceClips(dto.announceClips) as Prisma.InputJsonValue;
    }

    let nextMail: Prisma.InputJsonValue | undefined;
    if (dto.mailSettings !== undefined) {
      const prev =
        existing.mailSettings && typeof existing.mailSettings === 'object'
          ? { ...(existing.mailSettings as Record<string, unknown>) }
          : {};
      const incoming = { ...dto.mailSettings };
      // 占位密码表示未改
      if (incoming.pass === '********' || incoming.pass === undefined) {
        delete incoming.pass;
      }
      nextMail = { ...prev, ...incoming } as Prisma.InputJsonValue;
    }

    let nextAi: Prisma.InputJsonValue | undefined;
    if (dto.aiSettings !== undefined) {
      const prev = this.mapAiSettings(existing.aiSettings, false);
      const incoming = { ...dto.aiSettings };
      if (incoming.apiKey === '********' || incoming.apiKey === undefined) {
        delete incoming.apiKey;
      }
      const merged = { ...prev, ...incoming };
      if (merged.apiBase) {
        assertSafeExternalHttpUrl(String(merged.apiBase));
      }
      nextAi = merged as Prisma.InputJsonValue;
    }

    const row = await this.prisma.store.update({
      where: { id: existing.id },
      data: {
        announceLang: dto.announceLang as UserLang | undefined,
        announceSettings: nextAnnounce,
        announceClips: nextClips,
        qrOrderNeedConfirm: dto.qrOrderNeedConfirm,
        qrAutoOpen: dto.qrAutoOpen,
        qrRequirePin: dto.qrRequirePin,
        printSplitItem: dto.printSplitItem,
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        address: dto.address === undefined ? undefined : dto.address,
        phone: dto.phone === undefined ? undefined : dto.phone,
        deliveryRadiusKm: dto.deliveryRadiusKm,
        deliveryFeeRules:
          dto.deliveryFeeRules === undefined
            ? undefined
            : (dto.deliveryFeeRules as Prisma.InputJsonValue),
        minOrderAmount:
          dto.minOrderAmount === undefined ? undefined : BigInt(Math.round(dto.minOrderAmount)),
        businessHours:
          dto.businessHours === undefined
            ? undefined
            : (dto.businessHours as Prisma.InputJsonValue),
        lat: dto.lat === undefined ? undefined : dto.lat,
        lng: dto.lng === undefined ? undefined : dto.lng,
        bankTransferQr: dto.bankTransferQr === undefined ? undefined : dto.bankTransferQr,
        businessDayCutHour: dto.businessDayCutHour,
        mailSettings: nextMail,
        homeBanners:
          dto.homeBanners === undefined
            ? undefined
            : (this.sanitizeHomeBanners(dto.homeBanners) as Prisma.InputJsonValue),
        storefrontImage:
          dto.storefrontImage === undefined
            ? undefined
            : this.sanitizeOptionalMedia(dto.storefrontImage),
        adminLogo:
          dto.adminLogo === undefined
            ? undefined
            : this.sanitizeOptionalMedia(dto.adminLogo),
        envGallery:
          dto.envGallery === undefined
            ? undefined
            : (this.sanitizeEnvGallery(dto.envGallery) as Prisma.InputJsonValue),
        aiSettings: nextAi,
        guestWifi:
          dto.guestWifi === undefined
            ? undefined
            : ({
                ...this.mapGuestWifi(existing.guestWifi),
                ...dto.guestWifi,
              } as Prisma.InputJsonValue),
      },
    });

    // 审计不落明文密码 / API Key
    const auditAfter = { ...dto } as Record<string, unknown>;
    if (auditAfter.mailSettings && typeof auditAfter.mailSettings === 'object') {
      const mail = { ...(auditAfter.mailSettings as Record<string, unknown>) };
      if (mail.pass) mail.pass = '********';
      auditAfter.mailSettings = mail;
    }
    if (auditAfter.aiSettings && typeof auditAfter.aiSettings === 'object') {
      const ai = { ...(auditAfter.aiSettings as Record<string, unknown>) };
      if (ai.apiKey) ai.apiKey = '********';
      auditAfter.aiSettings = ai;
    }
    if (auditAfter.guestWifi && typeof auditAfter.guestWifi === 'object') {
      const wifi = { ...(auditAfter.guestWifi as Record<string, unknown>) };
      if (wifi.password) wifi.password = '********';
      auditAfter.guestWifi = wifi;
    }
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'settings',
      action: 'store.settings_update',
      targetType: 'store',
      targetId: storeId,
      after: auditAfter,
    });

    return this.getSettings(row.id.toString());
  }

  async resolvePushEmails(storeId: string, emails?: string[], customerIds?: string[]) {
    const list = new Set<string>((emails || []).map((e) => e.trim().toLowerCase()).filter(Boolean));
    if (customerIds?.length) {
      const customers = await this.prisma.customer.findMany({
        where: { id: { in: customerIds.map((id) => BigInt(id)) } },
        select: { email: true },
      });
      for (const c of customers) {
        if (c.email) list.add(c.email.toLowerCase());
      }
    }
    return [...list];
  }
}
