'use strict';

/**
 * 校內認證服務 REST API 驗證測試 (以假的 fetch 模擬回應，不連線實際服務)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyAdCredentials, AdServiceError } = require('../src/services/ad-auth');

const config = { authApiUrl: 'https://auth.example/api.php', authApiKey: 'test-key' };

function mockFetch(t, status, body) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  });
  return calls;
}

test('REST 驗證：成功時送出金鑰與帳密，回傳 ok', async (t) => {
  const calls = mockFetch(t, 200, { Ok: true, Code: 'OK', Result: 'True 登入成功', DisplayName: '王小明' });
  assert.deepEqual(await verifyAdCredentials('d11000001', 'p@ss"<>', config), { ok: true, result: 'True 登入成功' });
  assert.equal(calls[0].url, config.authApiUrl);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-Auth-Key'], 'test-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { Account: 'd11000001', Password: 'p@ss"<>' });
});

test('REST 驗證：帳號或密碼錯誤回傳 ok=false', async (t) => {
  mockFetch(t, 200, { Ok: false, Code: 'INVALID_CREDENTIALS', Result: 'Fail 帳號或密碼錯誤，或找不到使用者帳號。' });
  const r = await verifyAdCredentials('x', 'y', config);
  assert.equal(r.ok, false);
  assert.match(r.result, /^Fail/);
});

test('REST 驗證：金鑰錯誤、IP 不允許、限流、非 JSON 回應、連線失敗都視為服務異常', async (t) => {
  const cases = [
    [401, { Ok: false, Code: 'API_KEY_INVALID' }, /API_KEY_INVALID/],
    [403, { Ok: false, Code: 'IP_DENIED' }, /IP_DENIED/],
    [429, { Ok: false, Code: 'RATE_LIMITED' }, /RATE_LIMITED/],
    [500, '<html>error</html>', /HTTP 500/],
  ];
  for (const [status, body, pattern] of cases) {
    mockFetch(t, status, body);
    await assert.rejects(verifyAdCredentials('x', 'y', config), (err) => err instanceof AdServiceError && pattern.test(err.message));
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('ECONNREFUSED');
  });
  await assert.rejects(verifyAdCredentials('x', 'y', config), /連線失敗/);
});
