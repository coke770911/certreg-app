<template>
  <section>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <input v-model.trim="keyword" type="search" placeholder="搜尋考試名稱" class="input max-w-xs bg-white" />
      <label class="flex items-center gap-2 text-sm text-slate-600">
        <input v-model="hideEnded" type="checkbox" class="accent-brand-500" />
        隱藏已結束的考試
      </label>
    </div>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="error" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ error }}</p>
    <p v-else-if="!filtered.length" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">沒有符合的考試</p>

    <ul v-else class="space-y-3">
      <li v-for="exam in filtered" :key="exam.id" class="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs text-slate-400">#{{ exam.id }}</p>
            <h2 class="font-bold text-slate-800">{{ exam.name }}</h2>
            <p class="mt-1 text-sm text-accent-600">{{ exam.items.map((i) => i.name).join('、') || '—' }}</p>
          </div>
          <div class="flex flex-wrap gap-2 text-xs font-medium">
            <span class="rounded-full px-3 py-1" :class="exam.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'">
              {{ exam.isPublished ? '上架' : '下架' }}
            </span>
            <span class="rounded-full px-3 py-1" :class="statusOf(exam).class">{{ statusOf(exam).label }}</span>
          </div>
        </div>

        <dl class="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div class="flex gap-2 sm:col-span-2">
            <dt class="shrink-0 text-slate-400">考試時間</dt>
            <dd class="text-slate-700">{{ formatRange(exam.startDate, exam.endDate) }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="shrink-0 text-slate-400">報名截止</dt>
            <dd class="text-slate-700">{{ formatDateTime(exam.applyEndDate) }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="shrink-0 text-slate-400">報名人數</dt>
            <dd class="font-medium" :class="exam.appliedCount >= exam.capacity ? 'text-rose-600' : 'text-slate-700'">
              {{ exam.appliedCount }} / {{ exam.capacity }}
            </dd>
          </div>
        </dl>

        <div class="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 text-sm font-medium">
          <RouterLink :to="{ name: 'admin-exam-edit', params: { id: exam.id } }" class="btn-outline">
            {{ exam.canEdit ? '詳細 / 修改' : '詳細' }}
          </RouterLink>
          <RouterLink :to="{ name: 'admin-payments', params: { id: exam.id } }" class="btn-outline">繳費處理</RouterLink>
          <RouterLink :to="{ name: 'admin-scores', params: { id: exam.id } }" class="btn-outline">成績處理</RouterLink>
          <a :href="`/api/admin/exams/${exam.id}/export`" class="btn-outline" download>名單匯出 Excel</a>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiGet } from '@/api';
import { formatDateTime, formatRange } from '@/format';

const exams = ref([]);
const loading = ref(true);
const error = ref('');
const keyword = ref('');
const hideEnded = ref(false);

const filtered = computed(() =>
  exams.value.filter(
    (e) => (!keyword.value || e.name.includes(keyword.value)) && (!hideEnded.value || e.canEdit)
  )
);

function statusOf(exam) {
  if (!exam.canEdit) return { label: '已結束', class: 'bg-slate-100 text-slate-500' };
  if (exam.isOpen) return { label: '報名中', class: 'bg-brand-50 text-brand-700' };
  return { label: '報名截止', class: 'bg-amber-50 text-amber-700' };
}

onMounted(async () => {
  try {
    exams.value = await apiGet('/admin/exams');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});
</script>
