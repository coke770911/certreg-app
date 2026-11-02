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
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth, login } from '@/auth';

const route = useRoute();
const router = useRouter();

const username = ref('');
const password = ref('');
const error = ref('');
const errorField = ref('');
const submitting = ref(false);

// 只允許導回站內路徑，避免被利用導向外部網站
const safeRedirect = (value) =>
  typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/';

async function onSubmit() {
  error.value = '';
  errorField.value = '';
  submitting.value = true;
  try {
    await login(username.value, password.value);
    router.replace(safeRedirect(route.query.redirect));
  } catch (err) {
    error.value = err.message;
    errorField.value = err.field || '';
    password.value = '';
  } finally {
    submitting.value = false;
  }
}
</script>
