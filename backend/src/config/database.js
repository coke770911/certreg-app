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
 */

const path = require('node:path');
const { Sequelize } = require('sequelize');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// 舊資料庫的 datetime 欄位皆為台灣當地時間 (無時區資訊)，程式統一以台北時區解讀與寫入
process.env.TZ = process.env.TZ || 'Asia/Taipei';

const VALID_ENVS = ['development', 'test', 'production'];

class ProductionGuardError extends Error {
  constructor(message) {
    super(`[正式環境鎖定] ${message}`);
    this.name = 'ProductionGuardError';
  }
}

// 移除字串常值、註解與 [識別字]，避免資料內容誤判，也避免把 DDL 藏在註解後方
const SQL_NOISE = /--[^\r\n]*|\/\*[\s\S]*?\*\/|N?'(?:[^']|'')*'|\[(?:[^\]]|\]\])*\]|"(?:[^"]|"")*"/g;
const DDL_KEYWORDS = /\b(CREATE|ALTER|DROP|TRUNCATE|sp_rename)\b/i;

function containsDdl(sql) {
  if (typeof sql !== 'string') return false;
  return DDL_KEYWORDS.test(sql.replace(SQL_NOISE, ' '));
}

function parseBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
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

  const read = (p) => ({
    host: (env[`${p}HOST`] || '').trim(),
    port: Number.parseInt(env[`${p}PORT`] || '1433', 10),
    database: (env[`${p}NAME`] || '').trim(),
    username: (env[`${p}USER`] || '').trim(),
    password: env[`${p}PASSWORD`] || '',
  });

  const target = read(prefix);
  const missing = ['HOST', 'NAME', 'USER', 'PASSWORD'].filter((key) => !env[`${prefix}${key}`]);
  if (missing.length > 0) {
    throw new Error(`資料庫設定不完整，缺少：${missing.map((k) => prefix + k).join(', ')}`);
  }
  if (!Number.isInteger(target.port) || target.port <= 0) {
    throw new Error(`${prefix}PORT 必須為正整數`);
  }

  if (!isProduction) {
    const prod = read('PROD_DB_');
    const sameServer = prod.host.toLowerCase() === target.host.toLowerCase() && prod.port === target.port;
    if (sameServer && prod.database.toLowerCase() === target.database.toLowerCase()) {
      throw new Error(
        `TEST_DB_* 與 PROD_DB_* 指向同一個資料庫 (${target.host}:${target.port}/${target.database})，` +
          '為避免在正式資料庫建表，拒絕啟動。'
      );
    }
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

  const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: 'mssql',
    logging: config.logging ? console.log : false,
    timezone: '+08:00',
    dialectOptions: {
      options: {
        encrypt: config.encrypt,
        trustServerCertificate: config.trustServerCertificate,
        // datetime 欄位以本機時區 (Asia/Taipei) 解讀，而非 UTC
        useUTC: false,
        connectTimeout: 15000,
        requestTimeout: 30000,
      },
    },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define: {
      // 沿用舊有資料表名稱，不自動轉成複數
      freezeTableName: true,
    },
  });

  if (config.isProduction) {
    applyProductionGuard(sequelize);
  }

  sequelize.lrsConfig = Object.freeze({ ...config, password: undefined });
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
  ProductionGuardError,
  containsDdl,
  resolveDbConfig,
  createSequelize,
  getSequelize,
  safeSync,
};
