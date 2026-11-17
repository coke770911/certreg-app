'use strict';

/**
 * 登入驗證設定
 *
 * AUTH_PROVIDER：
 *   ad  -> 呼叫校內認證服務 REST API (AUTH_API_URL + AUTH_API_KEY) 驗證帳號密碼 (正式環境強制使用)
 *   dev -> 開發用登入，只要帳號存在於 v_UserData 即可用任意密碼登入；
 *          僅允許在 development / test 使用 (只會連到測試資料庫)
 * 未設定時：production 為 ad，其餘為 dev。
 *
 * LOGIN_CAPTCHA：登入是否需要圖片驗證碼 (預設 true)；只有 development / test 可設為 false，
 *                正式環境一律需要。
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

  const authApiUrl = (env.AUTH_API_URL || '').trim();
  const authApiKey = (env.AUTH_API_KEY || '').trim();
  if (provider === 'ad' && (!authApiUrl || !authApiKey)) {
    throw new Error('AUTH_PROVIDER=ad 時必須設定 AUTH_API_URL 與 AUTH_API_KEY (校內認證服務 REST API 網址與金鑰)');
  }
  if (provider === 'ad' && !/^https:\/\//i.test(authApiUrl)) {
    throw new Error('AUTH_API_URL 必須使用 https (帳號密碼不可明文傳送)');
  }

  const captcha = isProduction || (env.LOGIN_CAPTCHA || 'true').trim().toLowerCase() !== 'false';

  return {
    isProduction,
    provider,
    captcha,
    jwtSecret,
    jwtExpiresIn: (env.JWT_EXPIRES_IN || '8h').trim(),
    authApiUrl,
    authApiKey,
  };
}

module.exports = { resolveAuthConfig };
