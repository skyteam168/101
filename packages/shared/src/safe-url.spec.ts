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

  it('rejects private and loopback hosts (SSRF)', () => {
    assert.equal(isSafeExternalHttpUrl('http://127.0.0.1/'), false);
    assert.equal(isSafeExternalHttpUrl('http://localhost:8080/a'), false);
    assert.equal(isSafeExternalHttpUrl('http://192.168.1.1/'), false);
    assert.equal(isSafeExternalHttpUrl('http://10.0.0.8/'), false);
    assert.equal(isSafeExternalHttpUrl('http://169.254.169.254/latest'), false);
    assert.equal(isSafeExternalHttpUrl('http://172.16.0.1/'), false);
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
