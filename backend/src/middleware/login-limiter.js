'use strict';

/**
 * 登入失敗次數限制 (防止暴力破解密碼)
 * 同一來源 IP + 帳號在時間窗內失敗達上限即暫時封鎖；登入成功後清除紀錄。
 * 以記憶體保存，服務重啟即重置；多台主機部署時需改用共用儲存。
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const failures = new Map();

const keyOf = (ip, username) => `${ip}|${String(username ?? '').trim().toLowerCase()}`;

function prune(now) {
  for (const [key, entry] of failures) {
    if (now - entry.first > WINDOW_MS) failures.delete(key);
  }
}

function isBlocked(ip, username, now = Date.now()) {
  prune(now);
  const entry = failures.get(keyOf(ip, username));
  return Boolean(entry && entry.count >= MAX_FAILURES);
}

function recordFailure(ip, username, now = Date.now()) {
  const key = keyOf(ip, username);
  const entry = failures.get(key);
  if (entry && now - entry.first <= WINDOW_MS) entry.count += 1;
  else failures.set(key, { first: now, count: 1 });
}

function clearFailures(ip, username) {
  failures.delete(keyOf(ip, username));
}

module.exports = { isBlocked, recordFailure, clearFailures, MAX_FAILURES };
