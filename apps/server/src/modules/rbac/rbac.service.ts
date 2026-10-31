import { Injectable } from '@nestjs/common';
import { PermissionType } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';

const PERM_CACHE_PREFIX = 'rbac:perms:';
const PERM_CACHE_TTL = 3600;

export type MenuNode = {
  id: string;
  code: string;
  nameZh: string;
  nameVi: string;
  path: string | null;
  sort: number;
  children: MenuNode[];
};

export type PermTreeNode = {
  id: string;
  code: string;
  nameZh: string;
  nameVi: string;
  type: PermissionType;
  path: string | null;
  sort: number;
  children: PermTreeNode[];
};

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async getUserPermissionCodes(userId: string): Promise<string[]> {
    const cacheKey = `${PERM_CACHE_PREFIX}${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as string[];
    }

    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user) return [];

    const isSuper = user.userRoles.some((ur) => ur.role.code === 'super_admin');
    let codes: string[];
    if (isSuper) {
      const all = await this.prisma.permission.findMany({ select: { code: true } });
      codes = all.map((p) => p.code);
    } else {
      const set = new Set<string>();
      for (const ur of user.userRoles) {
        for (const rp of ur.role.rolePermissions) {
          set.add(rp.permission.code);
        }
      }
      codes = [...set];
    }

    await this.redis.set(cacheKey, JSON.stringify(codes), PERM_CACHE_TTL);
    return codes;
  }

  async clearUserPermCache(userId: string): Promise<void> {
    await this.redis.del(`${PERM_CACHE_PREFIX}${userId}`);
  }

  async clearPermCacheForRole(roleId: bigint): Promise<void> {
    const links = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    for (const link of links) {
      await this.clearUserPermCache(link.userId.toString());
    }
  }

  async getMenuTreeForUser(userId: string, isSuperAdmin: boolean): Promise<MenuNode[]> {
    const menus = await this.prisma.permission.findMany({
      where: { type: PermissionType.menu },
      orderBy: { sort: 'asc' },
    });
    const codes = isSuperAdmin ? null : await this.getUserPermissionCodes(userId);
    const allowed = menus.filter((m) => {
      if (m.code === 'menu:root') return false;
      if (isSuperAdmin) return true;
      return codes!.includes(m.code);
    });

    const byId = new Map<string, MenuNode>();
    for (const m of allowed) {
      byId.set(m.id.toString(), {
        id: m.id.toString(),
        code: m.code,
        nameZh: m.nameZh,
        nameVi: m.nameVi,
        path: m.path,
        sort: m.sort,
        children: [],
      });
    }

    const roots: MenuNode[] = [];
    for (const m of allowed) {
      const node = byId.get(m.id.toString())!;
      const parentId = m.parentId?.toString();
      if (parentId && byId.has(parentId)) {
        byId.get(parentId)!.children.push(node);
      } else if (!parentId || m.parentId === null) {
        // 父级是 menu:root 或不在 allowed 中，提到顶层
        const parent = menus.find((x) => x.id === m.parentId);
        if (!parent || parent.code === 'menu:root' || !byId.has(parentId!)) {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    const sortTree = (nodes: MenuNode[]) => {
      nodes.sort((a, b) => a.sort - b.sort);
      nodes.forEach((n) => sortTree(n.children));
    };
    sortTree(roots);
    return roots;
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({ orderBy: { id: 'asc' } });
    return roles.map((r) => ({
      id: r.id.toString(),
      code: r.code,
      nameZh: r.nameZh,
      nameVi: r.nameVi,
      isSystem: r.isSystem,
    }));
  }

  async createRole(data: { code: string; nameZh: string; nameVi: string }) {
    const exists = await this.prisma.role.findUnique({ where: { code: data.code } });
    if (exists) throw new BusinessError('ROLE_CODE_EXISTS');
    const role = await this.prisma.role.create({
      data: { ...data, isSystem: false },
    });
    return {
      id: role.id.toString(),
      code: role.code,
      nameZh: role.nameZh,
      nameVi: role.nameVi,
      isSystem: role.isSystem,
    };
  }

  async updateRole(id: string, data: { nameZh?: string; nameVi?: string }) {
    const role = await this.prisma.role.findUnique({ where: { id: BigInt(id) } });
    if (!role) throw new BusinessError('ROLE_NOT_FOUND');
    const updated = await this.prisma.role.update({
      where: { id: BigInt(id) },
      data,
    });
    return {
      id: updated.id.toString(),
      code: updated.code,
      nameZh: updated.nameZh,
      nameVi: updated.nameVi,
      isSystem: updated.isSystem,
    };
  }

  async deleteRole(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id: BigInt(id) } });
    if (!role) throw new BusinessError('ROLE_NOT_FOUND');
    if (role.isSystem) throw new BusinessError('ROLE_SYSTEM_PROTECTED');
    await this.clearPermCacheForRole(role.id);
    await this.prisma.role.delete({ where: { id: role.id } });
    return { ok: true };
  }

  async getPermissionTree(): Promise<PermTreeNode[]> {
    const all = await this.prisma.permission.findMany({ orderBy: { sort: 'asc' } });
    const map = new Map<string, PermTreeNode>();
    for (const p of all) {
      map.set(p.id.toString(), {
        id: p.id.toString(),
        code: p.code,
        nameZh: p.nameZh,
        nameVi: p.nameVi,
        type: p.type,
        path: p.path,
        sort: p.sort,
        children: [],
      });
    }
    const roots: PermTreeNode[] = [];
    for (const p of all) {
      const node = map.get(p.id.toString())!;
      if (p.parentId) {
        const parent = map.get(p.parentId.toString());
        if (parent) parent.children.push(node);
        else roots.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async getRolePermissionIds(roleId: string): Promise<string[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { roleId: BigInt(roleId) },
    });
    return rows.map((r) => r.permissionId.toString());
  }

  async setRolePermissions(roleId: string, permissionIds: string[], operatorId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id: BigInt(roleId) } });
    if (!role) throw new BusinessError('ROLE_NOT_FOUND');
    if (role.code === 'super_admin') {
      throw new BusinessError('ROLE_SYSTEM_PROTECTED');
    }

    const beforeIds = await this.getRolePermissionIds(roleId);
    const ids = permissionIds.map((id) => BigInt(id));
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (ids.length) {
        await tx.rolePermission.createMany({
          data: ids.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }
    });
    await this.clearPermCacheForRole(role.id);
    await this.audit.log({
      userId: operatorId,
      module: 'rbac',
      action: 'role.update_perms',
      targetType: 'role',
      targetId: roleId,
      before: { permissionIds: beforeIds },
      after: { permissionIds, roleCode: role.code },
    });
    return { ok: true };
  }

  async setUserRoles(userId: string, roleIds: string[]) {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(userId) } });
    if (!user) throw new BusinessError('USER_NOT_FOUND');

    const ids = roleIds.map((id) => BigInt(id));
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      if (ids.length) {
        await tx.userRole.createMany({
          data: ids.map((roleId) => ({ userId: user.id, roleId })),
        });
      }
    });
    await this.clearUserPermCache(userId);
    return { ok: true };
  }
}
