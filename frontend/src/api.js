// 前後端同源，API 一律使用相對路徑 /api，不需設定主機與通訊埠；登入憑證由 httpOnly Cookie 自動帶入

export class ApiError extends Error {
  constructor(message, status, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || `API 錯誤 (${res.status})`, res.status, data.field);
  return data;
}

export const apiGet = (path) => request('GET', path);
export const apiPost = (path, body = {}) => request('POST', path, body);
export const apiPut = (path, body = {}) => request('PUT', path, body);
export const apiDelete = (path) => request('DELETE', path);
