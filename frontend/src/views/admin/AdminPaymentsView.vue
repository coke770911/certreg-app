<template>
  <section>
    <RouterLink
      :to="{ name: 'admin-exams' }"
      class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
    >
      ← 回考試列表
    </RouterLink>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="loadError" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ loadError }}</p>

    <template v-else>
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-slate-800">繳費處理</h2>
          <p class="text-sm text-slate-500">{{ data.exam.name }}　·　{{ formatRange(data.exam.startDate, data.exam.endDate) }}</p>
        </div>
        <div class="flex flex-wrap gap-2 text-sm">
          <span class="rounded-full bg-white px-4 py-1.5 shadow-sm">報名 {{ data.summary.total }} 人</span>
          <span class="rounded-full bg-emerald-50 px-4 py-1.5 text-emerald-700">已繳費 {{ data.summary.paidCount }} 人</span>
          <span class="rounded-full bg-emerald-50 px-4 py-1.5 font-medium text-emerald-700">
            總計 {{ formatMoney(data.summary.paidAmount) }}
          </span>
        </div>
      </div>

      <p v-if="message" class="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{{ message }}</p>
      <p v-if="actionError" class="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ actionError }}</p>

      <div class="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table class="w-full min-w-[860px] text-sm">
          <thead class="bg-slate-50 text-left text-slate-500">
            <tr>
              <th class="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  class="accent-brand-500"
                  aria-label="全選"
                  :checked="allSelected"
                  :indeterminate.prop="selected.length > 0 && !allSelected"
                  :disabled="!data.applicants.length"
                  @change="toggleAll"
                />
              </th>
              <th class="px-3 py-3">#</th>
              <th class="px-3 py-3">學號</th>
              <th class="px-3 py-3">姓名</th>
              <th class="px-3 py-3">英文姓名</th>
              <th class="px-3 py-3">身分證字號</th>
              <th class="px-3 py-3">聯絡電話</th>
              <th class="px-3 py-3">考試項目</th>
              <th class="px-3 py-3 text-right">繳費金額</th>
              <th class="px-3 py-3">繳費情況</th>
              <th class="px-3 py-3">繳費單</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="!data.applicants.length">
              <td colspan="11" class="px-3 py-8 text-center text-slate-500">目前尚無資料</td>
            </tr>
            <tr
              v-for="(a, i) in data.applicants"
              :key="a.id"
              class="hover:bg-slate-50"
              :class="selected.includes(a.id) && 'bg-brand-50/60'"
            >
              <td class="px-3 py-2">
                <input v-model="selected" type="checkbox" :value="a.id" class="accent-brand-500" :aria-label="`選取 ${a.name}`" />
              </td>
              <td class="px-3 py-2 text-slate-400">{{ i + 1 }}</td>
              <td class="px-3 py-2">{{ a.studentNo }}</td>
              <td class="px-3 py-2">{{ a.name }}</td>
              <td class="px-3 py-2">{{ a.englishName }}</td>
              <td class="px-3 py-2">{{ a.idNumber }}</td>
              <td class="px-3 py-2">{{ a.phone }}</td>
              <td class="px-3 py-2">{{ a.item }}</td>
              <td class="px-3 py-2 text-right">
                {{ Number(a.fee).toLocaleString('zh-TW') }}
                <span v-if="a.discount" class="block text-xs text-amber-700">{{ a.discount }}</span>
              </td>
              <td class="px-3 py-2">
                <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="PAY_CLASS[a.payCode]">{{ a.payStatus }}</span>
              </td>
              <td class="px-3 py-2">
                <a
                  :href="`/admin/applications/${a.id}/slip`"
                  target="_blank"
                  rel="noopener"
                  class="text-accent-600 hover:underline"
                >
                  列印
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sticky bottom-0 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 p-4 shadow-sm backdrop-blur">
        <span class="mr-auto text-sm text-slate-500">已選取 {{ selected.length }} 筆</span>
        <button
          v-for="act in ACTIONS"
          :key="act.key"
          type="button"
          :disabled="!selected.length || busy"
          class="rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-40"
          :class="act.class"
          @click="apply(act)"
        >
          {{ act.label }}
        </button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { apiGet, apiPost } from '@/api';
import { formatMoney, formatRange } from '@/format';

const props = defineProps({ id: { type: String, required: true } });

const ACTIONS = [
  { key: 'paid', label: '已繳費', class: 'bg-emerald-500 text-white hover:bg-emerald-600' },
  { key: 'unpaid', label: '未繳費', class: 'border border-slate-200 text-slate-700 hover:border-brand-500' },
  { key: 'exempt', label: '免繳費', class: 'border border-slate-200 text-slate-700 hover:border-brand-500' },
  { key: 'refund', label: '退費', class: 'bg-amber-100 text-amber-800 hover:bg-amber-200', confirm: true },
  { key: 'cancel', label: '取消報名', class: 'bg-rose-500 text-white hover:bg-rose-600', confirm: true },
];

const PAY_CLASS = {
  0: 'bg-slate-100 text-slate-600',
  1: 'bg-emerald-50 text-emerald-700',
  2: 'bg-amber-50 text-amber-700',
  3: 'bg-accent-500/10 text-accent-600',
};

const data = ref(null);
const loading = ref(true);
const loadError = ref('');
const selected = ref([]);
const busy = ref(false);
const message = ref('');
const actionError = ref('');

const allSelected = computed(() => data.value.applicants.length > 0 && selected.value.length === data.value.applicants.length);

function toggleAll() {
  selected.value = allSelected.value ? [] : data.value.applicants.map((a) => a.id);
}

async function load() {
  try {
    data.value = await apiGet(`/admin/exams/${props.id}/applicants`);
    const ids = new Set(data.value.applicants.map((a) => a.id));
    selected.value = selected.value.filter((id) => ids.has(id));
  } catch (err) {
    loadError.value = err.message;
  } finally {
    loading.value = false;
  }
}

watch(() => props.id, () => {
  loading.value = true;
  selected.value = [];
  load();
}, { immediate: true });

async function apply(act) {
  message.value = '';
  actionError.value = '';
  if (act.confirm && !window.confirm(`確定要將選取的 ${selected.value.length} 筆設為「${act.label}」？`)) return;
  busy.value = true;
  try {
    const res = await apiPost(`/admin/exams/${props.id}/payments`, { action: act.key, ids: selected.value });
    message.value = res.message;
    selected.value = [];
    await load();
  } catch (err) {
    actionError.value = err.message;
  } finally {
    busy.value = false;
  }
}
</script>
