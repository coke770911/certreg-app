'use strict';

/**
 * 系統日誌：記錄登入、報名歷程、管理端操作與伺服器錯誤，供「系統資訊」頁查詢。
 *
 * 以 JSON Lines 格式依日期 (台北時間) 存放於 <資料目錄>/logs/YYYY-MM-DD.jsonl，
 * 每行一筆，只增不改。超過保存期限的檔案會自動刪除。
 * 不記錄密碼、身分證字號等個資，只記錄帳號、對象與操作摘要。
 * 寫入失敗只輸出到主控台，不影響原本的請求。
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveDataDir } = require('../config/storage');
const { AppError } = require('../errors');

const RETENTION_DAYS = 365;
const MAX_QUERY_DAYS = 92;
const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const CATEGORIES = {
  auth: '登入',
  apply: '報名',
  admin: '管理',
  system: '系統',
  error: '錯誤',
};
const LEVELS = ['info', 'warn', 'error'];

const dateFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' });
/** 台北時間的日期字串 YYYY-MM-DD */
const taipeiDate = (d = new Date()) => dateFormatter.format(d);

const logDir = () => path.join(resolveDataDir(), 'logs');

let writeChain = Promise.resolve();
let lastPruneDate = null;

/** 請求來源資訊 (actor 為登入帳號；代理登入時另記管理員帳號) */
function requestContext(req) {
  return {
    actor: req?.auth?.studentNo ?? null,
    impersonatedBy: req?.auth?.impersonatedBy ?? null,
    ip: req?.ip ?? null,
  };
}

/**
 * 寫入一筆日誌
 * @param {object} entry { category, action, level?, actor?, impersonatedBy?, ip?, target?, detail?, error? }
 */
function writeLog(entry) {
  const record = {
    time: new Date().toISOString(),
    level: LEVELS.includes(entry.level) ? entry.level : 'info',
    category: CATEGORIES[entry.category] ? entry.category : 'system',
    action: String(entry.action ?? ''),
    actor: entry.actor ?? null,
    impersonatedBy: entry.impersonatedBy ?? null,
    ip: entry.ip ?? null,
    target: entry.target ?? null,
    detail: entry.detail ?? null,
    ...(entry.error ? { error: entry.error } : {}),
  };
  const today = taipeiDate();
  const file = path.join(logDir(), `${today}.jsonl`);
  writeChain = writeChain
    .then(async () => {
      await fs.promises.mkdir(logDir(), { recursive: true });
      await fs.promises.appendFile(file, `${JSON.stringify(record)}\n`, 'utf8');
      if (lastPruneDate !== today) {
        lastPruneDate = today;
        await pruneOldLogs();
      }
    })
    .catch((err) => console.error('[log] 日誌寫入失敗：', err.message));
  return record;
}

/** 依請求寫入日誌 (自動帶入操作者與來源 IP) */
function audit(req, category, action, { target = null, detail = null, level = 'info' } = {}) {
  return writeLog({ ...requestContext(req), category, action, target, detail, level });
}

/** 記錄伺服器錯誤 (含堆疊，僅系統管理員可於系統資訊頁查看) */
function logError(err, req = null) {
  return writeLog({
    ...requestContext(req),
    category: 'error',
    level: 'error',
    action: req ? `${req.method} ${req.path}` : '背景程序錯誤',
    target: req ? req.originalUrl.split('?')[0] : null,
    error: {
      name: err?.name ?? 'Error',
      message: String(err?.message ?? err),
      stack: String(err?.stack ?? '').split('\n').slice(0, 15).join('\n'),
    },
  });
}

/** 等待所有排隊中的日誌寫入完成 (測試與關閉服務時使用) */
const flushLogs = () => writeChain;

async function pruneOldLogs() {
  const cutoff = taipeiDate(new Date(Date.now() - RETENTION_DAYS * DAY_MS));
  const files = await fs.promises.readdir(logDir()).catch(() => []);
  await Promise.all(
    files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < cutoff)
      .map((f) => fs.promises.unlink(path.join(logDir(), f)).catch(() => {}))
  );
}

function parseDate(value, fallback, field) {
  if (value == null || value === '') return fallback;
  const s = String(value);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new AppError(400, '日期格式錯誤', field);
  }
  return s;
}

/** 列出 from ~ to (含) 之間的每一天，由新到舊 */
function daysBetween(from, to) {
  const days = [];
  for (let t = Date.parse(`${to}T00:00:00Z`); t >= Date.parse(`${from}T00:00:00Z`); t -= DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

async function readDay(day) {
  const content = await fs.promises.readFile(path.join(logDir(), `${day}.jsonl`), 'utf8').catch(() => '');
  const records = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // 寫入中斷造成的殘缺行直接略過
    }
  }
  return records.reverse();
}

/**
 * 查詢日誌 (由新到舊)
 * @param {object} query { from, to, category, level, q, page }
 */
async function queryLogs(query = {}) {
  const today = taipeiDate();
  const to = parseDate(query.to, today, 'to');
  const from = parseDate(query.from, taipeiDate(new Date(Date.parse(`${to}T00:00:00Z`) - 6 * DAY_MS)), 'from');
  if (from > to) throw new AppError(400, '起始日期不可晚於結束日期', 'from');
  const days = daysBetween(from, to);
  if (days.length > MAX_QUERY_DAYS) throw new AppError(400, `查詢區間最多 ${MAX_QUERY_DAYS} 天`, 'from');

  const category = CATEGORIES[query.category] ? query.category : null;
  const level = LEVELS.includes(query.level) ? query.level : null;
  const keyword = String(query.q ?? '').trim().toLowerCase().slice(0, 100);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const matched = [];
  for (const day of days) {
    for (const r of await readDay(day)) {
      if (category && r.category !== category) continue;
      if (level && r.level !== level) continue;
      if (keyword && !JSON.stringify(r).toLowerCase().includes(keyword)) continue;
      matched.push(r);
    }
  }

  return {
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
    total: matched.length,
    items: matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}

/** 近 7 天各類別筆數 (系統資訊頁摘要) */
async function summarizeRecent() {
  const today = taipeiDate();
  const from = taipeiDate(new Date(Date.parse(`${today}T00:00:00Z`) - 6 * DAY_MS));
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, 0]));
  let todayCount = 0;
  let lastError = null;
  for (const day of daysBetween(from, today)) {
    for (const r of await readDay(day)) {
      if (counts[r.category] != null) counts[r.category] += 1;
      if (day === today) todayCount += 1;
      if (!lastError && r.category === 'error') lastError = r.time;
    }
  }
  return { from, to: today, counts, todayCount, lastError };
}

module.exports = {
  CATEGORIES,
  RETENTION_DAYS,
  taipeiDate,
  writeLog,
  audit,
  logError,
  flushLogs,
  queryLogs,
  summarizeRecent,
};
