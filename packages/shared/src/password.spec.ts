import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPasswordComplex } from './password';

describe('isPasswordComplex', () => {
  it('accepts strong passwords', () => {
    assert.equal(isPasswordComplex('Admin@123'), true);
    assert.equal(isPasswordComplex('Cashier@123'), true);
    assert.equal(isPasswordComplex('hello1234'), true);
  });

  it('rejects weak passwords', () => {
    assert.equal(isPasswordComplex('123456'), false);
    assert.equal(isPasswordComplex('abcdef'), false);
    assert.equal(isPasswordComplex('abc123'), false); // too short
    assert.equal(isPasswordComplex('password'), false);
    assert.equal(isPasswordComplex('短密码12'), false); // non-ascii
    assert.equal(isPasswordComplex(''), false);
  });
});
