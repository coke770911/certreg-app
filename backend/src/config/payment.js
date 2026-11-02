'use strict';

/**
 * 繳費單收款資訊 (銀行帳號等不寫在程式碼中，由 .env 提供)
 *
 * PAY_BANK_ACCOUNT 為 14 碼：單位別 3 碼 + 科目 3 碼 + 編號 7 碼 + 檢查碼 1 碼
 */

require('./database'); // 確保 .env 已載入
const { AppError } = require('../errors');

function resolvePaymentConfig(env = process.env) {
  const account = (env.PAY_BANK_ACCOUNT || '').replace(/[\s-]/g, '');
  const accountName = (env.PAY_ACCOUNT_NAME || '').trim();
  const bankName = (env.PAY_BANK_NAME || '').trim();
  const branchName = (env.PAY_BANK_BRANCH || '').trim();

  if (!/^\d{14}$/.test(account) || !accountName || !bankName || !branchName) {
    console.error('[payment] 繳費單設定不完整：請檢查 .env 的 PAY_BANK_ACCOUNT (14 碼)、PAY_ACCOUNT_NAME、PAY_BANK_NAME、PAY_BANK_BRANCH');
    throw new AppError(503, '繳費單設定未完成，請洽承辦單位');
  }

  return {
    accountName,
    bankName,
    branchName,
    // 繳費單帳號欄位：單位別 / 科目 / 編號 / 檢
    accountParts: [account.slice(0, 3), account.slice(3, 6), account.slice(6, 13), account.slice(13)],
  };
}

module.exports = { resolvePaymentConfig };
