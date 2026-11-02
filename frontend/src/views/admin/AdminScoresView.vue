<template>
  <section>
    <RouterLink
      :to="{ name: 'admin-exams' }"
      class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 print:hidden"
    >
      ← 回考試列表
    </RouterLink>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="loadError" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ loadError }}</p>

    <form v-else novalidate @submit.prevent="onSubmit">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-slate-800">成績處理</h2>
          <p class="text-sm text-slate-500">
            {{ data.exam.name }}　·　{{ formatRange(data.exam.startDate, data.exam.endDate) }}
            <span class="print:hidden">　·　成績欄位最多 10 個字</span>
          </p>
        </div>
        <button type="button" class="btn-outline text-sm print:hidden" @click="print">列印</button>
      </div>

      <p v-if="message" class="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 print:hidden" role="status">{{ message }}</p>
      <p v-if="submitError" class="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-600 print:hidden" role="alert">{{ submitError }}</p>

      <div class="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table class="w-full min-w-[900px] text-sm">
          <thead class="bg-slate-50 text-left text-slate-500">
            <tr>
              <th class="px-3 py-3">#</th>
              <th class="px-3 py-3">考試項目</th>
              <th class="px-3 py-3">系所班</th>
              <th class="px-3 py-3">學號</th>
              <th class="px-3 py-3">姓名</th>
              <th class="px-3 py-3">英文姓名</th>
              <th class="px-3 py-3">身分證字號</th>
              <th class="px-3 py-3">聯絡電話</th>
              <th class="px-3 py-3 print:hidden">繳費情況</th>
              <th class="px-3 py-3">成績</th>
              <th class="px-3 py-3 text-center">
                <label class="inline-flex items-center gap-1">
                  合格
                  <input
                    type="checkbox"
                    class="accent-brand-500 print:hidden"
                    aria-label="全部合格"
                    :checked="rows.length > 0 && rows.every((r) => r.pass)"
                    @change="(e) => rows.forEach((r) => (r.pass = e.target.checked))"
                  />
                </label>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="!rows.length">
              <td colspan="11" class="px-3 py-8 text-center text-slate-500">目前尚無資料</td>
            </tr>
            <tr v-for="(r, i) in rows" :key="r.id" class="hover:bg-slate-50">
              <td class="px-3 py-2 text-slate-400">{{ i + 1 }}</td>
              <td class="px-3 py-2">{{ r.item }}</td>
              <td class="px-3 py-2">{{ r.dept }}</td>
              <td class="px-3 py-2">{{ r.studentNo }}</td>
              <td class="px-3 py-2">{{ r.name }}</td>
              <td class="px-3 py-2">{{ r.englishName }}</td>
              <td class="px-3 py-2">{{ r.idNumber }}</td>
              <td class="px-3 py-2">{{ r.phone }}</td>
              <td class="px-3 py-2 print:hidden">{{ r.payStatus }}</td>
              <td class="px-3 py-2">
                <input
                  :id="`score-${r.id}`"
                  v-model="r.score"
                  maxlength="10"
                  class="w-24 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-brand-500 print:border-0"
                  :class="errorField === `score-${r.id}` && 'border-rose-400 ring-2 ring-rose-300'"
                  :aria-label="`${r.name} 成績`"
                />
              </td>
              <td class="px-3 py-2 text-center">
                <input v-model="r.pass" type="checkbox" class="accent-brand-500 print:hidden" :aria-label="`${r.name} 是否合格`" />
                <span class="hidden print:inline">{{ r.pass ? '合格' : '' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex justify-end print:hidden">
        <button type="submit" :disabled="submitting || !rows.length" class="btn-primary">
          {{ submitting ? '儲存中…' : '更新成績' }}
        </button>
      </div>
    </form>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import { apiGet, apiPut } from '@/api';
import { formatRange } from '@/format';

const props = defineProps({ id: { type: String, required: true } });

const data = ref(null);
const rows = ref([]);
const loading = ref(true);
const loadError = ref('');
const submitting = ref(false);
const submitError = ref('');
const errorField = ref('');
const message = ref('');

async function load() {
  try {
    data.value = await apiGet(`/admin/exams/${props.id}/applicants`);
    rows.value = data.value.applicants.map((a) => ({ ...a, pass: a.scorePass }));
  } catch (err) {
    loadError.value = err.message;
  } finally {
    loading.value = false;
  }
}

watch(() => props.id, () => {
  loading.value = true;
  load();
}, { immediate: true });

async function onSubmit() {
  message.value = '';
  submitError.value = '';
  errorField.value = '';
  submitting.value = true;
  try {
    const res = await apiPut(`/admin/exams/${props.id}/scores`, {
      scores: rows.value.map((r) => ({ id: r.id, score: r.score, pass: r.pass })),
    });
    message.value = res.message;
    await load();
  } catch (err) {
    submitError.value = err.message;
    errorField.value = err.field || '';
    if (err.field) document.getElementById(err.field)?.focus();
  } finally {
    submitting.value = false;
  }
}

const print = () => window.print();
</script>
