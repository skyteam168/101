import { CloudPrinterDriver } from './cloud-printer.driver';

describe('CloudPrinterDriver', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'CLOUD_PRINT_WEBHOOK_SECRET') return 'test-secret';
      if (key === 'CLOUD_PRINT_WEBHOOK_TIMEOUT_MS') return '3000';
      return undefined;
    }),
  };

  const job = {
    jobId: '9',
    printer: {
      id: '1',
      name: 'Cloud Front',
      ip: 'http://127.0.0.1:19876/hook',
      paperWidth: 80 as const,
      connectionType: 'cloud' as const,
    },
    payload: {
      template: 'receipt' as const,
      paperWidth: 80 as const,
      data: {
        storeNameZh: '测',
        storeNameVi: 'Test',
        orderNo: 'T1',
        createdAt: new Date().toISOString(),
        items: [],
        total: 0,
      },
    },
  };

  let driver: CloudPrinterDriver;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    driver = new CloudPrinterDriver(config as never);
    fetchMock = jest.spyOn(global, 'fetch' as never) as jest.SpyInstance;
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('returns false when webhook url invalid', async () => {
    const ok = await driver.push({
      ...job,
      printer: { ...job.printer, ip: 'not-a-url' },
    });
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs JSON with secret and returns true on 2xx', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });
    const ok = await driver.push(job);
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:19876/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Print-Secret': 'test-secret',
        }),
      }),
    );
  });

  it('returns false on non-2xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    await expect(driver.push(job)).resolves.toBe(false);
  });
});
