import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getPublicStoreId', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('reads storeId from query and persists', async () => {
    window.history.pushState({}, '', '/shop?storeId=7');
    const { getPublicStoreId } = await import('./store-id');
    expect(getPublicStoreId()).toBe('7');
    expect(sessionStorage.getItem('h5_store_id')).toBe('7');
  });

  it('uses sessionStorage when query absent', async () => {
    sessionStorage.setItem('h5_store_id', '3');
    window.history.pushState({}, '', '/shop');
    const { getPublicStoreId } = await import('./store-id');
    expect(getPublicStoreId()).toBe('3');
  });

  it('falls back to 1', async () => {
    window.history.pushState({}, '', '/');
    const { getPublicStoreId } = await import('./store-id');
    expect(getPublicStoreId()).toBe('1');
  });
});
