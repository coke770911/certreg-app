'use strict';

/**
 * 服務通訊埠設定：一律以 .env 的 PORT 為準。
 *
 * 外部環境變數 (例如開發工具、終端機殘留的 PORT=3000) 會讓 dotenv 不讀 .env 的值，
 * 因此 .env 有設定時以 .env 為準；.env 沒設定才採用外部環境變數。
 * 兩者都沒有或格式錯誤時拒絕啟動，不自動套用預設值。
 */

function resolvePort(envFile = {}, env = process.env) {
  const fromFile = envFile.PORT?.trim();
  const fromEnv = env.PORT?.trim();
  const raw = fromFile || fromEnv;
  if (!raw) throw new Error('未設定 PORT，請在 .env 設定服務通訊埠 (例如 PORT=8100)');

  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) {
    throw new Error(`PORT 格式錯誤：「${raw}」，應為 1–65535 的整數`);
  }

  const source = fromFile ? '.env' : '環境變數';
  const ignored = fromFile && fromEnv && fromEnv !== fromFile ? fromEnv : null;
  return { port, source, ignored };
}

module.exports = { resolvePort };
