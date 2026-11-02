'use strict';

/**
 * 登入驗證設定
 *
 * AUTH_PROVIDER：
 *   ad  -> 呼叫學校 AD 驗證服務 (SOAP) 驗證帳號密碼 (正式環境強制使用)
 *   dev -> 開發用登入，只要帳號存在於 v_UserData 即可用任意密碼登入；
 *          僅允許在 development / test 使用 (只會連到測試資料庫)
 * 未設定時：production 為 ad，其餘為 dev。
 */

require('./database'); // 確保 .env 已載入

const VALID_PROVIDERS = ['ad', 'dev'];

function resolveAuthConfig(env = process.env) {
  const isProduction = (env.APP_ENV || '').trim().toLowerCase() === 'production';
  const provider = (env.AUTH_PROVIDER || (isProduction ? 'ad' : 'dev')).trim().toLowerCase();

  if (!VALID_PROVIDERS.includes(provider)) {
    throw new Error(`AUTH_PROVIDER 設定錯誤：「${env.AUTH_PROVIDER}」，僅允許 ${VALID_PROVIDERS.join(' / ')}`);
  }
  if (isProduction && provider === 'dev') {
    throw new Error('正式環境禁止使用開發用登入 (AUTH_PROVIDER=dev)');
  }

  const jwtSecret = env.JWT_SECRET || '';
  if (jwtSecret.length < 32 || /change_me|your_/i.test(jwtSecret)) {
    throw new Error('JWT_SECRET 未設定或強度不足：請設定 32 字元以上的隨機字串');
  }

  const adUrl = (env.AD_AUTH_URL || '').trim();
  const adNamespace = (env.AD_AUTH_NAMESPACE || '').trim().replace(/\/+$/, '');
  if (provider === 'ad' && (!adUrl || !adNamespace)) {
    throw new Error('AUTH_PROVIDER=ad 時必須設定 AD_AUTH_URL 與 AD_AUTH_NAMESPACE');
  }

  return {
    isProduction,
    provider,
    jwtSecret,
    jwtExpiresIn: (env.JWT_EXPIRES_IN || '8h').trim(),
    adUrl,
    adNamespace,
  };
}

module.exports = { resolveAuthConfig };
