'use strict';

/**
 * 本機資料目錄：存放系統日誌與管理端權限設定。
 *
 * 正式資料庫禁止建立新資料表，因此這兩類資料不寫入資料庫，改存於伺服器本機檔案。
 * 預設為 backend/data，可用 DATA_DIR 指定其他位置；目錄已列入 .gitignore。
 */

const path = require('node:path');
require('./database'); // 確保 .env 已載入

function resolveDataDir(env = process.env) {
  const dir = (env.DATA_DIR || '').trim();
  return dir ? path.resolve(dir) : path.resolve(__dirname, '../../data');
}

module.exports = { resolveDataDir };
