import { PrismaClient, PermissionType, UserLang, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

type PermDef = {
  code: string;
  nameZh: string;
  nameVi: string;
  type: PermissionType;
  path?: string;
  sort: number;
  children?: PermDef[];
};

const PERMISSION_TREE: PermDef[] = [
  {
    code: 'menu:root',
    nameZh: '系统菜单',
    nameVi: 'Menu hệ thống',
    type: PermissionType.menu,
    sort: 0,
    children: [
      {
        code: 'menu:dish',
        nameZh: '菜品管理',
        nameVi: 'Quản lý món',
        type: PermissionType.menu,
        path: '/menu',
        sort: 10,
      },
      {
        code: 'menu:combo',
        nameZh: '套餐管理',
        nameVi: 'Combo',
        type: PermissionType.menu,
        path: '/combos',
        sort: 12,
      },
      {
        code: 'menu:reservation',
        nameZh: '预定管理',
        nameVi: 'Đặt bàn',
        type: PermissionType.menu,
        path: '/reservations',
        sort: 22,
      },
      {
        code: 'menu:group-meal',
        nameZh: '团餐询单',
        nameVi: 'Đặt suất nhóm',
        type: PermissionType.menu,
        path: '/group-meals',
        sort: 23,
      },
      {
        code: 'menu:cashier',
        nameZh: '收银台',
        nameVi: 'Thu ngân',
        type: PermissionType.menu,
        path: '/cashier',
        sort: 15,
      },
      {
        code: 'menu:table',
        nameZh: '桌台',
        nameVi: 'Bàn',
        type: PermissionType.menu,
        path: '/tables',
        sort: 20,
      },
      {
        code: 'menu:order',
        nameZh: '订单',
        nameVi: 'Đơn hàng',
        type: PermissionType.menu,
        path: '/orders',
        sort: 30,
      },
      {
        code: 'menu:kitchen',
        nameZh: '厨房看板',
        nameVi: 'Bảng bếp',
        type: PermissionType.menu,
        path: '/kitchen',
        sort: 32,
      },
      {
        code: 'menu:member',
        nameZh: '会员',
        nameVi: 'Hội viên',
        type: PermissionType.menu,
        path: '/members',
        sort: 35,
      },
      {
        code: 'menu:marketing',
        nameZh: '营销',
        nameVi: 'Marketing',
        type: PermissionType.menu,
        path: '/marketing',
        sort: 38,
      },
      {
        code: 'menu:delivery',
        nameZh: '外卖',
        nameVi: 'Giao hàng',
        type: PermissionType.menu,
        path: '/delivery',
        sort: 40,
      },
      {
        code: 'menu:print',
        nameZh: '打印',
        nameVi: 'In ấn',
        type: PermissionType.menu,
        path: '/print',
        sort: 50,
      },
      {
        code: 'menu:asset',
        nameZh: '资产',
        nameVi: 'Tài sản',
        type: PermissionType.menu,
        path: '/assets',
        sort: 60,
      },
      {
        code: 'menu:inventory',
        nameZh: '采购库存',
        nameVi: 'Mua hàng & Kho',
        type: PermissionType.menu,
        path: '/inventory',
        sort: 65,
      },
      {
        code: 'menu:hr',
        nameZh: '人事',
        nameVi: 'Nhân sự',
        type: PermissionType.menu,
        path: '/hr',
        sort: 68,
      },
      {
        code: 'menu:report',
        nameZh: '报表',
        nameVi: 'Báo cáo',
        type: PermissionType.menu,
        path: '/reports',
        sort: 70,
      },
      {
        code: 'menu:finance',
        nameZh: '财务运营',
        nameVi: 'Tài chính vận hành',
        type: PermissionType.menu,
        path: '/finance',
        sort: 72,
      },
      {
        code: 'menu:chat',
        nameZh: '顾客消息',
        nameVi: 'Tin nhắn khách',
        type: PermissionType.menu,
        path: '/chat',
        sort: 55,
      },
      {
        code: 'menu:system',
        nameZh: '系统',
        nameVi: 'Hệ thống',
        type: PermissionType.menu,
        path: '/system',
        sort: 80,
        children: [
          {
            code: 'menu:system:user',
            nameZh: '员工管理',
            nameVi: 'Nhân viên',
            type: PermissionType.menu,
            path: '/system/users',
            sort: 1,
          },
          {
            code: 'menu:system:role',
            nameZh: '角色权限',
            nameVi: 'Vai trò & quyền',
            type: PermissionType.menu,
            path: '/system/roles',
            sort: 2,
          },
          {
            code: 'menu:system:settings',
            nameZh: '门店设置',
            nameVi: 'Cài đặt cửa hàng',
            type: PermissionType.menu,
            path: '/system/settings',
            sort: 3,
          },
          {
            code: 'menu:system:audit',
            nameZh: '审计日志',
            nameVi: 'Nhật ký kiểm toán',
            type: PermissionType.menu,
            path: '/system/audit',
            sort: 4,
          },
        ],
      },
    ],
  },
  {
    code: 'api:ops',
    nameZh: '业务权限',
    nameVi: 'Quyền nghiệp vụ',
    type: PermissionType.api,
    sort: 100,
    children: [
      {
        code: 'menu:dish:edit',
        nameZh: '编辑菜品',
        nameVi: 'Sửa món',
        type: PermissionType.button,
        sort: 1,
      },
      {
        code: 'menu:dish:sold-out',
        nameZh: '菜品估清',
        nameVi: 'Báo hết món',
        type: PermissionType.button,
        sort: 1,
      },
      {
        code: 'table:open',
        nameZh: '开台',
        nameVi: 'Mở bàn',
        type: PermissionType.button,
        sort: 2,
      },
      {
        code: 'order:create',
        nameZh: '点餐',
        nameVi: 'Tạo đơn',
        type: PermissionType.button,
        sort: 3,
      },
      {
        code: 'order:add-item',
        nameZh: '加菜',
        nameVi: 'Thêm món',
        type: PermissionType.button,
        sort: 4,
      },
      {
        code: 'order:void-item',
        nameZh: '退菜',
        nameVi: 'Hủy món',
        type: PermissionType.button,
        sort: 5,
      },
      {
        code: 'order:cancel',
        nameZh: '取消订单',
        nameVi: 'Hủy đơn',
        type: PermissionType.button,
        sort: 6,
      },
      {
        code: 'order:discount',
        nameZh: '折扣',
        nameVi: 'Giảm giá',
        type: PermissionType.button,
        sort: 7,
      },
      {
        code: 'order:checkout',
        nameZh: '结账',
        nameVi: 'Thanh toán',
        type: PermissionType.button,
        sort: 8,
      },
      {
        code: 'order:refund',
        nameZh: '退款',
        nameVi: 'Hoàn tiền',
        type: PermissionType.button,
        sort: 9,
      },
      {
        code: 'delivery:accept',
        nameZh: '接外卖单',
        nameVi: 'Nhận đơn giao',
        type: PermissionType.button,
        sort: 10,
      },
      {
        code: 'delivery:delete',
        nameZh: '删除外卖单',
        nameVi: 'Xóa đơn giao',
        type: PermissionType.button,
        sort: 10,
      },
      {
        code: 'print:reprint',
        nameZh: '重打小票',
        nameVi: 'In lại',
        type: PermissionType.button,
        sort: 11,
      },
      {
        code: 'asset:scrap',
        nameZh: '资产报废',
        nameVi: 'Thanh lý tài sản',
        type: PermissionType.button,
        sort: 12,
      },
      {
        code: 'asset:sell',
        nameZh: '资产变卖',
        nameVi: 'Bán tài sản',
        type: PermissionType.button,
        sort: 13,
      },
      {
        code: 'report:view',
        nameZh: '查看报表',
        nameVi: 'Xem báo cáo',
        type: PermissionType.api,
        sort: 14,
      },
      {
        code: 'hr:edit',
        nameZh: '编辑人事',
        nameVi: 'Sửa nhân sự',
        type: PermissionType.button,
        sort: 17,
      },
      {
        code: 'hr:payroll',
        nameZh: '人力月结',
        nameVi: 'Chốt lương',
        type: PermissionType.button,
        sort: 18,
      },
      {
        code: 'system:role',
        nameZh: '角色权限配置',
        nameVi: 'Cấu hình vai trò',
        type: PermissionType.api,
        sort: 15,
      },
      {
        code: 'member:edit',
        nameZh: '编辑会员',
        nameVi: 'Sửa hội viên',
        type: PermissionType.button,
        sort: 16,
      },
      {
        code: 'marketing:edit',
        nameZh: '编辑营销',
        nameVi: 'Sửa marketing',
        type: PermissionType.button,
        sort: 16,
      },
      {
        code: 'combo:view',
        nameZh: '查看套餐',
        nameVi: 'Xem combo',
        type: PermissionType.button,
        sort: 17,
      },
      {
        code: 'combo:edit',
        nameZh: '编辑套餐',
        nameVi: 'Sửa combo',
        type: PermissionType.button,
        sort: 18,
      },
      {
        code: 'reservation:view',
        nameZh: '查看预定',
        nameVi: 'Xem đặt bàn',
        type: PermissionType.button,
        sort: 19,
      },
      {
        code: 'reservation:edit',
        nameZh: '编辑预定',
        nameVi: 'Sửa đặt bàn',
        type: PermissionType.button,
        sort: 20,
      },
      {
        code: 'group_meal:view',
        nameZh: '查看团餐询单',
        nameVi: 'Xem đặt suất nhóm',
        type: PermissionType.button,
        sort: 21,
      },
      {
        code: 'group_meal:edit',
        nameZh: '处理团餐询单',
        nameVi: 'Xử lý đặt suất nhóm',
        type: PermissionType.button,
        sort: 22,
      },
      {
        code: 'group_meal:delete',
        nameZh: '删除团餐询单',
        nameVi: 'Xóa đặt suất nhóm',
        type: PermissionType.button,
        sort: 22,
      },
      {
        code: 'chat:reply',
        nameZh: '回复顾客消息',
        nameVi: 'Trả lời tin nhắn',
        type: PermissionType.button,
        sort: 23,
      },
      {
        code: 'chat:mute',
        nameZh: '禁言顾客会话',
        nameVi: 'Tắt tiếng hội thoại',
        type: PermissionType.button,
        sort: 24,
      },
      {
        code: 'audit:view',
        nameZh: '查看审计日志',
        nameVi: 'Xem nhật ký kiểm toán',
        type: PermissionType.button,
        sort: 25,
      },
    ],
  },
];

const ROLE_PERMS: Record<string, string[] | '*'> = {
  super_admin: '*',
  manager: [
    'menu:dish',
    'menu:combo',
    'menu:cashier',
    'menu:table',
    'menu:reservation',
    'menu:group-meal',
    'menu:order',
    'menu:kitchen',
    'menu:member',
    'menu:marketing',
    'menu:delivery',
    'menu:chat',
    'menu:print',
    'menu:asset',
    'menu:inventory',
    'menu:hr',
    'menu:report',
    'menu:finance',
    'menu:system',
    'menu:system:user',
    'menu:system:settings',
    'menu:dish:edit',
    'menu:dish:sold-out',
    'chat:reply',
    'chat:mute',
    'table:open',
    'order:create',
    'order:add-item',
    'order:void-item',
    'order:cancel',
    'order:discount',
    'order:checkout',
    'order:refund',
    'delivery:accept',
    'delivery:delete',
    'print:reprint',
    'asset:scrap',
    'asset:sell',
    'report:view',
    'hr:edit',
    'hr:payroll',
    'member:edit',
    'marketing:edit',
    'combo:view',
    'combo:edit',
    'reservation:view',
    'reservation:edit',
    'group_meal:view',
    'group_meal:edit',
    'group_meal:delete',
  ],
  cashier: [
    'menu:dish',
    'menu:combo',
    'menu:cashier',
    'menu:table',
    'menu:reservation',
    'menu:group-meal',
    'menu:order',
    'menu:kitchen',
    'menu:member',
    'menu:delivery',
    'menu:print',
    'menu:dish:sold-out',
    'table:open',
    'order:create',
    'order:add-item',
    // 一线收银需能退错菜 / 取消未结账订单，避免卡台找店长
    'order:void-item',
    'order:cancel',
    'order:discount',
    'order:checkout',
    'delivery:accept',
    'print:reprint',
    'member:edit',
    'combo:view',
    'reservation:view',
    'reservation:edit',
    'group_meal:view',
    'group_meal:edit',
  ],
  waiter: [
    'menu:dish',
    'menu:combo',
    'menu:cashier',
    'menu:table',
    'menu:reservation',
    'menu:group-meal',
    'menu:order',
    'menu:kitchen',
    'table:open',
    'order:create',
    'order:add-item',
    'combo:view',
    'reservation:view',
    'group_meal:view',
  ],
  // 厨房：看板 + 估清；不可改价/增删菜
  kitchen: ['menu:kitchen', 'menu:order', 'menu:dish', 'menu:dish:sold-out'],
};

const DISHES: Array<{
  cat: number;
  nameZh: string;
  nameVi: string;
  price: number;
  station: 'hot' | 'drink';
}> = [
  { cat: 0, nameZh: '宫保鸡丁', nameVi: 'Gà Kung Pao', price: 89000, station: 'hot' },
  { cat: 0, nameZh: '鱼香肉丝', nameVi: 'Thịt xào chua ngọt', price: 85000, station: 'hot' },
  { cat: 0, nameZh: '麻婆豆腐', nameVi: 'Đậu phụ Mapo', price: 65000, station: 'hot' },
  { cat: 0, nameZh: '回锅肉', nameVi: 'Thịt ba chỉ xào', price: 95000, station: 'hot' },
  { cat: 1, nameZh: '西红柿炒蛋', nameVi: 'Trứng xào cà chua', price: 55000, station: 'hot' },
  { cat: 1, nameZh: '清炒时蔬', nameVi: 'Rau xào', price: 45000, station: 'hot' },
  { cat: 1, nameZh: '干煸四季豆', nameVi: 'Đậu que khô', price: 58000, station: 'hot' },
  { cat: 1, nameZh: '蒜蓉西兰花', nameVi: 'Bông cải tỏi', price: 52000, station: 'hot' },
  { cat: 2, nameZh: '酸辣汤', nameVi: 'Canh chua cay', price: 42000, station: 'hot' },
  { cat: 2, nameZh: '番茄蛋花汤', nameVi: 'Canh cà chua trứng', price: 38000, station: 'hot' },
  { cat: 2, nameZh: '紫菜蛋花汤', nameVi: 'Canh rong biển', price: 35000, station: 'hot' },
  { cat: 2, nameZh: '玉米排骨汤', nameVi: 'Canh sườn bắp', price: 68000, station: 'hot' },
  { cat: 3, nameZh: '白米饭', nameVi: 'Cơm trắng', price: 10000, station: 'hot' },
  { cat: 3, nameZh: '蛋炒饭', nameVi: 'Cơm chiên trứng', price: 45000, station: 'hot' },
  { cat: 3, nameZh: '牛肉面', nameVi: 'Mì bò', price: 75000, station: 'hot' },
  { cat: 3, nameZh: '葱油拌面', nameVi: 'Mì dầu hành', price: 48000, station: 'hot' },
  { cat: 4, nameZh: '柠檬茶', nameVi: 'Trà chanh', price: 25000, station: 'drink' },
  { cat: 4, nameZh: '可乐', nameVi: 'Coca Cola', price: 20000, station: 'drink' },
  { cat: 4, nameZh: '鲜榨橙汁', nameVi: 'Nước cam ép', price: 35000, station: 'drink' },
  { cat: 4, nameZh: '豆浆', nameVi: 'Sữa đậu nành', price: 18000, station: 'drink' },
];

function token(): string {
  return randomBytes(16).toString('hex');
}

async function upsertPermissions(): Promise<Map<string, bigint>> {
  const map = new Map<string, bigint>();

  async function walk(nodes: PermDef[], parentId: bigint | null) {
    for (const node of nodes) {
      const row = await prisma.permission.upsert({
        where: { code: node.code },
        update: {
          nameZh: node.nameZh,
          nameVi: node.nameVi,
          type: node.type,
          parentId,
          path: node.path,
          sort: node.sort,
        },
        create: {
          code: node.code,
          nameZh: node.nameZh,
          nameVi: node.nameVi,
          type: node.type,
          parentId,
          path: node.path,
          sort: node.sort,
        },
      });
      map.set(node.code, row.id);
      if (node.children?.length) {
        await walk(node.children, row.id);
      }
    }
  }

  await walk(PERMISSION_TREE, null);
  return map;
}

async function main() {
  const permMap = await upsertPermissions();

  const roles = [
    { code: 'super_admin', nameZh: '超级管理员', nameVi: 'Siêu quản trị', isSystem: true },
    { code: 'manager', nameZh: '管理员/店长', nameVi: 'Quản lý cửa hàng', isSystem: true },
    { code: 'cashier', nameZh: '收银员', nameVi: 'Thu ngân', isSystem: true },
    { code: 'waiter', nameZh: '服务员', nameVi: 'Phục vụ', isSystem: true },
    { code: 'kitchen', nameZh: '厨房', nameVi: 'Bếp', isSystem: true },
  ];

  const roleIds = new Map<string, bigint>();
  for (const r of roles) {
    const row = await prisma.role.upsert({
      where: { code: r.code },
      update: { nameZh: r.nameZh, nameVi: r.nameVi, isSystem: r.isSystem },
      create: r,
    });
    roleIds.set(r.code, row.id);
  }

  for (const [code, allowed] of Object.entries(ROLE_PERMS)) {
    const roleId = roleIds.get(code)!;
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    const codes = allowed === '*' ? [...permMap.keys()] : allowed;
    for (const p of codes) {
      const permissionId = permMap.get(p);
      if (!permissionId) continue;
      await prisma.rolePermission.create({ data: { roleId, permissionId } });
    }
  }

  const store = await prisma.store.upsert({
    where: { id: 1 },
    update: {
      nameZh: '好运中餐厅',
      nameVi: 'Nhà hàng May Mắn',
      qrOrderNeedConfirm: true,
      qrAutoOpen: true,
      qrRequirePin: true,
      deliveryRadiusKm: 5,
      deliveryFeeRules: [
        { maxKm: 2, fee: 15000 },
        { maxKm: 5, fee: 25000 },
      ],
      minOrderAmount: 80000,
      businessHours: { open: '09:00', close: '22:00', days: [0, 1, 2, 3, 4, 5, 6] },
      lat: 10.9742806,
      lng: 106.6272538,
      homeBanners: [
        {
          image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800',
          titleZh: '精选美食·限时特惠',
          titleVi: 'Món ngon - ưu đãi',
          link: '/shop',
        },
      ],
      storefrontImage:
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
      envGallery: [
        {
          image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
          captionZh: '门头外观',
          captionVi: 'Mặt tiền',
        },
        {
          image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
          captionZh: '用餐环境',
          captionVi: 'Không gian nhà hàng',
        },
        {
          image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
          captionZh: '菜品展示',
          captionVi: 'Không gian ẩm thực',
        },
      ],
      aiSettings: {
        enabled: false,
        provider: 'openai',
        apiBase: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
      },
    },
    create: {
      id: 1,
      nameZh: '好运中餐厅',
      nameVi: 'Nhà hàng May Mắn',
      address: '123 Nguyễn Trãi, Quận 5, TP.HCM',
      phone: '02812345678',
      serviceChargeRate: 0,
      taxRate: 0,
      deliveryRadiusKm: 5,
      deliveryFeeRules: [
        { maxKm: 2, fee: 15000 },
        { maxKm: 5, fee: 25000 },
      ],
      minOrderAmount: 80000,
      businessHours: { open: '09:00', close: '22:00', days: [0, 1, 2, 3, 4, 5, 6] },
      lat: 10.9742806,
      lng: 106.6272538,
      qrOrderNeedConfirm: true,
      qrAutoOpen: true,
      qrRequirePin: true,
      homeBanners: [
        {
          image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800',
          titleZh: '精选美食·限时特惠',
          titleVi: 'Món ngon - ưu đãi',
          link: '/shop',
        },
      ],
      storefrontImage:
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
      envGallery: [
        {
          image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
          captionZh: '门头外观',
          captionVi: 'Mặt tiền',
        },
        {
          image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
          captionZh: '用餐环境',
          captionVi: 'Không gian nhà hàng',
        },
        {
          image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
          captionZh: '菜品展示',
          captionVi: 'Không gian ẩm thực',
        },
      ],
      aiSettings: {
        enabled: false,
        provider: 'openai',
        apiBase: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
      },
    },
  });

  const passwordHash = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash,
      displayName: '超级管理员',
      status: UserStatus.active,
      lang: UserLang.zh,
      storeId: store.id,
    },
    create: {
      username: 'admin',
      passwordHash,
      displayName: '超级管理员',
      phone: '0900000000',
      lang: UserLang.zh,
      status: UserStatus.active,
      storeId: store.id,
    },
  });

  await prisma.userRole.deleteMany({ where: { userId: admin.id } });
  await prisma.userRole.create({
    data: { userId: admin.id, roleId: roleIds.get('super_admin')! },
  });

  const cashierHash = await bcrypt.hash('Cashier@123', 10);
  const cashier = await prisma.user.upsert({
    where: { username: 'cashier' },
    update: {
      passwordHash: cashierHash,
      displayName: '收银员',
      status: UserStatus.active,
      lang: UserLang.zh,
      storeId: store.id,
    },
    create: {
      username: 'cashier',
      passwordHash: cashierHash,
      displayName: '收银员',
      phone: '0900000001',
      lang: UserLang.zh,
      status: UserStatus.active,
      storeId: store.id,
    },
  });
  await prisma.userRole.deleteMany({ where: { userId: cashier.id } });
  await prisma.userRole.create({
    data: { userId: cashier.id, roleId: roleIds.get('cashier')! },
  });

  const hot = await prisma.kitchenStation.upsert({
    where: { id: 1 },
    update: { nameZh: '热菜', nameVi: 'Món nóng', storeId: store.id },
    create: { id: 1, storeId: store.id, nameZh: '热菜', nameVi: 'Món nóng' },
  });
  const drink = await prisma.kitchenStation.upsert({
    where: { id: 2 },
    update: { nameZh: '饮品', nameVi: 'Đồ uống', storeId: store.id },
    create: { id: 2, storeId: store.id, nameZh: '饮品', nameVi: 'Đồ uống' },
  });

  const catDefs = [
    { nameZh: '热炒', nameVi: 'Món xào', stationId: hot.id },
    { nameZh: '素菜', nameVi: 'Món chay', stationId: hot.id },
    { nameZh: '汤品', nameVi: 'Canh', stationId: hot.id },
    { nameZh: '主食', nameVi: 'Món chính', stationId: hot.id },
    { nameZh: '饮品', nameVi: 'Đồ uống', stationId: drink.id },
  ];

  const categories = [];
  for (let i = 0; i < catDefs.length; i++) {
    const c = catDefs[i];
    const row = await prisma.category.upsert({
      where: { id: i + 1 },
      update: {
        nameZh: c.nameZh,
        nameVi: c.nameVi,
        kitchenStationId: c.stationId,
        storeId: store.id,
        sort: i + 1,
        isActive: true,
      },
      create: {
        id: i + 1,
        storeId: store.id,
        kitchenStationId: c.stationId,
        nameZh: c.nameZh,
        nameVi: c.nameVi,
        sort: i + 1,
        isActive: true,
      },
    });
    categories.push(row);
  }

  for (let i = 0; i < DISHES.length; i++) {
    const d = DISHES[i];
    await prisma.dish.upsert({
      where: { id: i + 1 },
      update: {
        nameZh: d.nameZh,
        nameVi: d.nameVi,
        price: BigInt(d.price),
        takeawayPrice: BigInt(d.price),
        categoryId: categories[d.cat].id,
        storeId: store.id,
        status: 'on',
        stock: null,
        soldToday: 0,
        sort: i + 1,
        isNew: i < 3,
      },
      create: {
        id: i + 1,
        storeId: store.id,
        categoryId: categories[d.cat].id,
        nameZh: d.nameZh,
        nameVi: d.nameVi,
        descZh: d.nameZh,
        descVi: d.nameVi,
        price: BigInt(d.price),
        takeawayPrice: BigInt(d.price),
        unit: '份',
        status: 'on',
        stock: null,
        sort: i + 1,
        isDineIn: true,
        isDelivery: true,
        isNew: i < 3,
      },
    });
  }

  // 示例规格：前 3 个菜品加「份量 / 辣度」
  for (let dishId = 1; dishId <= 3; dishId++) {
    await prisma.dishOption.deleteMany({ where: { dishId: BigInt(dishId) } });
    const sizeOpts = [
      { zh: '小份', vi: 'Nhỏ', extra: 0 },
      { zh: '中份', vi: 'Vừa', extra: 10000 },
      { zh: '大份', vi: 'Lớn', extra: 20000 },
    ];
    const spiceOpts = [
      { zh: '微辣', vi: 'Ít cay', extra: 0 },
      { zh: '中辣', vi: 'Vừa cay', extra: 0 },
      { zh: '爆辣', vi: 'Cực cay', extra: 0 },
    ];
    let sort = 0;
    for (const o of sizeOpts) {
      await prisma.dishOption.create({
        data: {
          dishId: BigInt(dishId),
          groupNameZh: '份量',
          groupNameVi: 'Khẩu phần',
          optionNameZh: o.zh,
          optionNameVi: o.vi,
          extraPrice: BigInt(o.extra),
          required: true,
          multi: false,
          sort: sort++,
        },
      });
    }
    for (const o of spiceOpts) {
      await prisma.dishOption.create({
        data: {
          dishId: BigInt(dishId),
          groupNameZh: '辣度',
          groupNameVi: 'Độ cay',
          optionNameZh: o.zh,
          optionNameVi: o.vi,
          extraPrice: BigInt(o.extra),
          required: true,
          multi: false,
          sort: sort++,
        },
      });
    }
  }

  await prisma.storeNotice.upsert({
    where: { id: 1 },
    update: {
      titleZh: '店铺装修通知',
      titleVi: 'Thông báo sửa chữa',
      contentZh: '本周末厨房局部装修，请提前电话确认营业时间，避免白跑。',
      contentVi: 'Cuối tuần bếp sửa chữa một phần, vui lòng gọi xác nhận giờ mở cửa.',
      level: 'warn',
      isActive: true,
      sort: 0,
    },
    create: {
      id: 1,
      storeId: store.id,
      titleZh: '店铺装修通知',
      titleVi: 'Thông báo sửa chữa',
      contentZh: '本周末厨房局部装修，请提前电话确认营业时间，避免白跑。',
      contentVi: 'Cuối tuần bếp sửa chữa một phần, vui lòng gọi xác nhận giờ mở cửa.',
      level: 'warn',
      isActive: true,
      sort: 0,
    },
  });
  await prisma.storeNotice.upsert({
    where: { id: 2 },
    update: {
      titleZh: '新品上架',
      titleVi: 'Món mới',
      contentZh: '本周推出季节限定新品，欢迎品鉴。',
      contentVi: 'Tuần này có món theo mùa, mời quý khách thưởng thức.',
      level: 'info',
      isActive: true,
      sort: 1,
    },
    create: {
      id: 2,
      storeId: store.id,
      titleZh: '新品上架',
      titleVi: 'Món mới',
      contentZh: '本周推出季节限定新品，欢迎品鉴。',
      contentVi: 'Tuần này có món theo mùa, mời quý khách thưởng thức.',
      level: 'info',
      isActive: true,
      sort: 1,
    },
  });

  const areaA = await prisma.area.upsert({
    where: { id: 1 },
    update: { nameZh: '大厅', nameVi: 'Sảnh chính', storeId: store.id },
    create: { id: 1, storeId: store.id, nameZh: '大厅', nameVi: 'Sảnh chính', sort: 1 },
  });
  const areaB = await prisma.area.upsert({
    where: { id: 2 },
    update: { nameZh: '包间', nameVi: 'Phòng VIP', storeId: store.id },
    create: { id: 2, storeId: store.id, nameZh: '包间', nameVi: 'Phòng VIP', sort: 2 },
  });

  for (let i = 1; i <= 10; i++) {
    const inHall = i <= 6;
    const code = inHall ? `A${String(i).padStart(2, '0')}` : `B${String(i - 6).padStart(2, '0')}`;
    await prisma.table.upsert({
      where: { storeId_code: { storeId: store.id, code } },
      update: {
        seats: inHall ? 4 : 8,
        areaId: inHall ? areaA.id : areaB.id,
        status: 'idle',
      },
      create: {
        storeId: store.id,
        areaId: inHall ? areaA.id : areaB.id,
        code,
        seats: inHall ? 4 : 8,
        status: 'idle',
        qrToken: token(),
      },
    });
  }

  // 生产 seed 必须用 PRINT_AGENT_SEED_SECRET；本地默认仅便于联调
  const agentSecret =
    (process.env.PRINT_AGENT_SEED_SECRET || '').trim() ||
    (process.env.NODE_ENV === 'production' ? '' : 'dev-agent-secret');
  if (!agentSecret || agentSecret.length < 16) {
    throw new Error(
      'PRINT_AGENT_SEED_SECRET 未配置或过短（≥16）。生产禁止使用默认 dev-agent-secret。',
    );
  }
  if (process.env.NODE_ENV === 'production' && agentSecret === 'dev-agent-secret') {
    throw new Error('生产环境禁止使用 PRINT_AGENT_SEED_SECRET=dev-agent-secret');
  }
  const agent = await prisma.printAgent.upsert({
    where: { id: 1 },
    update: {
      name: '前台电脑代理',
      storeId: store.id,
      secretHash: await bcrypt.hash(agentSecret, 10),
      status: 'offline',
    },
    create: {
      id: 1,
      storeId: store.id,
      name: '前台电脑代理',
      secretHash: await bcrypt.hash(agentSecret, 10),
      status: 'offline',
    },
  });

  // 网口演示机默认停用，避免与 USB 静默机抢单；测网口时再手动启用
  await prisma.printer.upsert({
    where: { id: 1 },
    update: {
      name: '前台小票机',
      ip: '127.0.0.1',
      port: 9100,
      paperWidth: 80,
      role: 'front',
      agentId: agent.id,
      storeId: store.id,
      isActive: false,
    },
    create: {
      id: 1,
      storeId: store.id,
      name: '前台小票机',
      ip: '127.0.0.1',
      port: 9100,
      paperWidth: 80,
      role: 'front',
      agentId: agent.id,
      isActive: false,
    },
  });
  await prisma.printer.upsert({
    where: { id: 2 },
    update: {
      name: '热菜档口',
      ip: '127.0.0.1',
      port: 9101,
      paperWidth: 58,
      role: 'kitchen',
      stationId: hot.id,
      agentId: agent.id,
      storeId: store.id,
      isActive: false,
    },
    create: {
      id: 2,
      storeId: store.id,
      name: '热菜档口',
      ip: '127.0.0.1',
      port: 9101,
      paperWidth: 58,
      role: 'kitchen',
      stationId: hot.id,
      agentId: agent.id,
      isActive: false,
    },
  });
  await prisma.printer.upsert({
    where: { id: 3 },
    update: {
      name: '饮品档口',
      ip: '127.0.0.1',
      port: 9102,
      paperWidth: 58,
      role: 'kitchen',
      stationId: drink.id,
      agentId: agent.id,
      storeId: store.id,
      isActive: false,
    },
    create: {
      id: 3,
      storeId: store.id,
      name: '饮品档口',
      ip: '127.0.0.1',
      port: 9102,
      paperWidth: 58,
      role: 'kitchen',
      stationId: drink.id,
      agentId: agent.id,
      isActive: false,
    },
  });

  // 小店推荐：收银电脑 Xprinter 58mm USB → print-agent Windows RAW 静默（默认启用）
  await prisma.printer.upsert({
    where: { id: 4 },
    update: {
      name: 'Xprinter 58 USB',
      // Windows「打印机与扫描仪」队列名，须与系统完全一致（本机曾用 XP-58 (副本 1)）
      ip: 'XP-58',
      port: 9100,
      paperWidth: 58,
      role: 'front',
      connectionType: 'agent_usb',
      acceptAllTickets: true,
      agentId: agent.id,
      stationId: null,
      storeId: store.id,
      isActive: true,
    },
    create: {
      id: 4,
      storeId: store.id,
      name: 'Xprinter 58 USB',
      ip: 'XP-58',
      port: 9100,
      paperWidth: 58,
      role: 'front',
      connectionType: 'agent_usb',
      acceptAllTickets: true,
      agentId: agent.id,
      isActive: true,
    },
  });

  // ---- 会员等级 / 营销演示 ----
  const levelBronze = await prisma.memberLevel.upsert({
    where: { id: 1 },
    update: {
      storeId: store.id,
      nameZh: '普通会员',
      nameVi: 'Thành viên thường',
      minPoints: 0,
      minSpend: 0,
      discountPercent: 0,
      birthdayBonusPoints: 50,
      deliveryFeeOff: 5000,
      priorityReserve: true,
      priorityDelivery: false,
      birthdayGift: true,
      sort: 1,
      isActive: true,
    },
    create: {
      id: 1,
      storeId: store.id,
      nameZh: '普通会员',
      nameVi: 'Thành viên thường',
      minPoints: 0,
      minSpend: 0,
      discountPercent: 0,
      birthdayBonusPoints: 50,
      deliveryFeeOff: 5000,
      priorityReserve: true,
      priorityDelivery: false,
      birthdayGift: true,
      sort: 1,
      isActive: true,
    },
  });
  await prisma.memberLevel.upsert({
    where: { id: 2 },
    update: {
      storeId: store.id,
      nameZh: '银卡',
      nameVi: 'Thẻ bạc',
      minPoints: 500,
      minSpend: 2000000,
      discountPercent: 5,
      birthdayBonusPoints: 100,
      deliveryFeeOff: 15000,
      priorityReserve: true,
      priorityDelivery: true,
      birthdayGift: true,
      sort: 2,
      isActive: true,
    },
    create: {
      id: 2,
      storeId: store.id,
      nameZh: '银卡',
      nameVi: 'Thẻ bạc',
      minPoints: 500,
      minSpend: 2000000,
      discountPercent: 5,
      birthdayBonusPoints: 100,
      deliveryFeeOff: 15000,
      priorityReserve: true,
      priorityDelivery: true,
      birthdayGift: true,
      sort: 2,
      isActive: true,
    },
  });
  await prisma.couponTemplate.upsert({
    where: { id: 1 },
    update: {
      storeId: store.id,
      nameZh: '9折优惠券',
      nameVi: 'Giảm 10%',
      type: 'percent',
      value: BigInt(10),
      minSpend: BigInt(100000),
      validDays: 30,
      stackable: false,
      scope: 'order',
      channel: 'all',
      isActive: true,
    },
    create: {
      id: 1,
      storeId: store.id,
      nameZh: '9折优惠券',
      nameVi: 'Giảm 10%',
      type: 'percent',
      value: BigInt(10),
      minSpend: BigInt(100000),
      validDays: 30,
      stackable: false,
      scope: 'order',
      channel: 'all',
      isActive: true,
    },
  });
  await prisma.promoRule.upsert({
    where: { id: 1 },
    update: {
      storeId: store.id,
      nameZh: '整单满20万减2万',
      nameVi: 'Giảm 20k khi đủ 200k',
      type: 'amount',
      value: BigInt(20000),
      minSpend: BigInt(200000),
      scope: 'order',
      channel: 'all',
      isActive: true,
    },
    create: {
      id: 1,
      storeId: store.id,
      nameZh: '整单满20万减2万',
      nameVi: 'Giảm 20k khi đủ 200k',
      type: 'amount',
      value: BigInt(20000),
      minSpend: BigInt(200000),
      scope: 'order',
      channel: 'all',
      isActive: true,
    },
  });
  void levelBronze;

  // ---- 供应商演示 ----
  const supplierDefs = [
    {
      id: 1,
      nameZh: '西贡菜市场批发',
      nameVi: 'Chợ đầu mối Sài Gòn',
      contactName: 'Anh Minh',
      phone: '0901234567',
      address: 'Chợ Bình Điền, Quận 8, TP.HCM',
      note: '蔬菜肉类',
    },
    {
      id: 2,
      nameZh: '调味品商行',
      nameVi: 'Công ty gia vị Việt',
      contactName: 'Chị Lan',
      phone: '0912345678',
      address: 'Quận Tân Bình, TP.HCM',
      note: '油盐酱醋',
    },
  ];
  for (const s of supplierDefs) {
    await prisma.supplier.upsert({
      where: { id: s.id },
      update: {
        storeId: store.id,
        nameZh: s.nameZh,
        nameVi: s.nameVi,
        contactName: s.contactName,
        phone: s.phone,
        address: s.address,
        note: s.note,
        isActive: true,
      },
      create: {
        id: s.id,
        storeId: store.id,
        nameZh: s.nameZh,
        nameVi: s.nameVi,
        contactName: s.contactName,
        phone: s.phone,
        address: s.address,
        note: s.note,
        isActive: true,
      },
    });
  }

  // ---- 采购原料演示 ----
  const ingredientDefs = [
    { id: 1, nameZh: '青菜', nameVi: 'Rau xanh', kind: 'vegetable' as const, unit: 'kg', stock: 20, cost: 15000 },
    { id: 2, nameZh: '猪肉', nameVi: 'Thịt heo', kind: 'vegetable' as const, unit: 'kg', stock: 15, cost: 90000 },
    { id: 3, nameZh: '食用油', nameVi: 'Dầu ăn', kind: 'seasoning' as const, unit: 'L', stock: 30, cost: 45000 },
    { id: 4, nameZh: '生抽', nameVi: 'Xì dầu', kind: 'seasoning' as const, unit: 'chai', stock: 12, cost: 25000 },
    { id: 5, nameZh: '味精', nameVi: 'Bột ngọt', kind: 'seasoning' as const, unit: 'kg', stock: 5, cost: 80000 },
  ];
  for (const ing of ingredientDefs) {
    await prisma.ingredient.upsert({
      where: { id: ing.id },
      update: {
        storeId: store.id,
        nameZh: ing.nameZh,
        nameVi: ing.nameVi,
        kind: ing.kind,
        unit: ing.unit,
        stockQty: ing.stock,
        lastCost: BigInt(ing.cost),
        isActive: true,
      },
      create: {
        id: ing.id,
        storeId: store.id,
        nameZh: ing.nameZh,
        nameVi: ing.nameVi,
        kind: ing.kind,
        unit: ing.unit,
        stockQty: ing.stock,
        lastCost: BigInt(ing.cost),
        isActive: true,
      },
    });
  }

  // 宫保鸡丁演示配方：猪肉 0.2kg + 食用油 0.05L（按名称匹配菜品）
  const kungPao = await prisma.dish.findFirst({
    where: { storeId: store.id, nameZh: '宫保鸡丁' },
  });
  if (kungPao) {
    await prisma.dishRecipe.deleteMany({ where: { dishId: kungPao.id } });
    await prisma.dishRecipe.createMany({
      data: [
        { dishId: kungPao.id, ingredientId: 2n, qty: 0.2 },
        { dishId: kungPao.id, ingredientId: 3n, qty: 0.05 },
      ],
    });
  }

  // 预定 + 预点菜样例（今晚确认后厨房可见）
  const rice = await prisma.dish.findFirst({
    where: { storeId: store.id, nameZh: '白米饭' },
  });
  const demoTable = await prisma.table.findFirst({
    where: { storeId: store.id, code: 'A01' },
  });
  if (kungPao && rice) {
    const reserveAt = new Date();
    reserveAt.setHours(reserveAt.getHours() + 4);
    const existingPreorder = await prisma.reservation.findFirst({
      where: { storeId: store.id, phone: '0909888777', status: 'confirmed' },
    });
    if (!existingPreorder) {
      const resv = await prisma.reservation.create({
        data: {
          storeId: store.id,
          customerName: '预点演示客人',
          phone: '0909888777',
          guestCount: 4,
          reserveAt,
          tableId: demoTable?.id ?? null,
          status: 'confirmed',
          deposit: 100000n,
          remark: 'seed 预点菜演示',
          items: {
            create: [
              {
                dishId: kungPao.id,
                nameZh: kungPao.nameZh,
                nameVi: kungPao.nameVi,
                qty: 2,
                unitPrice: kungPao.price,
                sort: 0,
              },
              {
                dishId: rice.id,
                nameZh: rice.nameZh,
                nameVi: rice.nameVi,
                qty: 4,
                unitPrice: rice.price,
                sort: 1,
              },
            ],
          },
        },
      });
      console.log(`Seed reservation preorder id=${resv.id}`);
    }
  }

  // ---- 资产演示数据 ----
  const ac1 = await prisma.assetCategory.upsert({
    where: { id: 1 },
    update: {
      storeId: store.id,
      nameZh: '厨房设备',
      nameVi: 'Thiết bị bếp',
      depreciationMonths: 60,
    },
    create: {
      id: 1,
      storeId: store.id,
      nameZh: '厨房设备',
      nameVi: 'Thiết bị bếp',
      depreciationMonths: 60,
    },
  });
  const ac2 = await prisma.assetCategory.upsert({
    where: { id: 2 },
    update: {
      storeId: store.id,
      nameZh: '家具',
      nameVi: 'Nội thất',
      depreciationMonths: 36,
    },
    create: {
      id: 2,
      storeId: store.id,
      nameZh: '家具',
      nameVi: 'Nội thất',
      depreciationMonths: 36,
    },
  });

  const ym = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const assetDefs = [
    {
      id: 1,
      no: `ZC-${ym}-0001`,
      categoryId: ac1.id,
      nameZh: '商用冰箱',
      nameVi: 'Tủ lạnh công nghiệp',
      spec: '双门 800L',
      unit: '台',
      location: '后厨',
      supplier: 'Saigon Kitchen Supply',
      unitPrice: 18000000,
      qtyTotal: 2,
      qtyInUse: 2,
      qtyIdle: 0,
      warrantyMonths: 24,
    },
    {
      id: 2,
      no: `ZC-${ym}-0002`,
      categoryId: ac1.id,
      nameZh: '电磁炉',
      nameVi: 'Bếp từ',
      spec: '3500W',
      unit: '台',
      location: '后厨',
      supplier: 'Saigon Kitchen Supply',
      unitPrice: 2500000,
      qtyTotal: 4,
      qtyInUse: 3,
      qtyIdle: 1,
      warrantyMonths: 12,
    },
    {
      id: 3,
      no: `ZC-${ym}-0003`,
      categoryId: ac2.id,
      nameZh: '餐桌',
      nameVi: 'Bàn ăn',
      spec: '1.2m 圆桌',
      unit: '张',
      location: '大厅',
      supplier: 'Nội thất Việt',
      unitPrice: 1200000,
      qtyTotal: 20,
      qtyInUse: 18,
      qtyIdle: 2,
      warrantyMonths: 12,
    },
  ];

  const purchase = new Date();
  purchase.setMonth(purchase.getMonth() - 6);
  for (const a of assetDefs) {
    const warranty = new Date(purchase);
    warranty.setMonth(warranty.getMonth() + a.warrantyMonths);
    await prisma.asset.upsert({
      where: { id: a.id },
      update: {
        storeId: store.id,
        assetNo: a.no,
        categoryId: a.categoryId,
        nameZh: a.nameZh,
        nameVi: a.nameVi,
        spec: a.spec,
        unit: a.unit,
        location: a.location,
        supplier: a.supplier,
        purchaseDate: purchase,
        unitPrice: BigInt(a.unitPrice),
        qtyTotal: a.qtyTotal,
        qtyInUse: a.qtyInUse,
        qtyIdle: a.qtyIdle,
        qtyRepair: 0,
        qtyDisposed: 0,
        warrantyUntil: warranty,
      },
      create: {
        id: a.id,
        storeId: store.id,
        assetNo: a.no,
        categoryId: a.categoryId,
        nameZh: a.nameZh,
        nameVi: a.nameVi,
        spec: a.spec,
        unit: a.unit,
        location: a.location,
        supplier: a.supplier,
        purchaseDate: purchase,
        unitPrice: BigInt(a.unitPrice),
        qtyTotal: a.qtyTotal,
        qtyInUse: a.qtyInUse,
        qtyIdle: a.qtyIdle,
        qtyRepair: 0,
        qtyDisposed: 0,
        warrantyUntil: warranty,
      },
    });
  }

  const groupCombo = await prisma.combo.upsert({
    where: { id: 1 },
    update: {
      nameZh: '商务十人餐',
      nameVi: 'Suất 10 người',
      price: BigInt(1280000),
      takeawayPrice: BigInt(1280000),
      status: 'on',
      isDelivery: true,
      isGroupMeal: true,
      servingSize: 10,
      sort: 1,
    },
    create: {
      id: 1,
      storeId: store.id,
      nameZh: '商务十人餐',
      nameVi: 'Suất 10 người',
      descZh: '适合办公室团建 / 会议配餐',
      descVi: 'Phù hợp tiệc công ty',
      price: BigInt(1280000),
      takeawayPrice: BigInt(1280000),
      status: 'on',
      isDelivery: true,
      isGroupMeal: true,
      servingSize: 10,
      sort: 1,
    },
  });
  await prisma.comboGroup.deleteMany({ where: { comboId: groupCombo.id } });
  const g1 = await prisma.comboGroup.create({
    data: {
      comboId: groupCombo.id,
      nameZh: '主菜',
      nameVi: 'Món chính',
      minSelect: 2,
      maxSelect: 2,
      sort: 0,
    },
  });
  await prisma.comboGroupItem.createMany({
    data: [
      { groupId: g1.id, dishId: 1n, extraPrice: 0n, isDefault: true, sort: 0 },
      { groupId: g1.id, dishId: 2n, extraPrice: 0n, isDefault: true, sort: 1 },
      { groupId: g1.id, dishId: 3n, extraPrice: 20000n, isDefault: false, sort: 2 },
    ],
  });

  // 人事样例：1 长工 + 1 兼职
  const ft = await prisma.employee.upsert({
    where: { id: 1 },
    update: {
      storeId: store.id,
      nameZh: '王全职',
      nameVi: 'Wang Fulltime',
      phone: '0901111222',
      employmentType: 'full_time',
      status: 'active',
      baseSalary: 12_000_000n,
      hiredAt: new Date('2026-01-01T00:00:00.000Z'),
      resignedAt: null,
      remark: 'seed 长工样例（月薪）',
    },
    create: {
      id: 1,
      storeId: store.id,
      nameZh: '王全职',
      nameVi: 'Wang Fulltime',
      phone: '0901111222',
      employmentType: 'full_time',
      status: 'active',
      baseSalary: 12_000_000n,
      hiredAt: new Date('2026-01-01T00:00:00.000Z'),
      remark: 'seed 长工样例（月薪）',
    },
  });
  const pt = await prisma.employee.upsert({
    where: { id: 2 },
    update: {
      storeId: store.id,
      nameZh: '陈兼职',
      nameVi: 'Chen Parttime',
      phone: '0903333444',
      employmentType: 'part_time',
      status: 'active',
      baseSalary: 50_000n,
      hiredAt: new Date('2026-06-01T00:00:00.000Z'),
      resignedAt: null,
      remark: 'seed 兼职样例（时薪）',
    },
    create: {
      id: 2,
      storeId: store.id,
      nameZh: '陈兼职',
      nameVi: 'Chen Parttime',
      phone: '0903333444',
      employmentType: 'part_time',
      status: 'active',
      baseSalary: 50_000n,
      hiredAt: new Date('2026-06-01T00:00:00.000Z'),
      remark: 'seed 兼职样例（时薪）',
    },
  });
  const attDay = new Date();
  attDay.setUTCHours(0, 0, 0, 0);
  const clockIn = new Date(attDay);
  clockIn.setUTCHours(2, 0, 0, 0);
  const clockOut = new Date(attDay);
  clockOut.setUTCHours(10, 0, 0, 0);
  const existingAtt = await prisma.employeeAttendance.findFirst({
    where: { employeeId: pt.id, workDate: attDay },
  });
  if (!existingAtt) {
    await prisma.employeeAttendance.create({
      data: {
        storeId: store.id,
        employeeId: pt.id,
        workDate: attDay,
        clockInAt: clockIn,
        clockOutAt: clockOut,
        workMinutes: 480,
        remark: 'seed 兼职今日班次',
      },
    });
  }
  void ft;

  // eslint-disable-next-line no-console
  console.log('Seed completed: admin/Admin@123 , cashier/Cashier@123');
  console.log(
    'Print agent id=1 secret:',
    agentSecret === 'dev-agent-secret'
      ? 'dev-agent-secret (仅本地；生产请设 PRINT_AGENT_SEED_SECRET)'
      : '(来自 PRINT_AGENT_SEED_SECRET，请写入 print-agent config.json)',
  );
  console.log(
    '上线前请修改默认账号密码，并完成 docs/PRODUCTION_CHECKLIST.md',
  );
  // eslint-disable-next-line no-console
  console.log(`Print agent id=1 secret=${agentSecret}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
