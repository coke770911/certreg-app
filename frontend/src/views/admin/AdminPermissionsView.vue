<template>
  <section class="space-y-4">
    <div>
      <h2 class="text-xl font-bold text-slate-800">權限設定</h2>
      <p class="text-sm text-slate-500">
        設定哪些帳號可以使用管理端。異動會在下一次操作時立即生效，並記錄到系統日誌。
      </p>
    </div>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="loadError" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ loadError }}</p>

    <form v-else novalidate class="space-y-4" @submit.prevent="onSubmit">
      <p v-if="data.corrupted" class="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700" role="alert">
        權限設定檔損毀，所有管理權限已暫停。請由伺服器管理者檢查 data/permissions.json。
      </p>
      <p v-else-if="data.bootstrap" class="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800" role="alert">
        目前尚未指定「系統管理」帳號，所有教職員 (STAFF) 暫時都能使用管理端。儲存時必須包含您自己的系統管理權限，
        儲存後就只有下方列出的帳號能使用對應功能。
      </p>

      <dl class="grid gap-3 sm:grid-cols-3">
        <div v-for="(role, key) in data.roles" :key="key" class="rounded-2xl bg-white p-4 shadow-sm">
          <dt class="font-bold text-slate-800">{{ role.label }}</dt>
          <dd class="mt-1 text-sm text-slate-500">{{ role.description }}</dd>
        </div>
      </dl>

      <div class="rounded-2xl bg-white shadow-sm">
        <div class="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.2fr)_auto] gap-3 border-b border-slate-100 px-4 py-3 text-sm text-slate-500 md:grid">
          <span>帳號</span>
          <span>權限</span>
          <span>備註</span>
          <span class="w-12"></span>
        </div>
        <p v-if="!rows.length" class="px-4 py-8 text-center text-slate-500">尚未設定任何帳號</p>
        <ul class="divide-y divide-slate-100">
          <li
            v-for="(row, i) in rows"
            :key="row.key"
            class="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.2fr)_auto] md:items-center"
          >
            <div>
              <input
                :id="`account-${i}`"
                v-model.trim="row.account"
                maxlength="30"
                placeholder="教職員帳號"
                class="input py-2"
                :class="ring(`account-${i}`)"
                :aria-label="`第 ${i + 1} 列帳號`"
              />
              <p v-if="row.name" class="mt-1 text-xs text-slate-500">{{ row.name }} {{ row.title }}</p>
              <p v-else-if="row.saved" class="mt-1 text-xs text-amber-600">尚未登入過本系統</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="(role, key) in data.roles"
                :key="key"
                class="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition"
                :class="row.roles.includes(key) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'"
              >
                <input v-model="row.roles" type="checkbox" :value="key" class="accent-brand-500" />
                {{ role.label }}
              </label>
            </div>
            <input
              :id="`note-${i}`"
              v-model.trim="row.note"
              maxlength="50"
              placeholder="備註 (選填)"
              class="input py-2"
              :class="ring(`note-${i}`)"
              :aria-label="`第 ${i + 1} 列備註`"
            />
            <button
              type="button"
              class="justify-self-end rounded-full px-3 py-1 text-sm text-rose-500 hover:bg-rose-50"
              :aria-label="`移除 ${row.account || `第 ${i + 1} 列`}`"
              @click="rows.splice(i, 1)"
            >
              移除
            </button>
          </li>
        </ul>
        <div class="border-t border-slate-100 px-4 py-3">
          <button type="button" class="btn-outline text-sm" @click="addRow">＋ 新增帳號</button>
        </div>
      </div>

      <p v-if="message" class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{{ message }}</p>
      <p v-if="submitError" class="rounded-xl bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ submitError }}</p>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-slate-400">
          <template v-if="data.updatedAt">最後更新：{{ formatDateTime(data.updatedAt) }}（{{ data.updatedBy }}）</template>
        </p>
        <div class="flex gap-2">
          <button type="button" class="btn-outline" :disabled="submitting" @click="reset">還原</button>
          <button type="submit" class="btn-primary" :disabled="submitting || data.corrupted">
            {{ submitting ? '儲存中…' : '儲存設定' }}
          </button>
        </div>
      </div>
    </form>
  </section>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { apiGet, apiPut } from '@/api';
import { auth, loadUser } from '@/auth';
import { formatDateTime } from '@/format';

const data = ref(null);
const rows = ref([]);
const loading = ref(true);
const loadError = ref('');
const submitting = ref(false);
const submitError = ref('');
const errorField = ref('');
const message = ref('');
let seq = 0;

const ring = (field) => (errorField.value === field ? 'ring-2 ring-rose-300 border-rose-400' : '');

function apply(view) {
  data.value = view;
  rows.value = view.accounts.map((a) => ({ ...a, roles: [...a.roles], key: ++seq, saved: true }));
  // 初始狀態下預先帶入自己，避免儲存時漏掉
  if (view.bootstrap && auth.user && !rows.value.some((r) => r.account === auth.user.studentNo.toLowerCase())) {
    rows.value.unshift({
      account: auth.user.studentNo.toLowerCase(),
      roles: ['manage', 'system'],
      note: '',
      name: auth.user.name,
      title: auth.user.title,
      key: ++seq,
    });
  }
}

const reset = () => {
  apply(data.value);
  submitError.value = '';
  errorField.value = '';
};

async function addRow() {
  rows.value.push({ account: '', roles: ['manage'], note: '', key: ++seq });
  await nextTick();
  document.getElementById(`account-${rows.value.length - 1}`)?.focus();
}

onMounted(async () => {
  try {
    apply(await apiGet('/system/permissions'));
  } catch (err) {
    loadError.value = err.message;
  } finally {
    loading.value = false;
  }
});

async function onSubmit() {
  message.value = '';
  submitError.value = '';
  errorField.value = '';
  submitting.value = true;
  try {
    const res = await apiPut('/system/permissions', {
      accounts: rows.value.map(({ account, roles, note }) => ({ account, roles, note })),
    });
    message.value = res.message;
    apply(res);
    await loadUser(true); // 自己的權限可能也改了，更新選單
  } catch (err) {
    submitError.value = err.message;
    errorField.value = err.field || '';
    if (err.field) document.getElementById(err.field)?.focus();
  } finally {
    submitting.value = false;
  }
}
</script>
