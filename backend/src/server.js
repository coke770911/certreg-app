'use strict';

/**
 * 服務啟動入口：只開啟 .env 的 PORT 一個通訊埠，同時提供網站與 API。
 */

const { resolveDbConfig } = require('./config/database');
const { resolveAuthConfig } = require('./config/auth');
const app = require('./app');
const { writeLog, logError, flushLogs } = require('./services/audit-log');
const { loadPermissions } = require('./services/permission-service');
const { findMissingColumns } = require('./services/schema-check');

// 啟動前先驗證設定，APP_ENV、資料庫或登入設定錯誤時直接中止
const dbConfig = resolveDbConfig();
const authConfig = resolveAuthConfig();
const port = Number.parseInt(process.env.PORT || '3000', 10);

const server = app.listen(port, () => {
  console.log(`[LRS] 運行模式：${dbConfig.appEnv}${dbConfig.isProduction ? ' (正式環境鎖定)' : ''}`);
  console.log(`[LRS] 資料庫：${dbConfig.host}:${dbConfig.port} / ${dbConfig.database}`);
  console.log(`[LRS] 登入方式：${authConfig.provider === 'ad' ? '學校 AD 驗證' : '開發用登入 (任意密碼)'}`);
  console.log(`[LRS] 網站與 API 已啟動：http://localhost:${port}`);
  // 首次啟動時會把舊的 ADMIN_ACCOUNTS 匯入權限設定檔，之後即以權限設定為準
  loadPermissions();
  if (process.env.ADMIN_ACCOUNTS) {
    console.warn('[LRS] .env 的 ADMIN_ACCOUNTS 已不再使用 (改由管理端「權限設定」維護)，可自 .env 移除');
  }
  writeLog({ category: 'system', action: '伺服器啟動', detail: `${dbConfig.appEnv}，Port ${port}` });
  warnMissingColumns();
});

// 提醒：資料庫尚未補上 database/pending-production-changes.sql 的欄位 (正式資料庫需手動執行)
async function warnMissingColumns() {
  try {
    const missing = await findMissingColumns();
    if (missing.length === 0) return;
    const list = missing.map((c) => `${c.table}.${c.column} (${c.purpose})`).join('、');
    console.warn(`[LRS] ⚠ 資料庫缺少欄位：${list}，相關功能會出錯。請執行 database/pending-production-changes.sql`);
    writeLog({ category: 'system', level: 'warn', action: '資料庫缺少欄位', detail: list });
  } catch (err) {
    console.error('[LRS] 資料庫欄位檢查失敗：', err.message);
  }
}

// 未攔截的錯誤也寫入系統日誌
process.on('unhandledRejection', (err) => {
  console.error(err);
  logError(err);
});
process.on('uncaughtException', (err) => {
  console.error(err);
  logError(err);
  flushLogs().finally(() => process.exit(1));
});

const shutdown = () => {
  writeLog({ category: 'system', action: '伺服器關閉' });
  flushLogs().finally(() => server.close(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
