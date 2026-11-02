<template>
  <section class="mx-auto max-w-3xl">
    <RouterLink
      :to="{ name: 'my-applications' }"
      class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
    >
      ← 回報名紀錄
    </RouterLink>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="loadError" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ loadError }}</p>

    <template v-else>
      <div class="mb-6 rounded-2xl bg-gradient-to-r from-brand-500 to-accent-500 p-6 text-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-white/80">報名資料</p>
          <span class="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">{{ detail.payStatus }}</span>
        </div>
        <h1 class="mt-1 text-2xl font-bold">{{ detail.examName }}</h1>
        <p class="mt-2 text-sm text-white/90">
          {{ formatRange(detail.startDate, detail.endDate) }}　·　{{ formatMoney(detail.fee) }}
          <template v-if="detail.score">　·　成績 {{ detail.score }}</template>
        </p>
      </div>

      <p v-if="message" class="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{{ message }}</p>
      <p v-if="!detail.canEdit" class="mb-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
        報名已截止，資料無法修改；如需變更請洽承辦單位。
      </p>

      <form class="space-y-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8" novalidate @submit.prevent="onSubmit">
        <ApplicationFields
          :exam="examForFields"
          :form="form"
          :error-field="errorField"
          :readonly="!detail.canEdit"
          lock-identity
        />

        <p v-if="submitError" class="rounded-xl bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ submitError }}</p>

        <div class="flex flex-col gap-3 sm:flex-row">
          <button
            v-if="detail.canEdit"
            type="submit"
            :disabled="submitting"
            class="flex-1 rounded-full bg-brand-500 px-6 py-3 font-bold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {{ submitting ? '儲存中…' : '送出修改' }}
          </button>
          <a
            v-if="detail.canPrintSlip"
            :href="`/my/applications/${detail.id}/slip`"
            target="_blank"
            rel="noopener"
            class="flex-1 rounded-full border border-brand-500 px-6 py-3 text-center font-bold text-brand-600 hover:bg-brand-50"
          >
            列印繳費單
          </a>
        </div>
      </form>
    </template>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { apiGet, apiPut } from '@/api';
import { formatMoney, formatRange } from '@/format';
import ApplicationFields from '@/components/ApplicationFields.vue';

const props = defineProps({ id: { type: String, required: true } });

const loading = ref(true);
const loadError = ref('');
const detail = ref(null);
const form = reactive({});
const submitting = ref(false);
const submitError = ref('');
const errorField = ref('');
const message = ref('');

// 考試已被刪除時仍可顯示原報名項目
const examForFields = computed(
  () =>
    detail.value.exam ?? {
      items: [{ id: 0, name: detail.value.item }],
      requiresRegistration: false,
    }
);

async function load(id) {
  loading.value = true;
  loadError.value = '';
  try {
    detail.value = await apiGet(`/applications/${id}`);
    Object.assign(form, detail.value.form);
  } catch (err) {
    loadError.value = err.message;
  } finally {
    loading.value = false;
  }
}

watch(() => props.id, load, { immediate: true });

async function onSubmit() {
  submitError.value = '';
  errorField.value = '';
  message.value = '';
  submitting.value = true;
  try {
    const data = await apiPut(`/applications/${props.id}`, form);
    message.value = data.message;
    await load(props.id);
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
