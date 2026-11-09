import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const queueName = process.argv[2] || 'XP-58 (副本 1)';

const updated = await prisma.printer.update({
  where: { id: 4n },
  data: {
    name: 'Xprinter 58 USB',
    ip: queueName,
    connectionType: 'agent_usb',
    agentId: 1n,
    isActive: true,
    acceptAllTickets: true,
    paperWidth: 58,
    role: 'front',
  },
});
await prisma.printer.updateMany({
  where: { id: { in: [1n, 2n, 3n] } },
  data: { isActive: false },
});
console.log(
  JSON.stringify({
    id: updated.id.toString(),
    ip: updated.ip,
    connectionType: updated.connectionType,
    isActive: updated.isActive,
    agentId: updated.agentId?.toString(),
  }),
);
await prisma.$disconnect();
