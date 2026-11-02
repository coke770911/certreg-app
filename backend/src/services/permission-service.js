'use strict';

/**
 * 管理端權限設定 (取代原本 .env 的 ADMIN_ACCOUNTS)
 *
 * 存放於 <資料目錄>/permissions.json，由「權限設定」頁維護；正式資料庫禁止建表，因此不存資料庫。
 *
 * 初始狀態 (尚未指定任何「系統管理」帳號)：
 *   沿用舊系統規則，所有教職員 (UserData.us_logid = 'STAFF') 都可使用考試管理與系統管理，
 *   以便第一位承辦人員進入權限設定頁；儲存時必須保留自己的系統管理權限，之後即以設定為準。
 * 首次啟動時若 .env 仍有 ADMIN_ACCOUNTS，會一次性匯入為「代理學生登入」權限，之後不再讀取。
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveDataDir } = require('../config/storage');
const { AppError } = require('../errors');

const ROLES = {
  manage: { label: '考試管理', description: '考試、證照項目、繳費、成績處理與名單匯出' },
  impersonate: { label: '代理學生登入', description: '以「學號/本人帳號」及本人密碼代替學生登入報名' },
  system: { label: '系統管理', description: '查看系統資訊與日誌、設定管理端權限' },
};
const ROLE_KEYS = Object.keys(ROLES);
const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,29}$/;
const MAX_ACCOUNTS = 200;
const MAX_NOTE = 50;

const filePath = () => path.join(resolveDataDir(), 'permissions.json');

// 以修改時間 + 檔案大小判斷是否需重新讀取 (同一毫秒內改寫時 mtime 可能相同)
let cache = { file: null, version: null, data: null };

const emptyData = () => ({ updatedAt: null, updatedBy: null, accounts: [] });

/** 正規化角色清單：只保留已定義的角色，依固定順序排列 */
const normalizeRoles = (roles) => ROLE_KEYS.filter((k) => Array.isArray(roles) && roles.includes(k));

function writeFileAtomic(data) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
  cache = { file: null, version: null, data: null };
}

/** 首次啟動：把舊的 ADMIN_ACCOUNTS 匯入為代理登入權限 */
function importLegacyEnv(env = process.env) {
  const accounts = [...new Set(
    (env.ADMIN_ACCOUNTS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => ACCOUNT_PATTERN.test(s))
  )];
  if (accounts.length === 0) return null;
  const now = new Date().toISOString();
  const data = {
    updatedAt: now,
    updatedBy: 'ADMIN_ACCOUNTS 匯入',
    accounts: accounts.map((account) => ({
      account,
      roles: ['impersonate'],
      note: '由 .env ADMIN_ACCOUNTS 匯入',
      updatedAt: now,
      updatedBy: 'ADMIN_ACCOUNTS 匯入',
    })),
  };
  writeFileAtomic(data);
  return data;
}

/** 讀取權限設定 (檔案未變更時使用快取) */
function loadPermissions() {
  const file = filePath();
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return importLegacyEnv() ?? emptyData();
  }
  const version = `${stat.mtimeMs}:${stat.size}`;
  if (cache.file === file && cache.version === version) return cache.data;

  let data;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = {
      updatedAt: raw.updatedAt ?? null,
      updatedBy: raw.updatedBy ?? null,
      accounts: (Array.isArray(raw.accounts) ? raw.accounts : [])
        .filter((a) => a && ACCOUNT_PATTERN.test(String(a.account ?? '')))
        .map((a) => ({ ...a, roles: normalizeRoles(a.roles) })),
    };
  } catch (err) {
    // 檔案損毀時一律拒絕所有權限 (不退回初始狀態，避免被當成全開)
    console.error(`[permission] 權限設定檔讀取失敗，暫停所有管理權限：${err.message}`);
    data = { ...emptyData(), accounts: [], corrupted: true };
  }
  cache = { file, version, data };
  return data;
}

/** 尚未指定任何系統管理帳號時為初始狀態 */
const isBootstrap = (data = loadPermissions()) =>
  !data.corrupted && !data.accounts.some((a) => a.roles.includes('system'));

/**
 * 計算使用者擁有的權限
 * @param {{us_no: string, us_logid?: string}|null} user UserData 資料
 * @param {string|null} impersonatedBy 代理登入的管理員帳號；代理登入時不給任何管理權限
 */
function getPermissionsFor(user, impersonatedBy = null) {
  if (!user || impersonatedBy) return [];
  const data = loadPermissions();
  const account = String(user.us_no ?? '').trim().toLowerCase();
  const roles = new Set(data.accounts.find((a) => a.account === account)?.roles ?? []);
  if (isBootstrap(data) && String(user.us_logid ?? '').trim() === 'STAFF') {
    roles.add('manage');
    roles.add('system');
  }
  return normalizeRoles([...roles]);
}

/** 可代理學生登入的帳號 */
const listImpersonators = () =>
  loadPermissions()
    .accounts.filter((a) => a.roles.includes('impersonate'))
    .map((a) => a.account);

/** 檢查並整理權限設定輸入 */
function validatePermissionInput(input, actor) {
  const rows = Array.isArray(input?.accounts) ? input.accounts : null;
  if (!rows) throw new AppError(400, '權限設定格式錯誤');
  if (rows.length > MAX_ACCOUNTS) throw new AppError(400, `最多設定 ${MAX_ACCOUNTS} 個帳號`);

  const seen = new Set();
  const accounts = rows.map((row, i) => {
    const account = String(row?.account ?? '').trim().toLowerCase();
    const field = `account-${i}`;
    if (!account) throw new AppError(400, '請輸入帳號', field);
    if (!ACCOUNT_PATTERN.test(account)) throw new AppError(400, `帳號「${account}」格式錯誤`, field);
    if (seen.has(account)) throw new AppError(400, `帳號「${account}」重複`, field);
    seen.add(account);
    const roles = normalizeRoles(row.roles);
    if (roles.length === 0) throw new AppError(400, `請為帳號「${account}」勾選至少一項權限，或移除該帳號`, field);
    const note = String(row.note ?? '').trim();
    if (note.length > MAX_NOTE) throw new AppError(400, `備註最多 ${MAX_NOTE} 字`, `note-${i}`);
    return { account, roles, note };
  });

  const self = String(actor ?? '').toLowerCase();
  if (!accounts.some((a) => a.account === self && a.roles.includes('system'))) {
    throw new AppError(400, '請保留您自己的「系統管理」權限，以免儲存後無法再進入本頁');
  }
  return accounts;
}

/** 比對新舊設定，產生日誌用的異動摘要 */
function diffPermissions(before, after) {
  const prev = new Map(before.map((a) => [a.account, a]));
  const next = new Map(after.map((a) => [a.account, a]));
  const label = (roles) => roles.map((r) => ROLES[r].label).join('、');
  const changes = [];
  for (const a of after) {
    const old = prev.get(a.account);
    if (!old) changes.push(`新增 ${a.account}：${label(a.roles)}`);
    else if (old.roles.join() !== a.roles.join()) changes.push(`修改 ${a.account}：${label(old.roles)} → ${label(a.roles)}`);
    else if ((old.note ?? '') !== a.note) changes.push(`修改 ${a.account} 備註`);
  }
  for (const a of before) {
    if (!next.has(a.account)) changes.push(`移除 ${a.account}`);
  }
  return changes;
}

/** 儲存權限設定 (整份取代)；回傳異動摘要 */
function savePermissions(input, actor) {
  const accounts = validatePermissionInput(input, actor);
  const before = loadPermissions();
  if (before.corrupted) throw new AppError(409, '權限設定檔損毀，請由伺服器管理者檢查 data/permissions.json');
  const changes = diffPermissions(before.accounts, accounts);
  if (changes.length === 0) return changes;

  const now = new Date().toISOString();
  const prev = new Map(before.accounts.map((a) => [a.account, a]));
  writeFileAtomic({
    updatedAt: now,
    updatedBy: actor,
    accounts: accounts.map((a) => {
      const old = prev.get(a.account);
      const same = old && old.roles.join() === a.roles.join() && (old.note ?? '') === a.note;
      return same
        ? { ...a, updatedAt: old.updatedAt, updatedBy: old.updatedBy }
        : { ...a, updatedAt: now, updatedBy: actor };
    }),
  });
  return changes;
}

module.exports = {
  ROLES,
  ROLE_KEYS,
  loadPermissions,
  isBootstrap,
  getPermissionsFor,
  listImpersonators,
  validatePermissionInput,
  savePermissions,
};
