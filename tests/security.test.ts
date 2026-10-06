import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateURL, publicAddress, resolvePublic } from '../src/security/url.js';
for (const input of [
  'http://localhost',
  'http://127.0.0.1',
  'http://127.1',
  'http://2130706433',
  'http://0x7f000001',
  'http://0.0.0.0',
  'http://10.0.0.1',
  'http://172.16.0.1',
  'http://192.168.1.1',
  'http://169.254.169.254',
  'http://100.64.0.1',
  'http://[::1]',
  'http://[::ffff:127.0.0.1]',
  'http://[fc00::1]',
  'http://[fe80::1]',
  'ftp://example.com',
  'file:///etc/passwd',
  'https://user:pass@example.com',
  'https://example.com:8080',
  'http://local',
  'http://foo.internal',
  'http://example.com\\@localhost',
  'http://224.0.0.1',
])
  test(`reject ${input}`, () => assert.throws(() => validateURL(input)));
test('public URLs and addresses', () => {
  assert.equal(validateURL('https://example.com/a?q=1#b').href, 'https://example.com/a?q=1');
  assert(publicAddress('93.184.216.34'));
  assert(publicAddress('2606:4700:4700::1111'));
});
test('DNS private or mixed resolution is rejected', async () => {
  const url = validateURL('https://example.com');
  await assert.rejects(resolvePublic(url, async () => [{ address: '10.0.0.1', family: 4 }]));
  await assert.rejects(
    resolvePublic(url, async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '::1', family: 6 },
    ]),
  );
});
test('DNS rebinding checked on each resolution', async () => {
  let count = 0;
  const resolver = async () => [{ address: count++ ? '127.0.0.1' : '93.184.216.34', family: 4 }];
  const url = validateURL('https://example.com');
  assert.equal((await resolvePublic(url, resolver)).address, '93.184.216.34');
  await assert.rejects(resolvePublic(url, resolver));
});
test('DNS failures and empty responses', async () => {
  await assert.rejects(resolvePublic(new URL('https://example.com'), async () => []));
  await assert.rejects(
    resolvePublic(new URL('https://example.com'), async () => {
      throw Error('DNS');
    }),
  );
});
