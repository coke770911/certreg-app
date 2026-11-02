<template>
  <section>
    <RouterLink to="/" class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
      ← 回考試列表
    </RouterLink>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="error" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ error }}</p>

    <article v-else class="overflow-hidden rounded-2xl bg-white shadow-sm">
      <header class="bg-gradient-to-r from-brand-500 to-accent-500 p-6 text-white sm:p-8">
        <span class="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">{{ statusText }}</span>
        <h1 class="mt-3 text-2xl font-bold sm:text-3xl">{{ exam.name }}</h1>
      </header>

      <div class="grid gap-6 p-6 sm:p-8 lg:grid-cols-3">
        <dl class="grid gap-4 text-sm sm:grid-cols-2 lg:col-span-2">
          <div class="rounded-xl bg-slate-50 p-4">
            <dt class="text-slate-400">考試時間</dt>
            <dd class="mt-1 font-medium text-slate-800">{{ formatRange(exam.startDate, exam.endDate) }}</dd>
          </div>
          <div class="rounded-xl bg-slate-50 p-4">
            <dt class="text-slate-400">報名截止</dt>
            <dd class="mt-1 font-medium text-brand-600">{{ formatDateTime(exam.applyEndDate) }}</dd>
          </div>
          <div class="rounded-xl bg-slate-50 p-4">
            <dt class="text-slate-400">考試費用</dt>
            <dd class="mt-1 font-medium text-slate-800">{{ formatMoney(exam.fee) }}</dd>
          </div>
          <div class="rounded-xl bg-slate-50 p-4">
            <dt class="text-slate-400">報名人數</dt>
            <dd class="mt-1 font-medium text-slate-800">{{ exam.appliedCount }} / {{ exam.capacity }} 人</dd>
          </div>
          <div class="rounded-xl bg-slate-50 p-4 sm:col-span-2">
            <dt class="text-slate-400">考試項目</dt>
            <dd class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="item in exam.items"
                :key="item.id"
                class="rounded-full bg-accent-500/10 px-3 py-1 font-medium text-accent-600"
              >
                {{ item.name }}
              </span>
            </dd>
          </div>
          <div v-if="exam.requiresRegistration" class="rounded-xl bg-amber-50 p-4 text-amber-700 sm:col-span-2">
            此考試需先至官方網站註冊帳號
          </div>
        </dl>

        <aside class="flex flex-col gap-3">
          <RouterLink
            v-if="exam.isOpen && !exam.isFull"
            :to="{ name: 'exam-apply', params: { id: exam.id } }"
            class="w-full rounded-full bg-brand-500 px-6 py-3 text-center font-bold text-white shadow-sm transition hover:bg-brand-600"
          >
            我要報名
          </RouterLink>
          <span v-else class="w-full rounded-full bg-slate-200 px-6 py-3 text-center font-bold text-slate-500">
            {{ exam.isOpen ? '報名人數已滿' : '報名已截止' }}
          </span>
          <p v-if="exam.isOpen && !exam.isFull && !auth.user" class="text-center text-xs text-slate-400">
            報名前需先登入學校帳號
          </p>
        </aside>

        <div class="lg:col-span-3">
          <h2 class="mb-2 font-bold text-slate-700">備註說明</h2>
          <p class="whitespace-pre-line rounded-xl border border-slate-100 p-4 text-sm leading-relaxed text-slate-600">
            {{ exam.memo }}
          </p>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { apiGet } from '@/api';
import { auth } from '@/auth';
import { formatDateTime, formatMoney, formatRange } from '@/format';

const props = defineProps({ id: { type: String, required: true } });

const exam = ref(null);
const loading = ref(true);
const error = ref('');

const statusText = computed(() => {
  if (!exam.value.isOpen) return '報名已截止';
  return exam.value.isFull ? '額滿' : '報名中';
});

watch(
  () => props.id,
  async (id) => {
    loading.value = true;
    error.value = '';
    try {
      exam.value = await apiGet(`/exams/${id}`);
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);
</script>
