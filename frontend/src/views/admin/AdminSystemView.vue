<template>
  <section class="space-y-6">
    <!-- 伺服器狀態 -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xl font-bold text-slate-800">系統資訊</h2>
      <button type="button" class="btn-outline text-sm" :disabled="refreshing" @click="refresh">
        {{ refreshing ? '更新中…' : '重新整理' }}
      </button>
    </div>

    <p v-if="statusError" class="rounded-2xl bg-rose-50 p-4 text-sm text-rose-600">{{ statusError }}</p>
    <div v-else-if="status" class="space-y-3">
      <p
        v-if="status.permissions.bootstrap"
        class="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800"
        role="alert"
      >
        尚未指定任何「系統管理」帳號，目前所有教職員 (STAFF) 都能進入管理端。請到
        <RouterLink :to="{ name: 'admin-permissions' }" class="font-bold underline">權限設定</RouterLink>
        指定管理人員。
      </p>
      <p
        v-if="status.database.missingColumns?.length"
        class="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700"
        role="alert"
      >
        資料庫尚未補上欄位：
        <strong>{{ status.database.missingColumns.map((c) => `${c.table}.${c.column}（${c.purpose}）`).join('、') }}</strong>，
        相關功能會出錯。請由資料庫管理者執行 <code>backend/database/pending-production-changes.sql</code>。
      </p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <p class="text-xs text-slate-400">運行模式</p>
          <p class="mt-1 text-lg font-bold" :class="status.app.appEnv === 'production' ? 'text-emerald-600' : 'text-amber-600'">
            {{ envLabel(status.app.appEnv) }}
          </p>
          <p class="text-xs text-slate-500">v{{ status.app.version }} · Node {{ status.app.node }}</p>
        </div>
        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <p class="text-xs text-slate-400">資料庫</p>
          <p class="mt-1 text-lg font-bold" :class="status.database.ok ? 'text-emerald-600' : 'text-rose-600'">
            {{ status.database.ok ? '連線正常' : '連線失敗' }}
          </p>
          <p class="text-xs text-slate-500">{{ status.database.ok ? `回應 ${status.database.latencyMs} ms` : status.database.message }}</p>
        </div>
        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <p class="text-xs text-slate-400">已運行</p>
          <p class="mt-1 text-lg font-bold text-slate-800">{{ formatUptime(status.app.uptimeSec) }}</p>
          <p class="text-xs text-slate-500">啟動於 {{ formatDateTime(status.app.startedAt) }} · 記憶體 {{ status.app.memoryMb }} MB</p>
        </div>
        <div class="rounded-2xl bg-white p-4 shadow-sm">
          <p class="text-xs text-slate-400">近 7 天錯誤</p>
          <p class="mt-1 text-lg font-bold" :class="status.logs.counts.error ? 'text-rose-600' : 'text-emerald-600'">
            {{ status.logs.counts.error }} 筆
          </p>
          <p class="text-xs text-slate-500">
            {{ status.logs.lastError ? `最近一次 ${formatDateTime(status.logs.lastError)}` : '沒有錯誤' }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="rounded-full bg-white px-3 py-1 text-slate-500 shadow-sm">今日 {{ status.logs.todayCount }} 筆紀錄</span>
        <span
          v-for="(label, key) in status.logs.categories"
          :key="key"
          class="rounded-full px-3 py-1"
          :class="categoryClass(key)"
        >
          近 7 天{{ label }} {{ status.logs.counts[key] }}
        </span>
        <span class="rounded-full bg-white px-3 py-1 text-slate-400 shadow-sm">日誌保留 {{ status.logs.retentionDays }} 天</span>
      </div>
    </div>

    <!-- 系統日誌 -->
    <div class="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <h3 class="mb-4 text-lg font-bold text-slate-800">系統日誌</h3>
      <form class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" @submit.prevent="search(1)">
        <label class="text-sm text-slate-600">
          起始日期
          <input id="from" v-model="filters.from" type="date" class="input mt-1 py-2" />
        </label>
        <label class="text-sm text-slate-600">
          結束日期
          <input id="to" v-model="filters.to" type="date" class="input mt-1 py-2" />
        </label>
        <label class="text-sm text-slate-600">
          類別
          <select v-model="filters.category" class="input mt-1 py-2">
            <option value="">全部</option>
            <option v-for="(label, key) in categories" :key="key" :value="key">{{ label }}</option>
          </select>
        </label>
        <label class="text-sm text-slate-600">
          層級
          <select v-model="filters.level" class="input mt-1 py-2">
            <option value="">全部</option>
            <option value="info">一般</option>
            <option value="warn">警告</option>
            <option value="error">錯誤</option>
          </select>
        </label>
        <label class="text-sm text-slate-600 lg:col-span-2">
          關鍵字
          <div class="mt-1 flex gap-2">
            <input v-model.trim="filters.q" type="search" placeholder="帳號、考試、動作…" class="input py-2" />
            <button type="submit" class="btn-primary shrink-0 px-5 py-2">查詢</button>
          </div>
        </label>
      </form>

      <p v-if="logError" class="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ logError }}</p>
      <p v-else-if="logs" class="mt-4 text-sm text-slate-500">
        {{ logs.from }} ~ {{ logs.to }} 共 {{ logs.total }} 筆
      </p>

      <div v-if="logs" class="mt-3 overflow-x-auto">
        <table class="w-full min-w-[820px] text-sm">
          <thead class="bg-slate-50 text-left text-slate-500">
            <tr>
              <th class="px-3 py-2">時間</th>
              <th class="px-3 py-2">類別</th>
              <th class="px-3 py-2">動作</th>
              <th class="px-3 py-2">帳號</th>
              <th class="min-w-[9rem] px-3 py-2">對象</th>
              <th class="min-w-[12rem] px-3 py-2">內容</th>
              <th class="px-3 py-2">來源 IP</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="!logs.items.length">
              <td colspan="7" class="px-3 py-8 text-center text-slate-500">沒有符合的紀錄</td>
            </tr>
            <template v-for="(r, i) in logs.items" :key="`${r.time}-${i}`">
              <tr :class="r.level === 'error' ? 'bg-rose-50/60' : r.level === 'warn' ? 'bg-amber-50/60' : 'hover:bg-slate-50'">
                <td class="whitespace-nowrap px-3 py-2 text-slate-500">{{ formatDateTime(r.time) }}</td>
                <td class="px-3 py-2">
                  <span class="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs" :class="categoryClass(r.category)">
                    {{ categories[r.category] ?? r.category }}
                  </span>
                </td>
                <td class="px-3 py-2 font-medium text-slate-800">{{ r.action }}</td>
                <td class="whitespace-nowrap px-3 py-2">
                  {{ r.actor ?? '—' }}
                  <span v-if="r.impersonatedBy" class="block text-xs text-slate-400">代理：{{ r.impersonatedBy }}</span>
                </td>
                <td class="px-3 py-2 text-slate-600">{{ r.target ?? '' }}</td>
                <td class="px-3 py-2 text-slate-600">
                  <span v-if="r.error" class="text-rose-600">{{ r.error.message }}</span>
                  <span v-else>{{ r.detail ?? '' }}</span>
                  <button
                    v-if="r.error?.stack"
                    type="button"
                    class="ml-2 text-xs text-accent-600 hover:underline"
                    :aria-expanded="expanded.has(i)"
                    @click="toggle(i)"
                  >
                    {{ expanded.has(i) ? '收合' : '詳細' }}
                  </button>
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-xs text-slate-400">{{ r.ip ?? '' }}</td>
              </tr>
              <tr v-if="expanded.has(i)">
                <td colspan="7" class="bg-slate-900 px-4 py-3">
                  <pre class="overflow-x-auto whitespace-pre text-xs text-slate-100">{{ r.error.stack }}</pre>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div v-if="logs && pageCount > 1" class="mt-4 flex items-center justify-center gap-3 text-sm">
        <button type="button" class="btn-outline" :disabled="logs.page <= 1" @click="search(logs.page - 1)">上一頁</button>
        <span class="text-slate-500">{{ logs.page }} / {{ pageCount }}</span>
        <button type="button" class="btn-outline" :disabled="logs.page >= pageCount" @click="search(logs.page + 1)">下一頁</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { apiGet } from '@/api';
import { formatDateTime } from '@/format';

const status = ref(null);
const statusError = ref('');
const logs = ref(null);
const logError = ref('');
const categories = ref({});
const refreshing = ref(false);
const expanded = ref(new Set());

const taipeiDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

const filters = reactive({ from: taipeiDate(-6), to: taipeiDate(), category: '', level: '', q: '' });

const pageCount = computed(() => (logs.value ? Math.ceil(logs.value.total / logs.value.pageSize) : 0));

const ENV_LABELS = { production: '正式環境', development: '開發環境', test: '測試環境' };
const envLabel = (env) => ENV_LABELS[env] ?? env;

const CATEGORY_CLASSES = {
  auth: 'bg-sky-50 text-sky-700',
  apply: 'bg-emerald-50 text-emerald-700',
  admin: 'bg-brand-50 text-brand-700',
  system: 'bg-violet-50 text-violet-700',
  error: 'bg-rose-100 text-rose-700',
};
const categoryClass = (key) => CATEGORY_CLASSES[key] ?? 'bg-slate-100 text-slate-600';

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d} 天 ${h} 小時` : h ? `${h} 小時 ${m} 分` : `${m} 分鐘`;
}

function toggle(i) {
  const next = new Set(expanded.value);
  next.has(i) ? next.delete(i) : next.add(i);
  expanded.value = next;
}

async function loadStatus() {
  try {
    status.value = await apiGet('/system/status');
    categories.value = status.value.logs.categories;
    statusError.value = '';
  } catch (err) {
    statusError.value = err.message;
  }
}

async function search(page = 1) {
  logError.value = '';
  expanded.value = new Set();
  const params = new URLSearchParams({ page: String(page) });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  try {
    const data = await apiGet(`/system/logs?${params}`);
    categories.value = data.categories;
    logs.value = data;
  } catch (err) {
    logError.value = err.message;
    if (err.field) document.getElementById(err.field)?.focus();
  }
}

async function refresh() {
  refreshing.value = true;
  await Promise.all([loadStatus(), search(logs.value?.page ?? 1)]);
  refreshing.value = false;
}

onMounted(refresh);
</script>
