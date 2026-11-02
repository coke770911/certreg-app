'use strict';

/**
 * 報名紀錄與繳費單規則測試 (純邏輯，不連線資料庫)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { toChineseAmount, toSlipDigits } = require('../src/services/chinese-amount');
const { formatScore } = require('../src/services/my-application-service');
const { resolvePaymentConfig } = require('../src/config/payment');

test('金額轉中文大寫', () => {
  const cases = [
    [0, '零'],
    [5, '伍'],
    [10, '壹拾'],
    [105, '壹佰零伍'],
    [1500, '壹仟伍佰'],
    [1050, '壹仟零伍拾'],
    [2200, '貳仟貳佰'],
    [10000, '壹萬'],
    [10001, '壹萬零壹'],
    [12345, '壹萬貳仟參佰肆拾伍'],
    [100500, '壹拾萬零伍佰'],
    [1000000, '壹佰萬'],
    [100000001, '壹億零壹'],
  ];
  for (const [n, expected] of cases) assert.equal(toChineseAmount(n), expected, `${n}`);
  assert.throws(() => toChineseAmount(-1));
});

test('繳費單金額格：最高位左側填 $，共 11 格', () => {
  assert.deepEqual(toSlipDigits(1500), ['', '', '', '', '', '', '$', '1', '5', '0', '0']);
  assert.deepEqual(toSlipDigits(25000), ['', '', '', '', '', '$', '2', '5', '0', '0', '0']);
  assert.equal(toSlipDigits(1500).length, 11);
});

test('成績顯示：未輸入、-1、空白視為尚無成績', () => {
  assert.equal(formatScore('未輸入'), null);
  assert.equal(formatScore('-1'), null);
  assert.equal(formatScore(null), null);
  assert.equal(formatScore(' 85 '), '85');
});

test('繳費單設定：帳號需為 14 碼並拆成 單位別/科目/編號/檢', () => {
  const env = { PAY_ACCOUNT_NAME: '測試戶名', PAY_BANK_NAME: '測試銀行', PAY_BANK_BRANCH: '測試分行' };
  assert.deepEqual(resolvePaymentConfig({ ...env, PAY_BANK_ACCOUNT: '123-456-7890123-4' }).accountParts, [
    '123',
    '456',
    '7890123',
    '4',
  ]);
  assert.throws(() => resolvePaymentConfig({ ...env, PAY_BANK_ACCOUNT: '12345' }), /繳費單設定未完成/);
  assert.throws(() => resolvePaymentConfig({ PAY_BANK_ACCOUNT: '12345678901234' }), /繳費單設定未完成/);
});
