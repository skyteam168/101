import { resolvePublicStoreId } from './public-store.util';

describe('resolvePublicStoreId', () => {
  const prev = process.env.DEFAULT_STORE_ID;

  afterEach(() => {
    if (prev === undefined) delete process.env.DEFAULT_STORE_ID;
    else process.env.DEFAULT_STORE_ID = prev;
  });

  it('prefers explicit argument', () => {
    process.env.DEFAULT_STORE_ID = '99';
    expect(resolvePublicStoreId('7')).toBe('7');
    expect(resolvePublicStoreId('  8  ')).toBe('8');
  });

  it('falls back to DEFAULT_STORE_ID then 1', () => {
    process.env.DEFAULT_STORE_ID = '42';
    expect(resolvePublicStoreId()).toBe('42');
    expect(resolvePublicStoreId(null)).toBe('42');
    delete process.env.DEFAULT_STORE_ID;
    expect(resolvePublicStoreId('')).toBe('1');
  });
});
