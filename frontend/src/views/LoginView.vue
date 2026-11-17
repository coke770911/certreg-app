<template>
  <section class="mx-auto max-w-md">
    <div class="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div class="bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-5 text-white">
        <h1 class="text-xl font-bold">登入</h1>
        <p class="mt-1 text-sm text-white/85">請使用學校帳號與密碼登入</p>
      </div>

      <form class="space-y-4 p-6" novalidate @submit.prevent="onSubmit">
        <p v-if="auth.devLogin" class="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
          開發模式：測試資料庫中的帳號可使用任意密碼登入
        </p>

        <div>
          <label for="username" class="mb-1 block text-sm font-medium text-slate-700">學號 / 帳號</label>
          <input
            id="username"
            v-model="username"
            type="text"
            autocomplete="username"
            class="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            :class="{ 'border-rose-400': errorField === 'username' }"
          />
        </div>

        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-slate-700">密碼</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            :class="{ 'border-rose-400': errorField === 'password' }"
          />
        </div>

        <div v-if="captcha.enabled">
          <label for="captcha" class="mb-1 block text-sm font-medium text-slate-700">驗證碼</label>
          <div class="flex items-center gap-3">
            <input
              id="captcha"
              v-model="captcha.answer"
              type="text"
              inputmode="numeric"
              maxlength="4"
              autocomplete="off"
              placeholder="請輸入圖中 4 位數字"
              class="w-full min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 tracking-widest outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              :class="{ 'border-rose-400': errorField === 'captcha' }"
            />
            <button
              type="button"
              class="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 hover:border-brand-500"
              title="看不清楚？點圖片換一張"
              aria-label="換一張驗證碼"
              @click="refreshCaptcha"
            >
              <img v-if="captcha.image" :src="captcha.image" alt="驗證碼圖片" width="120" height="44" class="block h-11 w-[120px]" />
              <span v-else class="block h-11 w-[120px] text-center text-xs leading-[44px] text-slate-400">載入中…</span>
            </button>
          </div>
          <p class="mt-1 text-xs text-slate-400">看不清楚？點圖片換一張</p>
        </div>

        <p v-if="error" class="rounded-xl bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ error }}</p>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full rounded-full bg-brand-500 px-6 py-3 font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {{ submitting ? '登入中…' : '登入' }}
        </button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth, login } from '@/auth';
import { apiGet } from '@/api';

const route = useRoute();
const router = useRouter();

const username = ref('');
const password = ref('');
const error = ref('');
const errorField = ref('');
const submitting = ref(false);
const captcha = reactive({ enabled: false, id: '', image: '', answer: '' });

// 驗證碼只能使用一次，登入失敗或過期都要換一張
async function refreshCaptcha() {
  captcha.answer = '';
  captcha.image = '';
  try {
    const data = await apiGet('/auth/captcha');
    Object.assign(captcha, { enabled: data.enabled, id: data.id ?? '', image: data.image ?? '' });
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(refreshCaptcha);

// 只允許導回站內路徑，避免被利用導向外部網站
const safeRedirect = (value) =>
  typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/';

async function onSubmit() {
  error.value = '';
  errorField.value = '';
  submitting.value = true;
  try {
    await login(username.value, password.value, captcha.enabled ? { id: captcha.id, answer: captcha.answer } : undefined);
    router.replace(safeRedirect(route.query.redirect));
  } catch (err) {
    error.value = err.message;
    errorField.value = err.field || '';
    // 驗證碼錯誤時保留密碼，只換驗證碼
    if (err.field !== 'captcha') password.value = '';
    await refreshCaptcha();
    if (err.field) document.getElementById(err.field)?.focus();
  } finally {
    submitting.value = false;
  }
}
</script>
