import { Request } from 'express';
import { getClientIp, getClientMeta, normalizeIp } from './client-ip.util';

describe('client-ip.util', () => {
  it('strips ::ffff: prefix', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('::FFFF:203.0.113.9')).toBe('203.0.113.9');
  });

  it('prefers CF-Connecting-IP over X-Forwarded-For', () => {
    const req = {
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      },
      ip: '::ffff:127.0.0.1',
      socket: { remoteAddress: '::ffff:127.0.0.1' },
    } as unknown as Request;
    expect(getClientIp(req)).toBe('203.0.113.10');
  });

  it('uses leftmost X-Forwarded-For when no CF header', () => {
    const req = {
      headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' },
      ip: '::ffff:127.0.0.1',
      socket: {},
    } as unknown as Request;
    expect(getClientIp(req)).toBe('198.51.100.7');
  });

  it('normalizes req.ip fallback', () => {
    const req = {
      headers: {},
      ip: '::ffff:192.168.1.8',
      socket: { remoteAddress: '::ffff:192.168.1.8' },
    } as unknown as Request;
    expect(getClientIp(req)).toBe('192.168.1.8');
    expect(getClientMeta(req).ip).toBe('192.168.1.8');
  });
});
