'use strict';

/**
 * 檢查資料庫是否已套用 database/pending-production-changes.sql 的欄位
 *
 * 正式資料庫由承辦人員手動變更結構，程式只以 INFORMATION_SCHEMA 唯讀查詢是否已補上，
 * 缺少時於啟動時警告、並顯示在「系統資訊」頁，提醒尚未完成。
 */

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

// 新增需要的欄位時，同步更新 pending-production-changes.sql 與 test-schema.sql
const REQUIRED_COLUMNS = [
  { table: 'LicenseGroup', column: 'lg_is_hidden', purpose: '證照分類隱藏' },
];

/** 回傳目前資料庫缺少的欄位 */
async function findMissingColumns() {
  const rows = await sequelize.query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN (:tables)`,
    { type: QueryTypes.SELECT, replacements: { tables: [...new Set(REQUIRED_COLUMNS.map((c) => c.table))] } }
  );
  const existing = new Set(rows.map((r) => `${r.tableName}.${r.columnName}`.toLowerCase()));
  return REQUIRED_COLUMNS.filter((c) => !existing.has(`${c.table}.${c.column}`.toLowerCase()));
}

module.exports = { REQUIRED_COLUMNS, findMissingColumns };
