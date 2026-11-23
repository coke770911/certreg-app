'use strict';

/**
 * 讀取 database/pending-production-changes.sql，以 GO 分段 (與 SSMS 相同)
 * 新增欄位與使用該欄位的語句須分在不同批次，因此每段各自送出。
 */

const fs = require('node:fs');
const path = require('node:path');
const { containsDdl } = require('../../src/config/database');

const SQL_FILE = path.resolve(__dirname, '../../database/pending-production-changes.sql');

/**
 * @returns {string[]} 各段 SQL (已去除整行註解)
 */
function readPendingBatches() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(/^\s*GO\s*$/im)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 依序執行各段 SQL，回傳回填 (UPDATE) 的筆數
 * @param {import('sequelize').Sequelize} db
 * @param {string[]} batches
 * @returns {Promise<number>}
 */
async function runBatches(db, batches) {
  let updated = 0;
  for (const batch of batches) {
    const [, affected] = await db.query(batch);
    if (/^UPDATE\b/i.test(batch) && typeof affected === 'number') updated += affected;
  }
  return updated;
}

/** 只含資料回填、不含 DDL 的段落 (可在正式環境鎖定下執行) */
const dataOnly = (batches) => batches.filter((b) => !containsDdl(b));

module.exports = { SQL_FILE, readPendingBatches, runBatches, dataOnly };
