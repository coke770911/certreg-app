<template>
  <section class="mx-auto max-w-3xl">
    <RouterLink
      :to="{ name: 'exam-detail', params: { id } }"
      class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
    >
      ← 回考試資訊
    </RouterLink>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="loadError" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ loadError }}</p>

    <template v-else>
      <!-- 考試摘要 -->
      <div class="mb-6 rounded-2xl bg-gradient-to-r from-brand-500 to-accent-500 p-6 text-white shadow-sm">
        <p class="text-sm text-white/80">線上報名</p>
        <h1 class="mt-1 text-2xl font-bold">{{ exam.name }}</h1>
        <p class="mt-2 text-sm text-white/90">
          {{ formatRange(exam.startDate, exam.endDate) }}　·　{{ formatFeeRange(exam) }}
        </p>
      </div>

      <!-- 報名完成 / 已報名 -->
      <div v-if="application" class="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600">
          ✓
        </div>
        <h2 class="mt-4 text-xl font-bold text-slate-800">{{ justApplied ? '報名成功！' : '您已報名此考試' }}</h2>
        <dl class="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
          <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt class="text-slate-400">考試項目</dt>
            <dd class="font-medium text-slate-800">{{ application.item }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt class="text-slate-400">報名費用</dt>
            <dd class="font-medium text-slate-800">
              {{ formatMoney(application.fee) }}<span v-if="application.discount" class="text-amber-700">（{{ application.discount }}）</span>
            </dd>
          </div>
          <div class="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt class="text-slate-400">繳費狀態</dt>
            <dd class="font-medium text-brand-600">{{ application.payStatus }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-slate-400">報名時間</dt>
            <dd class="text-slate-700">{{ formatDateTime(application.createdAt) }}</dd>
          </div>
        </dl>
        <p v-if="application.payStatus === '尚未繳費'" class="mt-6 text-sm text-slate-500">
          請列印繳費單，並於報名截止前完成繳費。
        </p>
        <div class="mt-6 flex flex-wrap justify-center gap-3">
          <a
            v-if="application.payStatus === '尚未繳費'"
            :href="`/my/applications/${application.id}/slip`"
            target="_blank"
            rel="noopener"
            class="rounded-full bg-brand-500 px-6 py-2.5 font-medium text-white hover:bg-brand-600"
          >
            列印繳費單
          </a>
          <RouterLink
            :to="{ name: 'my-applications' }"
            class="rounded-full border border-slate-200 px-6 py-2.5 font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600"
          >
            查看報名紀錄
          </RouterLink>
        </div>
      </div>

      <p v-else-if="!exam.isOpen" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
        此考試報名已截止
      </p>
      <p v-else-if="exam.isFull" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
        此考試報名人數已滿
      </p>

      <!-- 報名表單 -->
      <form v-else class="space-y-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8" novalidate @submit.prevent="onSubmit">
        <ApplicationFields :exam="exam" :form="form" :error-field="errorField" />

        <p v-if="submitError" class="rounded-xl bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ submitError }}</p>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full rounded-full bg-brand-500 px-6 py-3 text-lg font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {{ submitting ? '送出中…' : '送出報名資料' }}
        </button>
      </form>
    </template>
  </section>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';
import { apiGet, apiPost } from '@/api';
import { formatDateTime, formatFeeRange, formatMoney, formatRange } from '@/format';
import ApplicationFields from '@/components/ApplicationFields.vue';

const props = defineProps({ id: { type: String, required: true } });

const loading = ref(true);
const loadError = ref('');
const exam = ref(null);
const application = ref(null);
const justApplied = ref(false);

const form = reactive({});
const submitting = ref(false);
const submitError = ref('');
const errorField = ref('');

watch(
  () => props.id,
  async (id) => {
    loading.value = true;
    loadError.value = '';
    justApplied.value = false;
    try {
      const data = await apiGet(`/applications/form/${id}`);
      exam.value = data.exam;
      application.value = data.application;
      Object.assign(form, {
        ...data.profile,
        itemId: data.exam.items.length === 1 ? data.exam.items[0].id : null,
        // 收費方案：空字串為原價
        discount: '',
        isRegistered: false,
        memo: '',
      });
    } catch (err) {
      loadError.value = err.message;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);

async function onSubmit() {
  submitError.value = '';
  errorField.value = '';
  submitting.value = true;
  try {
    const data = await apiPost('/applications', { ...form, examId: Number(props.id) });
    application.value = data.application;
    justApplied.value = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    submitError.value = err.message;
    errorField.value = err.field || '';
    if (err.field) document.getElementById(err.field)?.focus();
  } finally {
    submitting.value = false;
  }
}
</script>
