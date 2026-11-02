'use strict';

/**
 * 金額轉中文大寫 (對應舊系統 Tools::num2Zh)，用於繳費收據「新台幣 ○○ 元整」
 * 例：1500 -> 壹仟伍佰、1050 -> 壹仟零伍拾、100500 -> 壹拾萬零伍佰
 */

const DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
const UNITS = ['', '拾', '佰', '仟'];
const GROUP_UNITS = ['', '萬', '億', '兆'];

/** 0~9999 的四位數轉換；回傳是否需要在前面補「零」由呼叫端判斷 */
function convertGroup(n) {
  let out = '';
  let pendingZero = false;
  for (let pos = 3; pos >= 0; pos -= 1) {
    const d = Math.floor(n / 10 ** pos) % 10;
    if (d === 0) {
      if (out) pendingZero = true;
      continue;
    }
    if (pendingZero) out += '零';
    pendingZero = false;
    out += DIGITS[d] + UNITS[pos];
  }
  return out;
}

function toChineseAmount(value) {
  const amount = Math.trunc(Number(value));
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`無效的金額：${value}`);
  if (amount === 0) return '零';

  const groups = [];
  for (let n = amount; n > 0; n = Math.floor(n / 10000)) groups.push(n % 10000);

  let out = '';
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const g = groups[i];
    if (g === 0) continue;
    // 非最高組且不足千位時補「零」，例：10,0500 -> 壹拾萬零伍佰
    if (out && (g < 1000 || groups[i + 1] === 0)) out += '零';
    out += convertGroup(g) + GROUP_UNITS[i];
  }
  return out.replace(/零+/g, '零');
}

/**
 * 繳費單金額格：由右至左「元、拾、佰、仟、萬、拾、佰、仟、億、拾、佰」共 11 格，
 * 最高位數左側一格填「$」，其餘留空 (與舊系統相同)。回傳由左至右的 11 格內容。
 */
function toSlipDigits(value) {
  const digits = String(Math.trunc(Number(value))).split('').reverse();
  const cells = [...digits, '$'];
  while (cells.length < 11) cells.push('');
  return cells.slice(0, 11).reverse();
}

module.exports = { toChineseAmount, toSlipDigits };
