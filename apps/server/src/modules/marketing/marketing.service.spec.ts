import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BusinessError } from '../../common/errors/business.error';
import { MarketingService } from './marketing.service';

function makeService(prisma: Record<string, unknown>, audit = { log: async () => undefined }) {
  return new MarketingService(prisma as never, { emit: () => undefined } as never, audit as never);
}

describe('MarketingService.deleteTemplate', () => {
  it('rejects when template missing', async () => {
    const svc = makeService({
      couponTemplate: { findFirst: async () => null },
    });
    await assert.rejects(() => svc.deleteTemplate('1', '9'), (e: unknown) => {
      assert.ok(e instanceof BusinessError);
      assert.equal(e.errorCode, 'COUPON_TEMPLATE_NOT_FOUND');
      return true;
    });
  });

  it('rejects when any coupon already used', async () => {
    const svc = makeService({
      couponTemplate: { findFirst: async () => ({ id: 1n, nameZh: '满减', nameVi: 'GG' }) },
      coupon: { count: async () => 2 },
    });
    await assert.rejects(() => svc.deleteTemplate('1', '1'), (e: unknown) => {
      assert.ok(e instanceof BusinessError);
      assert.equal(e.errorCode, 'COUPON_TEMPLATE_HAS_USED');
      return true;
    });
  });

  it('deletes unused coupons then template', async () => {
    const calls: string[] = [];
    const svc = makeService(
      {
        couponTemplate: {
          findFirst: async () => ({ id: 3n, nameZh: '满减', nameVi: 'GG' }),
        },
        coupon: { count: async () => 0 },
        $transaction: async (fn: (tx: Record<string, unknown>) => Promise<unknown>) =>
          fn({
            coupon: {
              deleteMany: async () => {
                calls.push('coupon.deleteMany');
                return { count: 1 };
              },
            },
            couponTemplate: {
              delete: async () => {
                calls.push('template.delete');
                return {};
              },
            },
          }),
      },
      {
        log: async () => {
          calls.push('audit');
        },
      },
    );
    const res = await svc.deleteTemplate('1', '3', '9');
    assert.deepEqual(res, { ok: true });
    assert.deepEqual(calls, ['coupon.deleteMany', 'template.delete', 'audit']);
  });
});

describe('MarketingService.attachStats via listTemplates', () => {
  it('aggregates claim/use counts per template', async () => {
    const svc = makeService({
      coupon: {
        updateMany: async () => ({ count: 0 }),
        groupBy: async () => [
          { templateId: 1n, status: 'unused', _count: 3 },
          { templateId: 1n, status: 'used', _count: 2 },
          { templateId: 1n, status: 'expired', _count: 1 },
        ],
      },
      couponTemplate: {
        findMany: async () => [
          {
            id: 1n,
            nameZh: 'A',
            nameVi: 'A',
            type: 'amount',
            value: 10000n,
            minSpend: 0n,
            validDays: 7,
            stackable: false,
            scope: 'order',
            dishIds: null,
            channel: 'all',
            isActive: true,
          },
        ],
      },
    });
    const rows = await svc.listTemplates('1');
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].stats, {
      issued: 6,
      unused: 3,
      used: 2,
      expired: 1,
      useRate: 33.3,
    });
  });
});
