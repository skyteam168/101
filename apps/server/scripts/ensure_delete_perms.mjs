/**
 * 线上增量写入删除相关权限，不重置已有角色勾选。
 * 用法：在 apps/server 目录执行
 *   node ../../scripts/ensure_delete_perms.mjs
 */
import { PrismaClient, PermissionType } from '@prisma/client';

const prisma = new PrismaClient();

const PERMS = [
  {
    code: 'delivery:delete',
    nameZh: '删除外卖单',
    nameVi: 'Xóa đơn giao',
    type: PermissionType.button,
    sort: 10,
  },
  {
    code: 'group_meal:delete',
    nameZh: '删除团餐询单',
    nameVi: 'Xóa đặt suất nhóm',
    type: PermissionType.button,
    sort: 22,
  },
];

/** 仅给这些系统角色补权（不覆盖自定义） */
const GRANT_TO = ['super_admin', 'manager'];

async function main() {
  const root = await prisma.permission.findFirst({ where: { code: 'menu:root' } });
  for (const p of PERMS) {
    const row = await prisma.permission.upsert({
      where: { code: p.code },
      update: { nameZh: p.nameZh, nameVi: p.nameVi, type: p.type, sort: p.sort },
      create: { ...p, parentId: root?.id ?? null },
    });
    for (const roleCode of GRANT_TO) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: row.id } },
        update: {},
        create: { roleId: role.id, permissionId: row.id },
      });
    }
    console.log('ok', p.code);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
