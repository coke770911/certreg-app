'use strict';

/**
 * 舊系統資料表結構盤點腳本 (唯讀)
 *
 * 用法：node scripts/inspect-legacy-schema.js
 *
 * 不論 .env 的 APP_ENV 為何，一律以「正式環境鎖定」模式連線正式資料庫，
 * 只查詢系統檢視表 (INFORMATION_SCHEMA / sys.*)，不讀取任何個人資料。
 * 結果輸出至 docs/legacy-schema.json，作為建立 Sequelize 模型的依據。
 */

const fs = require('node:fs');
const path = require('node:path');
const { QueryTypes } = require('sequelize');
const { createSequelize } = require('../src/config/database');

const OUTPUT = path.resolve(__dirname, '../docs/legacy-schema.json');

async function main() {
  // 強制使用正式環境設定，確保 DDL 鎖定生效
  const sequelize = createSequelize({ ...process.env, APP_ENV: 'production' });
  const select = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT });

  try {
    const objects = await select(`
      SELECT TABLE_NAME AS name, TABLE_TYPE AS type
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo'
      ORDER BY TABLE_TYPE, TABLE_NAME`);

    const columns = await select(`
      SELECT
        c.TABLE_NAME AS tableName, c.COLUMN_NAME AS name, c.DATA_TYPE AS dataType,
        c.CHARACTER_MAXIMUM_LENGTH AS maxLength, c.NUMERIC_PRECISION AS numericPrecision,
        c.NUMERIC_SCALE AS numericScale, c.IS_NULLABLE AS nullable, c.COLUMN_DEFAULT AS defaultValue,
        COLUMNPROPERTY(OBJECT_ID('dbo.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS isIdentity
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_SCHEMA = 'dbo'
      ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`);

    const keys = await select(`
      SELECT tc.TABLE_NAME AS tableName, tc.CONSTRAINT_TYPE AS type, kcu.COLUMN_NAME AS columnName
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_SCHEMA = 'dbo'
      ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_TYPE`);

    const rowCounts = await select(`
      SELECT t.name AS tableName, SUM(p.rows) AS rows
      FROM sys.tables t
      JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
      GROUP BY t.name`);

    const views = await select(`
      SELECT v.name, OBJECT_DEFINITION(v.object_id) AS definition
      FROM sys.views v`);

    const tables = objects.map((obj) => ({
      ...obj,
      rows: rowCounts.find((r) => r.tableName === obj.name)?.rows ?? null,
      columns: columns.filter((c) => c.tableName === obj.name).map(({ tableName, ...c }) => c),
      keys: keys.filter((k) => k.tableName === obj.name).map(({ tableName, ...k }) => k),
      definition: views.find((v) => v.name === obj.name)?.definition ?? undefined,
    }));

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify({ inspectedAt: new Date().toISOString(), tables }, null, 2));

    for (const t of tables) {
      console.log(`${t.type === 'VIEW' ? '[檢視]' : '[資料表]'} ${t.name} (${t.columns.length} 欄${t.rows != null ? `，${t.rows} 筆` : ''})`);
    }
    console.log(`\n已輸出：${OUTPUT}`);
  } catch (err) {
    console.error(`✖ 盤點失敗：${err.message}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
