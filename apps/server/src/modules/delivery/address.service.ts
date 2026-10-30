import { Injectable } from '@nestjs/common';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AddressDto } from './dto/delivery.dto';
import { isValidVnPhone } from './geo.util';

@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  private map(a: {
    id: bigint;
    contactName: string;
    phone: string;
    addressText: string;
    detail: string | null;
    lat: { toString(): string } | null;
    lng: { toString(): string } | null;
    isDefault: boolean;
  }) {
    return {
      id: a.id.toString(),
      contactName: a.contactName,
      phone: a.phone,
      addressText: a.addressText,
      detail: a.detail,
      lat: a.lat != null ? Number(a.lat) : null,
      lng: a.lng != null ? Number(a.lng) : null,
      isDefault: a.isDefault,
    };
  }

  list(customerId: string) {
    return this.prisma.customerAddress
      .findMany({
        where: { customerId: BigInt(customerId) },
        orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
      })
      .then((rows) => rows.map((r) => this.map(r)));
  }

  async create(customerId: string, dto: AddressDto) {
    if (!isValidVnPhone(dto.phone)) throw new BusinessError('INVALID_VN_PHONE');
    const cid = BigInt(customerId);
    if (dto.isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: { customerId: cid },
        data: { isDefault: false },
      });
    }
    const row = await this.prisma.customerAddress.create({
      data: {
        customerId: cid,
        contactName: dto.contactName,
        phone: dto.phone,
        addressText: dto.addressText,
        detail: dto.detail,
        lat: dto.lat,
        lng: dto.lng,
        isDefault: dto.isDefault ?? false,
      },
    });
    return this.map(row);
  }

  async update(customerId: string, id: string, dto: Partial<AddressDto>) {
    const existing = await this.prisma.customerAddress.findFirst({
      where: { id: BigInt(id), customerId: BigInt(customerId) },
    });
    if (!existing) throw new BusinessError('ADDRESS_NOT_FOUND');
    if (dto.phone && !isValidVnPhone(dto.phone)) throw new BusinessError('INVALID_VN_PHONE');
    if (dto.isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: { customerId: BigInt(customerId) },
        data: { isDefault: false },
      });
    }
    const row = await this.prisma.customerAddress.update({
      where: { id: existing.id },
      data: {
        contactName: dto.contactName,
        phone: dto.phone,
        addressText: dto.addressText,
        detail: dto.detail,
        lat: dto.lat,
        lng: dto.lng,
        isDefault: dto.isDefault,
      },
    });
    return this.map(row);
  }

  async remove(customerId: string, id: string) {
    const existing = await this.prisma.customerAddress.findFirst({
      where: { id: BigInt(id), customerId: BigInt(customerId) },
    });
    if (!existing) throw new BusinessError('ADDRESS_NOT_FOUND');
    await this.prisma.customerAddress.delete({ where: { id: existing.id } });
    return { ok: true };
  }
}
