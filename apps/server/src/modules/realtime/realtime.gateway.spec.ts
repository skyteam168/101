import { Events } from '@restaurant/shared';
import { RealtimeGateway } from './realtime.gateway';

function mockSocket(auth?: Record<string, unknown>) {
  return {
    id: 'sock-1',
    data: { auth },
    join: jest.fn().mockResolvedValue(undefined),
    handshake: { auth: {}, headers: {} },
  };
}

describe('RealtimeGateway onJoin / print station', () => {
  const jwt = { verifyAsync: jest.fn() };
  const config = { get: jest.fn().mockReturnValue('secret') };
  const prisma = {
    user: { findUnique: jest.fn() },
    printAgent: { findUnique: jest.fn(), update: jest.fn() },
  };
  const events = { emit: jest.fn() };

  let gateway: RealtimeGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new RealtimeGateway(
      jwt as never,
      config as never,
      prisma as never,
      events as never,
    );
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      sockets: { sockets: new Map() },
    } as never;
  });

  it('onJoin allows staff into store rooms', async () => {
    const client = mockSocket({ typ: 'staff', storeId: '1', userId: '9' });
    const r = await gateway.onJoin(client as never, { room: 'store:1:kitchen' });
    expect(r).toEqual({ ok: true, room: 'store:1:kitchen' });
    expect(client.join).toHaveBeenCalledWith('store:1:kitchen');
  });

  it('onJoin denies guest joining other table room', async () => {
    const client = mockSocket({ typ: 'guest', sessionId: '10' });
    const r = await gateway.onJoin(client as never, { room: 'table:99' });
    expect(r).toEqual({ ok: false });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('onJoin allows guest into own table room', async () => {
    const client = mockSocket({ typ: 'guest', sessionId: '10' });
    const r = await gateway.onJoin(client as never, { room: 'table:10' });
    expect(r).toEqual({ ok: true, room: 'table:10' });
  });

  it('print station claim requires staff auth', async () => {
    const guest = mockSocket({ typ: 'guest', sessionId: '1' });
    const denied = await gateway.onPrintStationClaim(guest as never, { printerIds: ['1'] });
    expect(denied).toEqual({ ok: false, message: 'UNAUTHORIZED' });

    const staff = mockSocket({ typ: 'staff', storeId: '1', userId: '9' });
    const ok = await gateway.onPrintStationClaim(staff as never, { printerIds: ['3'] });
    expect(ok).toEqual({ ok: true, storeId: '1' });
    expect(staff.join).toHaveBeenCalledWith('store:1:print-station');
    expect(events.emit).toHaveBeenCalledWith(
      Events.PRINT_STATION_CLAIM,
      expect.objectContaining({ storeId: '1', userId: '9' }),
    );
  });

  it('isPrintStationOnline tolerates missing sockets Map', async () => {
    const staff = mockSocket({ typ: 'staff', storeId: '1', userId: '9' });
    await gateway.onPrintStationClaim(staff as never, { printerIds: ['4'] });
    gateway.server = { sockets: {} } as never;
    expect(gateway.isPrintStationOnline('1')).toBe(true);
    expect(gateway.isPrintStationOnline('9')).toBe(false);
  });
});
