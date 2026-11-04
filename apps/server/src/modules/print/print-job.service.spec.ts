import { PrintJobKind, PrintJobStatus, PrinterRole } from '@prisma/client';
import { Events } from '@restaurant/shared';
import { PrintJobService } from './print-job.service';

describe('PrintJobService', () => {
  const prisma = {
    store: { findUnique: jest.fn() },
    printer: { findMany: jest.fn(), findFirst: jest.fn() },
    dish: { findMany: jest.fn() },
    printJob: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    orderBatch: { update: jest.fn() },
  };
  const driver = { push: jest.fn() };
  const browserDriver = { push: jest.fn() };
  const cloudDriver = { push: jest.fn() };
  const events = { emit: jest.fn() };

  let service: PrintJobService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PrintJobService(
      prisma as never,
      driver as never,
      browserDriver as never,
      cloudDriver as never,
      events as never,
    );
  });

  it('handleAck done marks job and emits PRINT_DONE', async () => {
    prisma.printJob.findUnique.mockResolvedValue({
      id: 1n,
      batchId: 2n,
      orderId: 3n,
      retries: 0,
      printer: { storeId: 1n },
    });
    prisma.printJob.update.mockResolvedValue({});
    prisma.orderBatch.update.mockResolvedValue({});

    await service.handleAck('1', 'done');

    expect(prisma.printJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PrintJobStatus.done }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      Events.PRINT_DONE,
      expect.objectContaining({ jobId: '1' }),
    );
  });

  it('handleAck failed retries then emits PRINT_FAILED after 3', async () => {
    prisma.printJob.findUnique.mockResolvedValue({
      id: 1n,
      batchId: null,
      orderId: 3n,
      retries: 2,
      printer: { storeId: 1n },
    });
    prisma.printJob.update.mockResolvedValue({});

    await service.handleAck('1', 'failed', 'tcp error');

    expect(prisma.printJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PrintJobStatus.failed,
          retries: 3,
        }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      Events.PRINT_FAILED,
      expect.objectContaining({ jobId: '1', error: 'tcp error' }),
    );
  });

  it('printBatch creates front + kitchen jobs by station', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: 1n,
      nameZh: '店',
      nameVi: 'Shop',
      address: null,
      phone: null,
      printSplitItem: false,
    });
    prisma.printer.findMany.mockResolvedValue([
      {
        id: 10n,
        paperWidth: 80,
        role: PrinterRole.front,
        agentId: 1n,
        stationId: null,
        station: null,
        connectionType: 'network',
        acceptAllTickets: false,
        storeId: 1n,
      },
      {
        id: 11n,
        paperWidth: 58,
        role: PrinterRole.kitchen,
        agentId: 1n,
        stationId: 1n,
        station: { nameZh: '热菜', nameVi: 'Hot' },
        connectionType: 'network',
        acceptAllTickets: false,
        storeId: 1n,
      },
    ]);
    prisma.dish.findMany.mockResolvedValue([
      { id: 100n, category: { kitchenStationId: 1n } },
    ]);
    prisma.printJob.create.mockImplementation(async ({ data }: { data: { kind: PrintJobKind } }) => ({
      id: data.kind === PrintJobKind.order_front ? 1n : 2n,
      ...data,
    }));
    prisma.printJob.findUnique.mockResolvedValue(null);
    driver.push.mockResolvedValue(false);

    // dispatchJob early-returns when findUnique null — stub create path only
    const createSpy = jest.spyOn(service, 'dispatchJob').mockResolvedValue(undefined);

    await service.printBatch(
      '1',
      {
        id: '9',
        orderNo: 'D1',
        type: 'dine_in',
        tableCode: 'A01',
        remark: null,
        subtotal: 1000,
        discount: 0,
        serviceCharge: 0,
        deliveryFee: 0,
        total: 1000,
        paidAmount: 0,
        batches: [
          {
            id: '5',
            roundNo: 1,
            items: [
              {
                id: 'i1',
                dishId: '100',
                nameZh: '宫保鸡丁',
                nameVi: 'Gà',
                qty: 1,
                unitPrice: 1000,
                amount: 1000,
                status: 'pending',
              },
            ],
          },
        ],
      },
      '5',
    );

    expect(prisma.printJob.create).toHaveBeenCalled();
    const kinds = prisma.printJob.create.mock.calls.map(
      (c: [{ data: { kind: PrintJobKind } }]) => c[0].data.kind,
    );
    expect(kinds).toContain(PrintJobKind.order_front);
    expect(kinds).toContain(PrintJobKind.order_kitchen);
    createSpy.mockRestore();
  });

  it('printBatch routes both roles to acceptAllTickets browser printer', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: 1n,
      nameZh: '店',
      nameVi: 'Shop',
      address: null,
      phone: null,
      printSplitItem: false,
    });
    prisma.printer.findMany.mockResolvedValue([
      {
        id: 40n,
        paperWidth: 80,
        role: PrinterRole.front,
        agentId: null,
        stationId: null,
        station: null,
        connectionType: 'browser_usb',
        acceptAllTickets: true,
        storeId: 1n,
      },
    ]);
    prisma.dish.findMany.mockResolvedValue([
      { id: 100n, category: { kitchenStationId: null } },
    ]);
    prisma.printJob.create.mockImplementation(async ({ data }: { data: { kind: PrintJobKind } }) => ({
      id: BigInt(Math.floor(Math.random() * 1000) + 1),
      ...data,
    }));
    const createSpy = jest.spyOn(service, 'dispatchJob').mockResolvedValue(undefined);

    await service.printBatch(
      '1',
      {
        id: '9',
        orderNo: 'D1',
        type: 'dine_in',
        tableCode: 'A01',
        remark: null,
        subtotal: 1000,
        discount: 0,
        serviceCharge: 0,
        deliveryFee: 0,
        total: 1000,
        paidAmount: 0,
        batches: [
          {
            id: '5',
            roundNo: 1,
            items: [
              {
                id: 'i1',
                dishId: '100',
                nameZh: '宫保鸡丁',
                nameVi: 'Gà',
                qty: 1,
                unitPrice: 1000,
                amount: 1000,
                status: 'pending',
              },
            ],
          },
        ],
      },
      '5',
    );

    const kinds = prisma.printJob.create.mock.calls.map(
      (c: [{ data: { kind: PrintJobKind } }]) => c[0].data.kind,
    );
    expect(kinds).toContain(PrintJobKind.order_front);
    expect(kinds).toContain(PrintJobKind.order_kitchen);
    createSpy.mockRestore();
  });
});
