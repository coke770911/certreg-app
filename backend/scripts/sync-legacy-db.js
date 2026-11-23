'use strict';

/**
 * 舊正式資料庫 → 新正式資料庫 + 測試資料庫 資料同步 (舊正式資料庫唯讀)
 *
 * 用法：
 *   npm run db:sync-legacy                                   預覽：列出舊正式與兩個目標各資料表筆數，不做任何變更
 *   npm run db:sync-legacy -- --yes --confirm=<PROD_DB_NAME> 同步到新正式與測試資料庫
 *   npm run db:sync-legacy -- --target=test [--yes]          只預覽 / 同步測試資料庫
 *   npm run db:sync-legacy -- --target=production [--yes --confirm=<PROD_DB_NAME>]
 *                                                            只預覽 / 同步新正式資料庫
 *   目標含新正式資料庫時，--confirm 須填新正式資料庫名稱，避免誤執行。
 *
 * 流程 (每個目標各自一個交易，失敗即整批還原，不影響另一個目標)：
 *   1. 結構檢查：測試資料庫先套用 database/pending-production-changes.sql (可重複執行)；
 *      新正式資料庫套用正式環境鎖定 (禁止 DDL)，缺少欄位或資料表時拒絕同步，須先由資料庫管理者補上。
 *   2. 讀取舊正式資料 (只讀一次)：LEGACY_DB_* 以唯讀鎖定連線，只執行 SELECT，任何寫入都會在送出前被攔截。
 *   3. 寫入：DELETE 目標資料表後以原編號 (IDENTITY_INSERT) 寫入，寫入後逐筆比對兩邊內容。
 *   4. 回填：執行 pending-production-changes.sql 中不含 DDL 的段落 (例如 Apply.ap_le_id)。
 * 舊正式資料庫與任一目標是同一個資料庫時拒絕執行。
 *
 * 注意：同步會以舊正式資料庫的內容「取代」目標資料表的全部資料 (含新系統新增的報名)，
 * 新正式資料庫只應在上線切換前執行。
 *
 * 不複製 v_UserData：為連到校務系統的檢視表，資料量大；
 * 登入時查無資料會沿用 UserData，因此複製 UserData 即可用正式帳號登入。
 * 注意：同步後測試資料庫含真實個人資料，請勿匯出或分享測試資料庫內容。
 *
 * 新系統新增的資料表 (NEW_TABLES，例如考試項目價格 RegPrice)：舊正式資料庫有時一併複製；
 * 沒有時清空目標的資料，同步過來的考試一律以原價 (考試費用 rg_money) 計算。
 */

const { QueryTypes } = require('sequelize');
const { createSequelize, createLegacySequelize } = require('../src/config/database');
const { findMissingColumns } = require('../src/services/schema-check');
const { readPendingBatches, runBatches, dataOnly } = require('./lib/pending-sql');

/** @typedef {import('sequelize').Sequelize} Sequelize */
/** @typedef {{ name: string, type: string }} Column */
/** @typedef {Record<string, string | number | null>} Row */
/**
 * @typedef {object} Target
 * @property {'test' | 'production'} key
 * @property {string} label
 * @property {Sequelize} db
 * @property {Array<{ table: string, idColumn: string, columns: Column[] }>} plan
 * @property {string[]} clear 要清空的新系統資料表 (舊正式資料庫沒有)
 */

// [資料表, 自動編號欄位]，依此順序複製
/** @type {Array<[string, string]>} */
const TABLES = [
  ['LicenseGroup', 'lg_id'],
  ['License', 'le_id'],
  ['Registration', 'rg_id'],
  ['LinkRgLe', 'lk_id'],
  ['Apply', 'ap_id'],
  ['UserData', 'us_uid'],
];
// 新系統新增的資料表：舊正式資料庫有就複製，沒有就清空 (資料內容依附於上方被取代的考試)
/** @type {Array<[string, string]>} */
const NEW_TABLES = [['RegPrice', 'rp_id']];
const BATCH = 500; // SQL Server 單一 INSERT VALUES 上限 1000 列

/**
 * @param {Sequelize} db
 * @param {string} table
 * @returns {Promise<Column[]>}
 */
const columnsOf = (db, table) =>
  db.query(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS type FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = :table ORDER BY ORDINAL_POSITION`,
    { type: QueryTypes.SELECT, replacements: { table } }
  );

/**
 * @param {Sequelize} db
 * @param {string} table
 * @returns {Promise<number>}
 */
const countOf = async (db, table) =>
  (await db.query(`SELECT COUNT(*) AS n FROM [dbo].[${table}]`, { type: QueryTypes.SELECT }))[0].n;

/**
 * 日期轉 ISO 8601 字串、bit 轉數字，避免時區與驅動程式型別轉換造成差異
 * @param {Column[]} columns
 * @returns {string}
 */
function selectList(columns) {
  return columns
    .map(({ name, type }) => {
      if (/date|time/i.test(type)) return `CONVERT(varchar(23), [${name}], 126) AS [${name}]`;
      if (type === 'bit') return `CAST([${name}] AS tinyint) AS [${name}]`;
      return `[${name}]`;
    })
    .join(', ');
}

/**
 * @param {Sequelize} db
 * @param {string} table
 * @param {Column[]} columns
 * @param {string} idColumn
 * @returns {Promise<Row[]>}
 */
const readRows = (db, table, columns, idColumn) =>
  db.query(`SELECT ${selectList(columns)} FROM [dbo].[${table}] ORDER BY [${idColumn}]`, {
    type: QueryTypes.SELECT,
  });

/**
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `N'${String(value).replace(/'/g, "''")}'`;
}

/**
 * 只取指定欄位，供比對 (目標可能比舊正式資料庫少欄位)
 * @param {Row} row
 * @param {Column[]} columns
 * @returns {string}
 */
const pick = (row, columns) => JSON.stringify(columns.map((c) => row[c.name]));

/**
 * 解析命令列參數
 * @param {string[]} argv
 * @returns {{ targets: Array<'test' | 'production'>, execute: boolean, confirm: string }}
 */
function parseArgs(argv) {
  /** @param {string} name */
  const value = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3).trim() ?? '';
  const target = value('target') || 'all';
  /** @type {Record<string, Array<'test' | 'production'>>} */
  const choices = { all: ['production', 'test'], test: ['test'], production: ['production'] };
  if (!choices[target]) throw new Error(`--target 只能是 all、test 或 production：「${target}」`);
  return { targets: choices[target], execute: argv.includes('--yes'), confirm: value('confirm') };
}

/**
 * 依舊正式資料庫與目標的欄位建立同步計畫並列出筆數
 * @param {Sequelize} legacy
 * @param {Target} target
 */
async function buildPlan(legacy, target) {
  const tables = [...TABLES];
  for (const [table, idColumn] of NEW_TABLES) {
    if ((await columnsOf(target.db, table)).length === 0) continue;
    if ((await columnsOf(legacy, table)).length > 0) tables.push([table, idColumn]);
    else {
      target.clear.push(table);
      console.log(`  ${table.padEnd(14)} 舊正式庫沒有此資料表 → 清空目標 ${await countOf(target.db, table)} 筆 (改以原價計算)`);
    }
  }
  for (const [table, idColumn] of tables) {
    const sourceCols = await columnsOf(legacy, table);
    const targetCols = await columnsOf(target.db, table);
    if (targetCols.length === 0) throw new Error(`${target.label}資料庫沒有 ${table} 資料表`);
    const targetNames = new Set(targetCols.map((c) => c.name));
    const columns = sourceCols.filter((c) => targetNames.has(c.name));
    const skipped = sourceCols.filter((c) => !targetNames.has(c.name)).map((c) => c.name);
    target.plan.push({ table, idColumn, columns });
    console.log(
      `  ${table.padEnd(14)} 舊正式 ${String(await countOf(legacy, table)).padStart(6)} 筆 → 目前 ${String(await countOf(target.db, table)).padStart(6)} 筆` +
        (skipped.length ? `  (目標缺少欄位，略過：${skipped.join(', ')})` : '')
    );
  }
}

/**
 * 在單一交易中清空目標資料表並寫入舊正式資料，寫入後逐筆比對
 * @param {Target} target
 * @param {Map<string, Row[]>} source 各資料表的舊正式資料 (含全部欄位)
 * @returns {Promise<boolean>} 內容是否完全一致
 */
async function writeTarget(target, source) {
  const { db } = target;
  await db.transaction(async (transaction) => {
    /** @param {string} sql */
    const run = (sql) => db.query(sql, { transaction });
    for (const table of target.clear) await run(`DELETE FROM [dbo].[${table}]`);
    for (const { table, idColumn, columns } of target.plan) {
      const rows = source.get(table) ?? [];
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
      const max = rows.reduce((m, r) => Math.max(m, Number(r[idColumn])), 0);
      await run(`DBCC CHECKIDENT ('[dbo].[${table}]', RESEED, ${max}) WITH NO_INFOMSGS`);
    }
  });

  let ok = true;
  for (const { table, idColumn, columns } of target.plan) {
    const rows = source.get(table) ?? [];
    const copied = await readRows(db, table, columns, idColumn);
    const same = copied.length === rows.length && copied.every((r, i) => pick(r, columns) === pick(rows[i], columns));
    ok &&= same;
    console.log(`  ${same ? '✔' : '✖'} ${table.padEnd(14)} ${copied.length} 筆${same ? '' : '，內容與舊正式資料不一致'}`);
  }
  return ok;
}

async function main() {
  /** @type {ReturnType<typeof parseArgs>} */
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exitCode = 1;
    return;
  }
  const prefixes = args.targets.map((t) => (t === 'production' ? 'PROD_DB_' : 'TEST_DB_'));

  /** @type {Sequelize | undefined} */
  let legacy;
  /** @type {Target[]} */
  const targets = [];
  try {
    // 舊正式資料庫：唯讀鎖定，且不可與任一同步目標相同
    legacy = createLegacySequelize(process.env, prefixes);
    for (const key of args.targets) {
      // 新正式資料庫套用正式環境鎖定 (禁止 DDL)；兩者都不輸出 SQL (寫入語句含大量個人資料)
      const db =
        key === 'production'
          ? createSequelize({ ...process.env, APP_ENV: 'production' })
          : createSequelize({ ...process.env, APP_ENV: 'development', DB_LOGGING: 'false' });
      targets.push({ key, label: key === 'production' ? '新正式' : '測試', db, plan: [], clear: [] });
    }
  } catch (err) {
    console.error(`✖ 設定錯誤：${err.message}`);
    await legacy?.close();
    for (const t of targets) await t.db.close();
    process.exitCode = 1;
    return;
  }

  const prod = targets.find((t) => t.key === 'production');
  const prodName = prod?.db.lrsConfig.database ?? '';
  const closeAll = async () => {
    await legacy.close();
    for (const t of targets) await t.db.close();
  };

  if (prod && args.execute && args.confirm.toLowerCase() !== prodName.toLowerCase()) {
    console.error(`✖ 同步到新正式資料庫需加上 --confirm=${prodName} (新正式資料庫名稱) 確認。`);
    await closeAll();
    process.exitCode = 1;
    return;
  }

  const batches = readPendingBatches();
  let ok = true;
  try {
    console.log(`來源 (舊正式，唯讀)：${legacy.lrsConfig.host} / ${legacy.lrsConfig.database}`);

    // 1. 結構檢查與同步計畫 (全部目標都通過才開始寫入)
    for (const t of targets) {
      console.log(`\n目標 (${t.label})：${t.db.lrsConfig.host} / ${t.db.lrsConfig.database}`);
      const missing = await findMissingColumns(t.db);
      if (missing.length > 0) {
        const list = missing.map((c) => `${c.table}.${c.column}`).join(', ');
        if (t.key === 'production') {
          throw new Error(`新正式資料庫缺少：${list}，請先由資料庫管理者執行 database/pending-production-changes.sql`);
        }
        if (args.execute) {
          await runBatches(t.db, batches);
          console.log(`  已套用 pending-production-changes.sql 補上：${list}`);
        } else {
          console.log(`  缺少 ${list} (執行時會先套用 pending-production-changes.sql 補上)`);
          continue;
        }
      }
      await buildPlan(legacy, t);
    }

    if (!args.execute) {
      console.log(
        prod
          ? `\n以上為預覽，未做任何變更。確認要以舊正式資料「取代」目標的全部資料，請加上 --yes --confirm=${prodName} 執行。`
          : '\n以上為預覽，未做任何變更。確認要以舊正式資料取代測試資料，請加上 --yes 執行。'
      );
      return;
    }

    // 2. 舊正式資料只讀一次 (全部欄位)，再依各目標的欄位寫入
    /** @type {Map<string, Row[]>} */
    const source = new Map();
    for (const [table, idColumn] of [...TABLES, ...NEW_TABLES]) {
      if (!targets.some((t) => t.plan.some((p) => p.table === table))) continue;
      source.set(table, await readRows(legacy, table, await columnsOf(legacy, table), idColumn));
    }

    // 3. 逐一寫入目標並回填新欄位
    for (const t of targets) {
      console.log(`\n寫入${t.label}資料庫 ${t.db.lrsConfig.database}…`);
      try {
        const same = await writeTarget(t, source);
        ok &&= same;
        if (!same) continue;
      } catch (err) {
        ok = false;
        console.error(`  ✖ ${t.label}資料庫同步失敗 (已還原)：${err.message}`);
        continue;
      }
      try {
        const updated = await runBatches(t.db, dataOnly(batches));
        console.log(`  ✔ 回填新系統欄位 ${updated} 筆`);
      } catch (err) {
        ok = false;
        console.error(`  ✖ 資料已同步，但回填新系統欄位失敗：${err.message}，請再執行 pending-production-changes.sql`);
      }
    }
    if (ok) console.log('\n✔ 同步完成');
  } catch (err) {
    ok = false;
    console.error(args.execute ? `✖ 同步失敗：${err.message}` : `✖ 預覽失敗 (未做任何變更)：${err.message}`);
  } finally {
    await closeAll();
  }
  if (!ok) process.exitCode = 1;
}

main();
