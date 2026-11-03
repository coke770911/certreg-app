'use strict';

/**
 * 正式資料複製到測試資料庫 (正式資料庫唯讀)
 *
 * 用法：
 *   npm run db:copy-prod            預覽：只列出兩邊各資料表筆數，不做任何變更
 *   npm run db:copy-prod -- --yes   執行：清空測試資料表後，寫入正式資料庫的全部資料
 *
 * 正式資料庫一律以「正式環境鎖定」模式連線，只執行 SELECT。
 * 測試資料庫在單一交易中 DELETE 後以原編號 (IDENTITY_INSERT) 寫入，失敗即整批還原；
 * 寫入後逐筆比對兩邊內容，確認完全一致。
 * .env 的 APP_ENV=production 時拒絕執行 (此時沒有可寫入的測試資料庫)。
 *
 * 不複製 v_UserData：正式環境為連到校務系統的檢視表，資料量大；
 * 登入時查無資料會沿用 UserData，因此複製 UserData 即可用正式帳號登入。
 * 注意：複製後測試資料庫含真實個人資料，請勿匯出或分享測試資料庫內容。
 *
 * 新系統新增的資料表 (NEW_TABLES，例如考試項目價格 RegPrice)：正式庫已建立時一併複製；
 * 正式庫還沒有時清空測試庫的資料，複製過來的考試一律以原價 (考試費用 rg_money) 計算。
 */

const { QueryTypes } = require('sequelize');
const { createSequelize, resolveDbConfig } = require('../src/config/database');

// [資料表, 自動編號欄位]，依此順序複製
const TABLES = [
  ['LicenseGroup', 'lg_id'],
  ['License', 'le_id'],
  ['Registration', 'rg_id'],
  ['LinkRgLe', 'lk_id'],
  ['Apply', 'ap_id'],
  ['UserData', 'us_uid'],
];
// 新系統新增的資料表：正式庫有就複製，沒有就清空 (資料內容依附於上方被取代的考試)
const NEW_TABLES = [['RegPrice', 'rp_id']];
const BATCH = 500; // SQL Server 單一 INSERT VALUES 上限 1000 列

const columnsOf = (db, table) =>
  db.query(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS type FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = :table ORDER BY ORDINAL_POSITION`,
    { type: QueryTypes.SELECT, replacements: { table } }
  );

const countOf = async (db, table) =>
  (await db.query(`SELECT COUNT(*) AS n FROM [dbo].[${table}]`, { type: QueryTypes.SELECT }))[0].n;

// 日期轉 ISO 8601 字串、bit 轉數字，避免時區與驅動程式型別轉換造成差異
function selectList(columns) {
  return columns
    .map(({ name, type }) => {
      if (/date|time/i.test(type)) return `CONVERT(varchar(23), [${name}], 126) AS [${name}]`;
      if (type === 'bit') return `CAST([${name}] AS tinyint) AS [${name}]`;
      return `[${name}]`;
    })
    .join(', ');
}

const readRows = (db, table, columns, idColumn) =>
  db.query(`SELECT ${selectList(columns)} FROM [dbo].[${table}] ORDER BY [${idColumn}]`, {
    type: QueryTypes.SELECT,
  });

function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `N'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const config = resolveDbConfig();
  if (config.isProduction) {
    console.error('✖ 拒絕執行：APP_ENV=production，沒有可寫入的測試資料庫。');
    process.exitCode = 1;
    return;
  }
  const execute = process.argv.includes('--yes');

  // 正式資料庫：強制正式環境鎖定，任何 DDL 都會在送出前被攔截
  const prod = createSequelize({ ...process.env, APP_ENV: 'production' });
  // 不輸出 SQL：寫入語句含大量個人資料
  const test = createSequelize({ ...process.env, DB_LOGGING: 'false' });

  try {
    console.log(`來源 (唯讀)：${prod.lrsConfig.host} / ${prod.lrsConfig.database}`);
    console.log(`目標 (測試)：${config.host} / ${config.database}\n`);

    const plan = [];
    const clear = [];
    const tables = [...TABLES];
    for (const [table, idColumn] of NEW_TABLES) {
      if ((await columnsOf(test, table)).length === 0) continue;
      if ((await columnsOf(prod, table)).length > 0) tables.push([table, idColumn]);
      else {
        clear.push(table);
        console.log(`${table.padEnd(14)} 正式庫尚無此資料表 → 清空測試庫 ${await countOf(test, table)} 筆 (改以原價計算)`);
      }
    }
    for (const [table, idColumn] of tables) {
      const prodCols = await columnsOf(prod, table);
      const testCols = await columnsOf(test, table);
      if (testCols.length === 0) throw new Error(`測試資料庫沒有 ${table} 資料表，請先執行 npm run db:setup`);
      const testNames = new Set(testCols.map((c) => c.name));
      const columns = prodCols.filter((c) => testNames.has(c.name));
      const skipped = prodCols.filter((c) => !testNames.has(c.name)).map((c) => c.name);
      plan.push({ table, idColumn, columns, skipped });
      console.log(
        `${table.padEnd(14)} 正式 ${String(await countOf(prod, table)).padStart(6)} 筆 → 測試目前 ${String(await countOf(test, table)).padStart(6)} 筆` +
          (skipped.length ? `  (測試庫缺少欄位，略過：${skipped.join(', ')})` : '')
      );
    }

    if (!execute) {
      console.log('\n以上為預覽，未做任何變更。確認要以正式資料取代測試資料，請加上 --yes 執行。');
      return;
    }

    // 先讀完正式資料，再開始寫入測試資料庫
    for (const p of plan) p.rows = await readRows(prod, p.table, p.columns, p.idColumn);

    await test.transaction(async (transaction) => {
      const run = (sql) => test.query(sql, { transaction });
      for (const table of clear) await run(`DELETE FROM [dbo].[${table}]`);
      for (const { table, idColumn, columns, rows } of plan) {
        await run(`DELETE FROM [dbo].[${table}]`);
        if (rows.length > 0) {
          const names = columns.map((c) => `[${c.name}]`).join(', ');
          // SET IDENTITY_INSERT 只在同一批次有效 (驅動程式以 sp_executesql 執行)，需與 INSERT 放在同一段
          for (let i = 0; i < rows.length; i += BATCH) {
            const values = rows
              .slice(i, i + BATCH)
              .map((row) => `(${columns.map((c) => literal(row[c.name])).join(', ')})`)
              .join(',\n');
            await run(
              `SET IDENTITY_INSERT [dbo].[${table}] ON;\nINSERT INTO [dbo].[${table}] (${names}) VALUES ${values};\nSET IDENTITY_INSERT [dbo].[${table}] OFF;`
            );
          }
        }
        // 自動編號接續最大值 (空表時下一筆從 1 開始)
        const max = rows.reduce((m, r) => Math.max(m, r[idColumn]), 0);
        await run(`DBCC CHECKIDENT ('[dbo].[${table}]', RESEED, ${max}) WITH NO_INFOMSGS`);
      }
    });

    console.log('\n寫入完成，逐筆比對中…');
    let ok = true;
    for (const { table, idColumn, columns, rows } of plan) {
      const copied = await readRows(test, table, columns, idColumn);
      const same = copied.length === rows.length && copied.every((r, i) => JSON.stringify(r) === JSON.stringify(rows[i]));
      ok &&= same;
      console.log(`${same ? '✔' : '✖'} ${table.padEnd(14)} ${copied.length} 筆${same ? '' : '，內容與正式資料不一致'}`);
    }
    if (!ok) process.exitCode = 1;
    // 測試庫新增的欄位 (正式庫尚無) 維持預設值，需再回填
    else console.log('\n如測試庫有正式庫尚未補上的欄位，請再執行 npm run db:migrate-test 回填資料。');
  } catch (err) {
    console.error(`✖ 複製失敗 (測試資料庫已還原)：${err.message}`);
    process.exitCode = 1;
  } finally {
    await prod.close();
    await test.close();
  }
}

main();
