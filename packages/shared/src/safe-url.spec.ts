import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeExternalHttpUrl, isSafeMediaUrl } from './safe-url';

describe('isSafeExternalHttpUrl', () => {
  it('allows http(s)', () => {
    assert.equal(isSafeExternalHttpUrl('https://example.com/a'), true);
    assert.equal(isSafeExternalHttpUrl('http://example.com'), true);
  });

  it('rejects dangerous schemes', () => {
    assert.equal(isSafeExternalHttpUrl('javascript:alert(1)'), false);
    assert.equal(isSafeExternalHttpUrl('data:text/html,<script>'), false);
    assert.equal(isSafeExternalHttpUrl('vbscript:x'), false);
  });
});

describe('isSafeMediaUrl', () => {
  it('allows uploads path and http images', () => {
    assert.equal(isSafeMediaUrl('/uploads/chat/a.jpg'), true);
    assert.equal(isSafeMediaUrl('https://cdn.example.com/x.png'), true);
  });

  it('rejects path traversal and bad schemes', () => {
    assert.equal(isSafeMediaUrl('/uploads/../etc/passwd'), false);
    assert.equal(isSafeMediaUrl('javascript:alert(1)'), false);
  });
});
