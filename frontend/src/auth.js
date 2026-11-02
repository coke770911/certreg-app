import { reactive } from 'vue';
import { apiGet, apiPost } from './api';

// 登入狀態 (全站共用)；實際憑證存在 httpOnly Cookie，這裡只保存顯示用的使用者資訊
export const auth = reactive({
  user: null,
  devLogin: false,
  loaded: false,
});

let pending = null;

export function loadUser(force = false) {
  if (auth.loaded && !force) return Promise.resolve(auth.user);
  pending ??= apiGet('/auth/me')
    .then((data) => {
      auth.user = data.user;
      auth.devLogin = data.devLogin;
    })
    .catch(() => {
      auth.user = null;
    })
    .finally(() => {
      auth.loaded = true;
      pending = null;
    });
  return pending.then(() => auth.user);
}

export async function login(username, password) {
  const data = await apiPost('/auth/login', { username, password });
  auth.user = data.user;
  auth.loaded = true;
  return data.user;
}

export async function logout() {
  await apiPost('/auth/logout');
  auth.user = null;
}
