'use strict';

/**
 * 將 database/pending-production-changes.sql 套用到測試資料庫 (僅限 development / test)
 *
 * 用法：npm run db:migrate-test
 * APP_ENV=production 時拒絕執行；正式資料庫請由資料庫管理者手動執行同一份 SQL。
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveDbConfig } = require('../src/config/database');

async function main() {
  const config = resolveDbConfig();
  if (config.isProduction) {
    console.error('✖ 拒絕執行：APP_ENV=production，正式資料庫請手動執行 database/pending-production-changes.sql。');
    process.exitCode = 1;
    return;
  }
  const { sequelize } = require('../src/models');
  const { findMissingColumns } = require('../src/services/schema-check');
  try {
    console.log(`目標測試資料庫：${config.host}:${config.port} / ${config.database}`);
    const sql = fs.readFileSync(path.resolve(__dirname, '../database/pending-production-changes.sql'), 'utf8');
    // 以空白行分段，每段為一個獨立批次 (可重複執行)
    const batches = sql.replace(/^--.*$/gm, '').split(/\r?\n\s*\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const batch of batches) await sequelize.query(batch);
    const missing = await findMissingColumns();
    if (missing.length) throw new Error(`仍缺少欄位：${missing.map((c) => `${c.table}.${c.column}`).join(', ')}`);
    console.log(`✔ 已套用 ${batches.length} 段變更，測試資料庫結構已是最新`);
  } catch (err) {
    console.error(`✖ 套用失敗：${err.message}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
