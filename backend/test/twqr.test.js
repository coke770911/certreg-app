'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTwqrPayload, toQrSvg } = require('../src/services/twqr');
const { resolveTwqrConfig } = require('../src/config/payment');

test('TWQR：轉帳格式、金額單位 0.01 元、帳號補滿 16 碼', () => {
  assert.equal(
    buildTwqrPayload({ bankCode: '012', account: '12345678901234', amount: 500 }),
    'TWQRP://012NTTransfer/158/02/V1?D1=50000&D5=012&D6=0012345678901234&D10=901'
  );
});

test('TWQR：銀行代碼、帳號、金額格式錯誤時拒絕', () => {
  assert.throws(() => buildTwqrPayload({ bankCode: '12', account: '123', amount: 1 }), /銀行代碼/);
  assert.throws(() => buildTwqrPayload({ bankCode: '012', account: '12345678901234567', amount: 1 }), /帳號/);
  for (const amount of [0, -1, 1.5]) {
    assert.throws(() => buildTwqrPayload({ bankCode: '012', account: '123', amount }), /金額/);
  }
});

test('TWQR：產生 SVG', async () => {
  const svg = await toQrSvg('TWQRP://012NTTransfer/158/02/V1?D1=100&D5=012&D6=0000000000000123&D10=901');
  assert.match(svg, /^<svg[\s\S]*<\/svg>\s*$/);
});

test('TWQR 設定：未設定銀行代碼時停用，格式錯誤時停用', () => {
  assert.equal(resolveTwqrConfig({ PAY_BANK_ACCOUNT: '12345678901234' }), null);
  assert.equal(resolveTwqrConfig({ PAY_BANK_CODE: '12', PAY_BANK_ACCOUNT: '12345678901234' }), null);
  assert.deepEqual(resolveTwqrConfig({ PAY_BANK_CODE: '012', PAY_BANK_ACCOUNT: '1234-5678901234' }), {
    bankCode: '012',
    account: '12345678901234',
    bankName: '',
    accountName: '',
  });
});
