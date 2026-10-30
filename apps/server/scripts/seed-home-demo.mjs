import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const rows = await p.dish.findMany({
    where: { storeId: 1n, status: 'on' },
    take: 3,
    orderBy: { id: 'asc' },
  });
  for (const r of rows) {
    await p.dish.update({ where: { id: r.id }, data: { isNew: true } });
  }

  const count = await p.storeNotice.count({ where: { storeId: 1n } });
  if (!count) {
    await p.storeNotice.create({
      data: {
        storeId: 1n,
        titleZh: '店铺装修通知',
        titleVi: 'Thông báo sửa chữa',
        contentZh: '本周末厨房局部装修，请提前电话确认营业时间，避免白跑。',
        contentVi: 'Cuối tuần bếp sửa chữa một phần, vui lòng gọi xác nhận giờ mở cửa.',
        level: 'warn',
        isActive: true,
        sort: 0,
      },
    });
    await p.storeNotice.create({
      data: {
        storeId: 1n,
        titleZh: '新品上架',
        titleVi: 'Món mới',
        contentZh: '本周推出季节限定新品，欢迎品鉴。',
        contentVi: 'Tuần này có món theo mùa, mời quý khách thưởng thức.',
        level: 'info',
        isActive: true,
        sort: 1,
      },
    });
  }

  console.log('new dishes', await p.dish.count({ where: { isNew: true } }));
  console.log('notices', await p.storeNotice.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
