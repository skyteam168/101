import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const rows = await prisma.printJob.findMany({
  orderBy: { id: 'desc' },
  take: 5,
  include: { printer: true },
});
console.log(
  rows.map((r) => ({
    id: r.id.toString(),
    status: r.status,
    kind: r.kind,
    error: r.error,
    printer: r.printer?.name,
    ip: r.printer?.ip,
  })),
);
await prisma.$disconnect();
