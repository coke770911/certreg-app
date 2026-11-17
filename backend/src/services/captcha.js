'use strict';

/**
 * 登入圖片驗證碼 (四碼數字)
 *
 * 伺服器產生驗證碼與圖片 (SVG，數字轉為路徑並加干擾線，圖片中沒有可直接讀取的文字)，
 * 答案只存在伺服器記憶體，前端只拿到編號與圖片。
 * 每個驗證碼只能驗證一次 (不論對錯都作廢)，5 分鐘後過期。
 * 以記憶體保存，服務重啟即失效；PM2 以單一程序執行 (見 ecosystem.config.js)。
 */

const crypto = require('node:crypto');
const svgCaptcha = require('svg-captcha');

const TTL_MS = 5 * 60 * 1000;
// 記憶體上限：大量索取驗證碼時淘汰最舊的
const MAX_ENTRIES = 10000;
const LENGTH = 4;

const store = new Map();

function prune(now) {
  for (const [id, entry] of store) {
    if (entry.expires <= now) store.delete(id);
  }
  // Map 依加入順序迭代，最先加入的就是最舊的
  for (const id of store.keys()) {
    if (store.size <= MAX_ENTRIES) break;
    store.delete(id);
  }
}

/** 產生驗證碼：回傳編號與圖片 (data URI) */
function createCaptcha(now = Date.now()) {
  const code = Array.from({ length: LENGTH }, () => crypto.randomInt(10)).join('');
  const svg = svgCaptcha(code, { width: 120, height: 44, fontSize: 48, noise: 3, color: true });
  const id = crypto.randomUUID();
  store.set(id, { code, expires: now + TTL_MS });
  prune(now);
  return { id, image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
}

/** 驗證並作廢驗證碼；編號不存在、過期或答案錯誤都回傳 false */
function verifyCaptcha(id, answer, now = Date.now()) {
  const entry = typeof id === 'string' ? store.get(id) : undefined;
  if (!entry) return false;
  store.delete(id);
  if (entry.expires <= now) return false;
  const given = Buffer.from(String(answer ?? '').trim());
  const expected = Buffer.from(entry.code);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** 測試用：取得驗證碼答案 */
const peekCaptcha = (id) => store.get(id)?.code;

module.exports = { createCaptcha, verifyCaptcha, peekCaptcha, TTL_MS };
