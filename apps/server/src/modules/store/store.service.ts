import { Injectable } from '@nestjs/common';
import { Prisma, UserLang } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';

export type AnnounceSettings = {
  dineInNew: boolean;
  addItem: boolean;
  deliveryNew: boolean;
  callWaiter: boolean;
  requestBill: boolean;
  orderCancel: boolean;
  printFailed: boolean;
  reservationNew: boolean;
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
};

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  private mergeAnnounce(raw: unknown): AnnounceSettings {
    const base = { ...DEFAULT_ANNOUNCE_SETTINGS };
    if (raw && typeof raw === 'object') {
      Object.assign(base, raw as Partial<AnnounceSettings>);
    }
    return base;
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
    };
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

  /** H5 首页门店摘要 */
  async getPublicHomeStore(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!store) throw new BusinessError('STORE_REQUIRED');
    return {
      id: store.id.toString(),
      nameZh: store.nameZh,
      nameVi: store.nameVi,
      address: store.address,
      phone: store.phone,
      banners: this.mapHomeBanners(store.homeBanners),
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
    },
  ) {
    const existing = await this.prisma.store.findUnique({ where: { id: BigInt(storeId) } });
    if (!existing) throw new BusinessError('STORE_REQUIRED');

    const nextAnnounce = {
      ...this.mergeAnnounce(existing.announceSettings),
      ...(dto.announceSettings || {}),
    };

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

    const row = await this.prisma.store.update({
      where: { id: existing.id },
      data: {
        announceLang: dto.announceLang as UserLang | undefined,
        announceSettings: nextAnnounce,
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
            : (dto.homeBanners as Prisma.InputJsonValue),
      },
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
