'use strict';

/**
 * 學校帳號密碼驗證 (校內認證服務 REST API)
 * 取代舊系統 User/login 中的 SOAP 呼叫 (GetOITAuthenticationConnect)。
 *
 * POST AUTH_API_URL，Header X-Auth-Key 帶 API 金鑰，內容 { Account, Password }，回應 JSON：
 *   { Ok: true,  Code: 'OK', Result: 'True 登入成功', ... }                  驗證通過
 *   { Ok: false, Code: 'INVALID_CREDENTIALS', Result: 'Fail 帳號或密碼錯誤…' } 帳號或密碼錯誤
 * 其他狀況 (金鑰錯誤、IP 不在白名單、超過速率限制、服務停用或故障) 視為驗證服務異常。
 */

const CREDENTIAL_CODES = ['OK', 'INVALID_CREDENTIALS'];

class AdServiceError extends Error {}

async function verifyAdCredentials(account, password, { authApiUrl, authApiKey }) {
  let res;
  try {
    res = await fetch(authApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Auth-Key': authApiKey },
      body: JSON.stringify({ Account: account, Password: password }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new AdServiceError(`認證服務連線失敗：${err.message}`);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // 回應不是 JSON，於下方視為異常
  }
  const code = typeof data?.Code === 'string' ? data.Code : '';
  if (!data || typeof data.Ok !== 'boolean' || !CREDENTIAL_CODES.includes(code)) {
    // 例如 401 API_KEY_INVALID、403 IP_DENIED、429 RATE_LIMITED、503 VENDOR_DISABLED
    throw new AdServiceError(`認證服務回應異常 (HTTP ${res.status}${code ? `，${code}` : ''})`);
  }
  return { ok: data.Ok && code === 'OK', result: String(data.Result ?? code) };
}

module.exports = { verifyAdCredentials, AdServiceError };
