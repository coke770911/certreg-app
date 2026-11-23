'use strict';

/**
 * 資料庫設定模組 (Sequelize + tedious / SQL Server)
 *
 * 依 .env 的 APP_ENV 單一開關決定連線目標：
 *   - development / test -> TEST_DB_* (允許 sync / migration 建表)
 *   - production         -> PROD_DB_* (正式環境鎖定，禁止任何 DDL 與 sync)
 *
 * 正式環境鎖定為多層防護，任一層都會在 SQL 送出前直接拋出 ProductionGuardError：
 *   1. sequelize.sync() / sequelize.drop() 直接覆寫為拒絕
 *   2. 全域 beforeBulkSync / beforeSync hook，攔截 Model.sync()
 *   3. sequelize.query() 包裝層，掃描所有 SQL (含 queryInterface 產生的語句)，
 *      含 CREATE / ALTER / DROP / TRUNCATE / sp_rename 即拒絕
 *
 * 舊正式資料庫 (LEGACY_DB_*，舊 PHP 系統上線中的資料庫) 只供查詢與同步資料，
 * 以 createLegacySequelize() 連線並套用唯讀鎖定：只允許 SELECT / WITH 查詢，
 * 任何寫入 (INSERT / UPDATE / DELETE / MERGE / EXEC …) 與 DDL 都在送出前拋出 ReadOnlyGuardError。
 */

const path = require('node:path');
const { Sequelize } = require('sequelize');

// dotenv 不會覆寫已存在的環境變數；parsed 保留 .env 檔案本身的內容，供 PORT 等需以 .env 為準的設定比對
const envFile = require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true }).parsed || {};

// 舊資料庫的 datetime 欄位皆為台灣當地時間 (無時區資訊)，程式統一以台北時區解讀與寫入
process.env.TZ = process.env.TZ || 'Asia/Taipei';

const VALID_ENVS = ['development', 'test', 'production'];

class ProductionGuardError extends Error {
  constructor(message) {
    super(`[正式環境鎖定] ${message}`);
    this.name = 'ProductionGuardError';
  }
}

class ReadOnlyGuardError extends Error {
  constructor(message) {
    super(`[舊正式資料庫唯讀] ${message}`);
    this.name = 'ReadOnlyGuardError';
  }
}

// 移除字串常值、註解與 [識別字]，避免資料內容誤判，也避免把 DDL 藏在註解後方
const SQL_NOISE = /--[^\r\n]*|\/\*[\s\S]*?\*\/|N?'(?:[^']|'')*'|\[(?:[^\]]|\]\])*\]|"(?:[^"]|"")*"/g;
const DDL_KEYWORDS = /\b(CREATE|ALTER|DROP|TRUNCATE|sp_rename)\b/i;

function containsDdl(sql) {
  if (typeof sql !== 'string') return false;
  return DDL_KEYWORDS.test(sql.replace(SQL_NOISE, ' '));
}

// 唯讀連線允許的語句開頭，以及語句中不可出現的寫入、執行、權限、設定指令
const READ_ONLY_START = /^\s*(SELECT|WITH)\b/i;
const WRITE_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|MERGE|INTO|EXEC|EXECUTE|SP_EXECUTESQL|CREATE|ALTER|DROP|TRUNCATE|SP_RENAME|GRANT|REVOKE|DENY|BACKUP|RESTORE|DBCC|BULK|OPENROWSET|OPENQUERY|OPENDATASOURCE|SET|DECLARE|USE|KILL|SHUTDOWN)\b/i;

/**
 * 是否為唯讀查詢：去除字串、註解與 [識別字] 後，必須以 SELECT / WITH 開頭，且不含寫入或執行指令
 * (例如 SELECT … INTO 會建立資料表，因此 INTO 也一律拒絕)。
 * @param {unknown} sql
 * @returns {boolean}
 */
function isReadOnlySql(sql) {
  if (typeof sql !== 'string') return false;
  const text = sql.replace(SQL_NOISE, ' ');
  return READ_ONLY_START.test(text) && !WRITE_KEYWORDS.test(text);
}

function parseBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

/**
 * @typedef {object} DbConnection
 * @property {string} host
 * @property {number} port
 * @property {string} database
 * @property {string} username
 * @property {string} password
 */

/**
 * 讀取指定前綴的連線設定 (未設定的項目為空字串)
 * @param {NodeJS.ProcessEnv} env
 * @param {string} prefix 例如 'PROD_DB_'
 * @returns {DbConnection}
 */
function readConnection(env, prefix) {
  return {
    host: (env[`${prefix}HOST`] || '').trim(),
    port: Number.parseInt(env[`${prefix}PORT`] || '1433', 10),
    database: (env[`${prefix}NAME`] || '').trim(),
    username: (env[`${prefix}USER`] || '').trim(),
    password: env[`${prefix}PASSWORD`] || '',
  };
}

/**
 * 讀取連線設定並檢查必填項目
 * @param {NodeJS.ProcessEnv} env
 * @param {string} prefix
 * @returns {DbConnection}
 */
function readTarget(env, prefix) {
  const missing = ['HOST', 'NAME', 'USER', 'PASSWORD'].filter((key) => !env[`${prefix}${key}`]);
  if (missing.length > 0) {
    throw new Error(`資料庫設定不完整，缺少：${missing.map((k) => prefix + k).join(', ')}`);
  }
  const target = readConnection(env, prefix);
  if (!Number.isInteger(target.port) || target.port <= 0) {
    throw new Error(`${prefix}PORT 必須為正整數`);
  }
  return target;
}

/**
 * 兩組設定是否指向同一個資料庫 (主機、埠號、資料庫名稱都相同，不分大小寫)
 * @param {DbConnection} a
 * @param {DbConnection} b
 * @returns {boolean}
 */
function sameDatabase(a, b) {
  return (
    Boolean(a.host && a.database) &&
    a.host.toLowerCase() === b.host.toLowerCase() &&
    a.port === b.port &&
    a.database.toLowerCase() === b.database.toLowerCase()
  );
}

/**
 * 從環境變數解析出目前模式應使用的資料庫設定。
 * 設定不完整、APP_ENV 不合法或測試設定指向正式資料庫時，直接拋錯拒絕啟動。
 */
function resolveDbConfig(env = process.env) {
  const appEnv = (env.APP_ENV || '').trim().toLowerCase();
  if (!VALID_ENVS.includes(appEnv)) {
    throw new Error(`APP_ENV 設定錯誤：「${env.APP_ENV ?? ''}」，僅允許 ${VALID_ENVS.join(' / ')}`);
  }

  const isProduction = appEnv === 'production';
  const prefix = isProduction ? 'PROD_DB_' : 'TEST_DB_';

  const target = readTarget(env, prefix);

  if (!isProduction) {
    const prod = readConnection(env, 'PROD_DB_');
    if (sameDatabase(prod, target)) {
      throw new Error(
        `TEST_DB_* 與 PROD_DB_* 指向同一個資料庫 (${target.host}:${target.port}/${target.database})，` +
          '為避免在正式資料庫建表，拒絕啟動。'
      );
    }
  }
  // 網站程式絕不連到舊正式資料庫 (只有同步、盤點腳本以唯讀連線查詢)
  if (sameDatabase(readConnection(env, 'LEGACY_DB_'), target)) {
    throw new Error(
      `${prefix}* 與 LEGACY_DB_* 指向同一個資料庫 (${target.host}:${target.port}/${target.database})，` +
        '舊正式資料庫不可由新系統寫入，拒絕啟動。'
    );
  }

  return {
    appEnv,
    isProduction,
    allowSchemaChanges: !isProduction,
    ...target,
    encrypt: parseBool(env.DB_ENCRYPT, false),
    trustServerCertificate: parseBool(env.DB_TRUST_SERVER_CERTIFICATE, true),
    // 正式環境一律不輸出 SQL，避免敏感資料寫入日誌
    logging: !isProduction && parseBool(env.DB_LOGGING, false),
  };
}

function applyProductionGuard(sequelize) {
  const reject = (action) => () =>
    Promise.reject(new ProductionGuardError(`禁止執行 ${action}，正式資料庫結構不可變更。`));

  sequelize.sync = reject('sequelize.sync()');
  sequelize.drop = reject('sequelize.drop()');

  const throwOnSync = (name) => () => {
    throw new ProductionGuardError(`禁止執行 ${name}，正式資料庫結構不可變更。`);
  };
  sequelize.addHook('beforeBulkSync', 'productionGuard', throwOnSync('sync()'));
  sequelize.addHook('beforeSync', 'productionGuard', throwOnSync('Model.sync()'));

  const originalQuery = sequelize.query.bind(sequelize);
  sequelize.query = (sql, options) => {
    const text = typeof sql === 'string' ? sql : sql && sql.query;
    if (containsDdl(text)) {
      return Promise.reject(
        new ProductionGuardError(`偵測到 DDL 指令，已攔截未送出：${String(text).slice(0, 200)}`)
      );
    }
    return originalQuery(sql, options);
  };
}

/**
 * 建立 Sequelize 實例。正式環境會自動套用鎖定保護。
 * @param {NodeJS.ProcessEnv} [env] 預設讀取 process.env (已載入 .env)
 */
function createSequelize(env = process.env) {
  const config = resolveDbConfig(env);
  const sequelize = connect(config);

  if (config.isProduction) {
    applyProductionGuard(sequelize);
  }

  sequelize.lrsConfig = Object.freeze({ ...config, password: undefined });
  return sequelize;
}

/**
 * 依連線設定建立 Sequelize 實例 (不套用任何鎖定)
 * @param {DbConnection & { encrypt: boolean, trustServerCertificate: boolean, logging: boolean }} config
 * @param {{ readOnlyIntent?: boolean }} [options]
 * @returns {Sequelize}
 */
function connect(config, { readOnlyIntent = false } = {}) {
  return new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: 'mssql',
    logging: config.logging ? console.log : false,
    timezone: '+08:00',
    // 唯讀連線預先指定版本 (SQL Server 2014 = 12.0)，Sequelize 才不會在連線時送出含 DECLARE / SET 的版本查詢
    // (該查詢會被唯讀鎖定攔下，導致連線卡住)；0 表示由 Sequelize 自動偵測
    databaseVersion: readOnlyIntent ? '12.0.2000' : 0,
    dialectOptions: {
      options: {
        encrypt: config.encrypt,
        trustServerCertificate: config.trustServerCertificate,
        // datetime 欄位以本機時區 (Asia/Taipei) 解讀，而非 UTC
        useUTC: false,
        connectTimeout: 15000,
        requestTimeout: 30000,
        // 唯讀連線宣告 ApplicationIntent=ReadOnly
        readOnlyIntent,
      },
    },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define: {
      // 沿用舊有資料表名稱，不自動轉成複數
      freezeTableName: true,
    },
  });
}

/**
 * 舊正式資料庫 (LEGACY_DB_*) 的連線設定。未設定，或與同步目標 (targets) 是同一個資料庫時拋錯。
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string[]} [targets] 要比對的設定前綴，預設比對測試與新正式資料庫
 */
function resolveLegacyDbConfig(env = process.env, targets = ['TEST_DB_', 'PROD_DB_']) {
  const legacy = readTarget(env, 'LEGACY_DB_');
  for (const prefix of targets) {
    if (sameDatabase(readConnection(env, prefix), legacy)) {
      throw new Error(
        `LEGACY_DB_* 與 ${prefix}* 指向同一個資料庫 (${legacy.host}:${legacy.port}/${legacy.database})，` +
          '舊正式資料庫只能查詢，不可作為同步目標；請將 ' + prefix + '* 改為新的資料庫。'
      );
    }
  }
  return {
    ...legacy,
    encrypt: parseBool(env.DB_ENCRYPT, false),
    trustServerCertificate: parseBool(env.DB_TRUST_SERVER_CERTIFICATE, true),
    // 不輸出 SQL：查詢結果含個人資料
    logging: false,
  };
}

/** 唯讀鎖定：sync / drop / 交易與所有非 SELECT 語句都在送出前拒絕 */
function applyReadOnlyGuard(sequelize) {
  const reject = (action) => () => Promise.reject(new ReadOnlyGuardError(`禁止執行 ${action}，舊正式資料庫只能查詢。`));
  sequelize.sync = reject('sequelize.sync()');
  sequelize.drop = reject('sequelize.drop()');
  sequelize.transaction = reject('交易 (transaction)');

  const originalQuery = sequelize.query.bind(sequelize);
  sequelize.query = (sql, options) => {
    const text = typeof sql === 'string' ? sql : sql && sql.query;
    if (!isReadOnlySql(text)) {
      return Promise.reject(new ReadOnlyGuardError(`只允許 SELECT 查詢，已攔截未送出：${String(text).slice(0, 200)}`));
    }
    return originalQuery(sql, options);
  };
}

/**
 * 連線舊正式資料庫 (唯讀)。供資料同步、結構盤點等腳本使用，網站程式不使用。
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string[]} [targets] 同步目標的設定前綴 (見 resolveLegacyDbConfig)
 */
function createLegacySequelize(env = process.env, targets = undefined) {
  const config = resolveLegacyDbConfig(env, targets);
  const sequelize = connect(config, { readOnlyIntent: true });
  applyReadOnlyGuard(sequelize);
  sequelize.lrsConfig = Object.freeze({ ...config, password: undefined, isLegacy: true, readOnly: true });
  return sequelize;
}

/**
 * 唯一建議使用的建表入口：正式環境直接拒絕，測試/開發環境才呼叫 sync()。
 */
async function safeSync(sequelize, options = {}) {
  if (!sequelize.lrsConfig || !sequelize.lrsConfig.allowSchemaChanges) {
    throw new ProductionGuardError('safeSync() 僅允許於 development / test 模式執行。');
  }
  return sequelize.sync(options);
}

let sharedInstance = null;

/** 取得全應用程式共用的 Sequelize 實例 (延遲建立)。 */
function getSequelize() {
  if (!sharedInstance) sharedInstance = createSequelize();
  return sharedInstance;
}

module.exports = {
  envFile,
  ProductionGuardError,
  ReadOnlyGuardError,
  containsDdl,
  isReadOnlySql,
  resolveDbConfig,
  resolveLegacyDbConfig,
  createSequelize,
  createLegacySequelize,
  getSequelize,
  safeSync,
};
