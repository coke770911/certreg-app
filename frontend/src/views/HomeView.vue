<template>
  <section>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-slate-800 sm:text-3xl">證照考試報名</h1>
        <p class="mt-1 text-slate-500">目前開放報名中的證照考試</p>
      </div>
      <span v-if="exams.length" class="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
        共 {{ exams.length }} 場
      </span>
    </div>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="error" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ error }}</p>
    <p v-else-if="!exams.length" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
      目前沒有開放報名的考試
    </p>

    <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="exam in exams" :key="exam.id">
        <RouterLink
          :to="{ name: 'exam-detail', params: { id: exam.id } }"
          class="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md"
        >
          <div class="flex items-start justify-between gap-3">
            <h2 class="font-bold leading-snug text-slate-800">{{ exam.name }}</h2>
            <span
              class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="exam.isFull ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700'"
            >
              {{ exam.isFull ? '額滿' : '報名中' }}
            </span>
          </div>

          <dl class="mt-4 space-y-1.5 text-sm">
            <div class="flex gap-2">
              <dt class="shrink-0 text-slate-400">考試時間</dt>
              <dd class="text-slate-700">{{ formatRange(exam.startDate, exam.endDate) }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="shrink-0 text-slate-400">報名截止</dt>
              <dd class="font-medium text-brand-600">{{ formatDateTime(exam.applyEndDate) }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="shrink-0 text-slate-400">考試費用</dt>
              <dd class="text-slate-700">{{ formatMoney(exam.fee) }}</dd>
            </div>
          </dl>

          <div class="mt-auto pt-4">
            <div class="mb-1 flex justify-between text-xs text-slate-500">
              <span>已報名 {{ exam.appliedCount }} / {{ exam.capacity }} 人</span>
              <span>{{ exam.items.length }} 個考試項目</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                class="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500"
                :style="{ width: `${Math.min(100, (exam.appliedCount / exam.capacity) * 100)}%` }"
              ></div>
            </div>
          </div>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { apiGet } from '@/api';
import { formatDateTime, formatMoney, formatRange } from '@/format';

const exams = ref([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    exams.value = await apiGet('/exams');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});
</script>
