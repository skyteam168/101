import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatVND } from './format';
import { localeField } from './locale';

describe('formatVND', () => {
  it('formats integer VND', () => {
    const text = formatVND(125000);
    assert.ok(text.includes('125'));
    assert.ok(text.includes('₫') || text.toUpperCase().includes('VND'));
  });
});

describe('localeField', () => {
  it('picks zh then falls back to vi', () => {
    assert.equal(localeField({ name_zh: '热菜', name_vi: 'Món nóng' }, 'name', 'zh'), '热菜');
    assert.equal(localeField({ name_zh: '', name_vi: 'Món nóng' }, 'name', 'zh'), 'Món nóng');
  });

  it('supports camelCase API fields', () => {
    assert.equal(localeField({ nameZh: '员工管理', nameVi: 'Nhân viên' }, 'name', 'zh'), '员工管理');
    assert.equal(localeField({ nameZh: '员工管理', nameVi: 'Nhân viên' }, 'name', 'vi'), 'Nhân viên');
  });
});

