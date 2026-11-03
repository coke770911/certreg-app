<template>
  <section>
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800 sm:text-3xl">報名紀錄</h1>
      <p class="mt-1 text-slate-500">查看、修改或取消您的證照考試報名</p>
    </div>

    <p v-if="message" class="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{{ message }}</p>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="error" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ error }}</p>
    <div v-else-if="!items.length" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
      目前沒有報名紀錄
      <RouterLink to="/" class="mt-4 block font-medium text-brand-600 hover:underline">前往考試列表 →</RouterLink>
    </div>

    <ul v-else class="space-y-4">
      <li v-for="ap in items" :key="ap.id" class="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="font-bold text-slate-800">{{ ap.examName }}</h2>
            <p class="mt-1 text-sm text-accent-600">{{ ap.item }}</p>
          </div>
          <span class="rounded-full px-3 py-1 text-xs font-medium" :class="payClass(ap.payStatus)">{{ ap.payStatus }}</span>
        </div>

        <dl class="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div class="flex gap-2 sm:col-span-2">
            <dt class="shrink-0 text-slate-400">考試時間</dt>
            <dd class="text-slate-700">{{ formatRange(ap.startDate, ap.endDate) || '—' }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="shrink-0 text-slate-400">考試費用</dt>
            <dd class="text-slate-700">
              {{ formatMoney(ap.fee) }}<span v-if="ap.discount" class="text-amber-700">（{{ ap.discount }}）</span>
            </dd>
          </div>
          <div class="flex gap-2">
            <dt class="shrink-0 text-slate-400">成績</dt>
            <dd class="font-medium text-slate-700">{{ ap.score ?? '—' }}</dd>
          </div>
          <div class="flex gap-2 sm:col-span-2">
            <dt class="shrink-0 text-slate-400">報名截止</dt>
            <dd class="text-slate-700">{{ formatDateTime(ap.applyEndDate) || '—' }}</dd>
          </div>
        </dl>

        <div class="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <RouterLink
            :to="{ name: 'my-application', params: { id: ap.id } }"
            class="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600"
          >
            {{ ap.canEdit ? '詳細 / 修改' : '詳細' }}
          </RouterLink>
          <a
            v-if="ap.canPrintSlip"
            :href="`/my/applications/${ap.id}/slip`"
            target="_blank"
            rel="noopener"
            class="rounded-full bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            列印繳費單
          </a>
          <RouterLink
            v-if="ap.canPayTwqr"
            :to="{ name: 'twqr-pay', params: { id: ap.id } }"
            class="rounded-full border border-brand-500 px-4 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
          >
            TWQR線上轉帳
          </RouterLink>
          <button
            v-if="ap.canCancel"
            type="button"
            :disabled="cancelling === ap.id"
            class="rounded-full border border-rose-200 px-4 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            @click="onCancel(ap)"
          >
            {{ cancelling === ap.id ? '取消中…' : '取消報名' }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { apiGet, apiPost } from '@/api';
import { formatDateTime, formatMoney, formatRange } from '@/format';

const items = ref([]);
const loading = ref(true);
const error = ref('');
const message = ref('');
const cancelling = ref(null);

const payClass = (status) =>
  ({
    已繳費: 'bg-emerald-100 text-emerald-700',
    免繳費: 'bg-sky-100 text-sky-700',
    退費: 'bg-slate-100 text-slate-600',
  })[status] ?? 'bg-amber-100 text-amber-700';

async function load() {
  try {
    items.value = await apiGet('/applications/mine');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function onCancel(ap) {
  if (!window.confirm(`確定要取消「${ap.examName} - ${ap.item}」的報名嗎？`)) return;
  cancelling.value = ap.id;
  message.value = '';
  try {
    const data = await apiPost(`/applications/${ap.id}/cancel`);
    message.value = data.message;
    await load();
  } catch (err) {
    window.alert(err.message);
  } finally {
    cancelling.value = null;
  }
}

onMounted(load);
</script>
