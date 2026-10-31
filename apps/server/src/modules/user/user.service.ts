import { Injectable } from '@nestjs/common';
import { UserLang, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BusinessError } from '../../common/errors/business.error';
import { assertPasswordComplexity } from '../../common/password.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  private mapUser(u: {
    id: bigint;
    username: string;
    displayName: string;
    phone: string | null;
    lang: UserLang;
    status: UserStatus;
    storeId: bigint | null;
    userRoles?: { role: { id: bigint; code: string; nameZh: string; nameVi: string } }[];
  }) {
    return {
      id: u.id.toString(),
      username: u.username,
      displayName: u.displayName,
      phone: u.phone,
      lang: u.lang,
      status: u.status,
      storeId: u.storeId?.toString() ?? null,
      roles:
        u.userRoles?.map((ur) => ({
          id: ur.role.id.toString(),
          code: ur.role.code,
          nameZh: ur.role.nameZh,
          nameVi: ur.role.nameVi,
        })) ?? [],
    };
  }

  async list(storeId?: string | null) {
    const users = await this.prisma.user.findMany({
      where: storeId ? { storeId: BigInt(storeId) } : undefined,
      include: { userRoles: { include: { role: true } } },
      orderBy: { id: 'asc' },
    });
    return users.map((u) => this.mapUser(u));
  }

  async create(dto: CreateUserDto, storeId?: string | null, operatorId?: string) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new BusinessError('USER_USERNAME_EXISTS');
    assertPasswordComplexity(dto.password);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: dto.username,
          passwordHash,
          displayName: dto.displayName,
          phone: dto.phone,
          lang: (dto.lang as UserLang) ?? UserLang.zh,
          storeId: storeId ? BigInt(storeId) : null,
          status: UserStatus.active,
        },
      });
      if (dto.roleIds?.length) {
        await tx.userRole.createMany({
          data: dto.roleIds.map((roleId) => ({
            userId: created.id,
            roleId: BigInt(roleId),
          })),
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: { userRoles: { include: { role: true } } },
      });
    });
    const mapped = this.mapUser(user);
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'rbac',
      action: 'user.create',
      targetType: 'user',
      targetId: mapped.id,
      after: { username: mapped.username, displayName: mapped.displayName, roleIds: dto.roleIds },
    });
    return mapped;
  }

  async update(id: string, dto: UpdateUserDto, operatorId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(id) } });
    if (!user) throw new BusinessError('USER_NOT_FOUND');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          displayName: dto.displayName,
          phone: dto.phone,
          lang: dto.lang as UserLang | undefined,
          status: dto.status as UserStatus | undefined,
        },
      });
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        if (dto.roleIds.length) {
          await tx.userRole.createMany({
            data: dto.roleIds.map((roleId) => ({
              userId: user.id,
              roleId: BigInt(roleId),
            })),
          });
        }
        await this.rbac.clearUserPermCache(id);
      }
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { userRoles: { include: { role: true } } },
      });
    });
    const mapped = this.mapUser(updated);
    await this.audit.log({
      userId: operatorId,
      storeId: user.storeId?.toString() ?? null,
      module: 'rbac',
      action: 'user.update',
      targetType: 'user',
      targetId: id,
      before: {
        displayName: user.displayName,
        phone: user.phone,
        status: user.status,
      },
      after: {
        displayName: mapped.displayName,
        phone: mapped.phone,
        status: mapped.status,
        roleIds: dto.roleIds,
      },
    });
    return mapped;
  }

  async setStatus(id: string, status: 'active' | 'disabled', operatorId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(id) } });
    if (!user) throw new BusinessError('USER_NOT_FOUND');
    if (user.username === 'admin' && status === 'disabled') {
      throw new BusinessError('USER_ADMIN_PROTECTED');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { status: status as UserStatus },
      include: { userRoles: { include: { role: true } } },
    });
    if (status === 'disabled') {
      await this.rbac.clearUserPermCache(id);
    }
    const mapped = this.mapUser(updated);
    await this.audit.log({
      userId: operatorId,
      storeId: user.storeId?.toString() ?? null,
      module: 'rbac',
      action: status === 'disabled' ? 'user.disable' : 'user.enable',
      targetType: 'user',
      targetId: id,
      before: { status: user.status },
      after: { status },
    });
    return mapped;
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(id) } });
    if (!user) throw new BusinessError('USER_NOT_FOUND');
    assertPasswordComplexity(dto.password);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    return { ok: true };
  }
}
