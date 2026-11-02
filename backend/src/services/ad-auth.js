'use strict';

/**
 * 學校 AD 帳號驗證 (SOAP：GetOITAuthenticationConnect)
 * 對應舊系統 User/login 中的 SoapClient 呼叫，回傳字串「True 登入成功」代表驗證通過。
 */

const SUCCESS_RESULT = 'True 登入成功';

const xmlEscape = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

const xmlUnescape = (s) =>
  s.replace(/&(lt|gt|amp|apos|quot);/g, (_, e) => ({ lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' })[e]);

class AdServiceError extends Error {}

async function verifyAdCredentials(account, password, { adUrl, adNamespace }) {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
    `<GetOITAuthenticationConnect xmlns="${xmlEscape(adNamespace)}">` +
    `<Account>${xmlEscape(account)}</Account><Password>${xmlEscape(password)}</Password>` +
    '</GetOITAuthenticationConnect></soap:Body></soap:Envelope>';

  let res;
  try {
    res = await fetch(adUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"${adNamespace}/GetOITAuthenticationConnect"`,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new AdServiceError(`AD 驗證服務連線失敗：${err.message}`);
  }

  const xml = await res.text();
  const match = xml.match(/<GetOITAuthenticationConnectResult>([\s\S]*?)<\/GetOITAuthenticationConnectResult>/);
  if (!res.ok || !match) {
    throw new AdServiceError(`AD 驗證服務回應異常 (HTTP ${res.status})`);
  }
  const result = xmlUnescape(match[1]).trim();
  return { ok: result === SUCCESS_RESULT, result };
}

module.exports = { verifyAdCredentials, AdServiceError };
