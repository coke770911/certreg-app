'use strict';

/**
 * 資料庫連線驗證腳本 (唯讀)
 *
 * 用法：npm run db:check
 *
 * 依 .env 的 APP_ENV 連線至對應資料庫，只執行 SELECT 查詢：
 *   1. 驗證帳密與網路連線
 *   2. 顯示 SQL Server 版本、目前資料庫與登入帳號
 *   3. 統計既有資料表數量
 *   4. 檢查登入帳號權限，正式環境若具 DDL 權限則發出警告
 *   5. 確認正式環境鎖定保護已啟用 (不會送出任何 DDL 至資料庫)
 */

const { QueryTypes } = require('sequelize');
const { createSequelize, ProductionGuardError } = require('../src/config/database');

async function main() {
  let sequelize;
  try {
    sequelize = createSequelize();
  } catch (err) {
    console.error(`✖ 設定檢查失敗：${err.message}`);
    process.exitCode = 1;
    return;
  }

  const cfg = sequelize.lrsConfig;
  console.log('==============================================');
  console.log(' LRS 資料庫連線驗證');
  console.log('==============================================');
  console.log(`運行模式   : ${cfg.appEnv}${cfg.isProduction ? ' (正式環境鎖定)' : ''}`);
  console.log(`連線目標   : ${cfg.host}:${cfg.port} / ${cfg.database}`);
  console.log(`登入帳號   : ${cfg.username}`);
  console.log(`TLS 加密   : ${cfg.encrypt ? '啟用' : '停用'}`);
  console.log('----------------------------------------------');

  try {
    await sequelize.authenticate();
    console.log('✔ 連線成功');

    const select = (sql) => sequelize.query(sql, { type: QueryTypes.SELECT, plain: true });

    const info = await select(`
      SELECT
        CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(128)) AS productVersion,
        CAST(SERVERPROPERTY('ProductLevel') AS NVARCHAR(128))   AS productLevel,
        CAST(SERVERPROPERTY('Edition') AS NVARCHAR(128))        AS edition,
        DB_NAME()                                               AS currentDb,
        SUSER_SNAME()                                           AS loginName`);
    console.log(`  SQL Server : ${info.productVersion} ${info.productLevel} (${info.edition})`);
    console.log(`  目前資料庫 : ${info.currentDb}`);
    console.log(`  登入身分   : ${info.loginName}`);

    const tables = await select(
      "SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"
    );
    console.log(`  既有資料表 : ${tables.total} 張`);

    const perm = await select(`
      SELECT
        IS_SRVROLEMEMBER('sysadmin') AS isSysadmin,
        IS_MEMBER('db_owner')        AS isDbOwner,
        IS_MEMBER('db_ddladmin')     AS isDdlAdmin`);
    const canDdl = perm.isSysadmin === 1 || perm.isDbOwner === 1 || perm.isDdlAdmin === 1;
    console.log(
      `  帳號權限   : sysadmin=${perm.isSysadmin} db_owner=${perm.isDbOwner} db_ddladmin=${perm.isDdlAdmin}`
    );

    if (cfg.isProduction) {
      if (canDdl) {
        console.warn('⚠ 警告：正式環境帳號具備變更資料表結構的權限，目前僅靠程式層鎖定防護。');
        console.warn('  建議改用僅具 db_datareader (必要時加 db_datawriter) 的專用帳號。');
      }

      // 確認鎖定生效：此呼叫會在送出前被攔截，不會對資料庫執行任何動作
      try {
        await sequelize.sync();
        console.error('✖ 正式環境鎖定未生效：sync() 未被攔截！');
        process.exitCode = 1;
      } catch (err) {
        if (!(err instanceof ProductionGuardError)) throw err;
        console.log('✔ 正式環境鎖定已啟用：sync() 與 DDL 指令皆會被攔截');
      }
    } else {
      console.log('ℹ 測試/開發模式：允許透過 safeSync() 建立資料表');
    }

    console.log('----------------------------------------------');
    console.log('驗證完成');
  } catch (err) {
    console.error(`✖ 連線或查詢失敗：${err.message}`);
    if (err.original && err.original.code) console.error(`  錯誤代碼：${err.original.code}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
