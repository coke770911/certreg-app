'use strict';

/**
 * TWQR 轉帳 QR Code (財金公司跨機構共通規格，交易類別 02 轉帳)
 *
 * 格式：TWQRP://{服務名稱}/158/02/V1?D1=金額&D5=轉入行代碼&D6=轉入帳號&D10=901
 *   - 158：國家代碼 (ISO 3166 台灣)；02：轉帳；V1：版本
 *   - D1：金額，單位為 0.01 元 (500 元寫成 50000)
 *   - D5：轉入銀行代碼 3 碼；D6：轉入帳號 16 碼，不足前方補 0
 *   - D10：幣別 901 (新臺幣)
 * 服務名稱沿用台灣 Pay 的「銀行代碼NTTransfer」，只用英數字，避免各家 APP 對中文編碼方式不同。
 * 部分銀行 APP 不支援帶入金額 (D1)，掃描後需自行輸入，畫面上會同時顯示金額。
 */

const QRCode = require('qrcode');

function buildTwqrPayload({ bankCode, account, amount }) {
  if (!/^\d{3}$/.test(bankCode)) throw new Error('轉入銀行代碼須為 3 碼數字');
  if (!/^\d{1,16}$/.test(account)) throw new Error('轉入帳號須為 1–16 碼數字');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('金額須為正整數');
  const params = [`D1=${amount * 100}`, `D5=${bankCode}`, `D6=${account.padStart(16, '0')}`, 'D10=901'];
  return `TWQRP://${bankCode}NTTransfer/158/02/V1?${params.join('&')}`;
}

/** 產生 QR Code SVG (容錯等級 M，保留 4 格白邊方便掃描) */
function toQrSvg(payload) {
  return QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 });
}

module.exports = { buildTwqrPayload, toQrSvg };
