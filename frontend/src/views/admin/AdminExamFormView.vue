<template>
  <section class="mx-auto max-w-3xl">
    <RouterLink
      :to="{ name: 'admin-exams' }"
      class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
    >
      ← 回考試列表
    </RouterLink>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="loadError" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600">{{ loadError }}</p>

    <form v-else class="space-y-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8" novalidate @submit.prevent="onSubmit">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-xl font-bold text-slate-800">{{ isCreate ? '新增證照考試' : '考試資訊' }}</h2>
        <span v-if="exam" class="text-sm text-slate-500">目前報名人數：{{ exam.appliedCount }}</span>
      </div>

      <p v-if="message" class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{{ message }}</p>
      <p v-if="exam && !exam.canEdit" class="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">考試已結束，資料無法修改。</p>

      <fieldset :disabled="readonly" class="space-y-6">
        <div>
          <label for="name" class="mb-1 block text-sm font-medium text-slate-700">考試名稱 <span class="text-rose-500">*</span></label>
          <input v-if="isCreate" id="name" v-model="form.name" class="input" :class="ring('name')" maxlength="255" />
          <p v-else class="font-medium text-slate-800">{{ exam.name }}</p>
        </div>

        <div>
          <p class="mb-1 text-sm font-medium text-slate-700">考試項目 <span class="text-rose-500">*</span></p>
          <template v-if="isCreate">
            <div class="flex flex-col gap-2 sm:flex-row">
              <select v-model="groupId" class="input sm:w-1/2" aria-label="證照分類">
                <option value="">-- 請選擇證照分類 --</option>
                <option v-for="g in visibleGroups" :key="g.id" :value="g.id">{{ g.name }}（{{ g.items.length }}）</option>
              </select>
              <RouterLink :to="{ name: 'admin-licenses' }" class="self-center text-sm text-accent-600 hover:underline">
                找不到項目？前往新增證照項目
              </RouterLink>
            </div>
            <div v-if="currentGroup" id="itemIds" tabindex="-1" class="mt-3 grid gap-2 sm:grid-cols-2" :class="ring('itemIds')">
              <p v-if="!currentGroup.items.length" class="text-sm text-slate-500">此分類尚未新增證照項目</p>
              <label
                v-for="item in currentGroup.items"
                :key="item.id"
                class="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-2.5 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
              >
                <input v-model="form.itemIds" type="checkbox" :value="item.id" class="accent-brand-500" />
                <span class="text-slate-700">{{ item.name }}</span>
              </label>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <span v-if="!form.itemIds.length" class="text-sm text-slate-400">尚未選擇項目</span>
              <button
                v-for="item in selectedItems"
                :key="item.id"
                type="button"
                class="rounded-full bg-accent-500/10 px-3 py-1 text-sm text-accent-600 hover:bg-rose-50 hover:text-rose-600"
                :title="`移除 ${item.name}`"
                @click="form.itemIds = form.itemIds.filter((id) => id !== item.id)"
              >
                {{ item.name }} ✕
              </button>
            </div>
          </template>
          <p v-else class="text-slate-800">{{ exam.items.map((i) => i.name).join('、') }}</p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="capacity" class="mb-1 block text-sm font-medium text-slate-700">報名人數限制 <span class="text-rose-500">*</span></label>
            <input id="capacity" v-model="form.capacity" inputmode="numeric" class="input" :class="ring('capacity')" />
          </div>
          <div>
            <label for="fee" class="mb-1 block text-sm font-medium text-slate-700">考試費用 (元) <span class="text-rose-500">*</span></label>
            <input id="fee" v-model="form.fee" inputmode="numeric" class="input" :class="ring('fee')" />
          </div>
          <div>
            <label for="startDate" class="mb-1 block text-sm font-medium text-slate-700">考試起始時間 <span class="text-rose-500">*</span></label>
            <input id="startDate" v-model="form.startDate" type="datetime-local" class="input" :class="ring('startDate')" />
          </div>
          <div>
            <label for="endDate" class="mb-1 block text-sm font-medium text-slate-700">考試結束時間 <span class="text-rose-500">*</span></label>
            <input id="endDate" v-model="form.endDate" type="datetime-local" class="input" :class="ring('endDate')" />
          </div>
          <div>
            <label for="applyEndDate" class="mb-1 block text-sm font-medium text-slate-700">報名截止時間 <span class="text-rose-500">*</span></label>
            <input id="applyEndDate" v-model="form.applyEndDate" type="datetime-local" class="input" :class="ring('applyEndDate')" />
          </div>
        </div>

        <div v-if="priceItems.length">
          <p class="mb-1 text-sm font-medium text-slate-700">各項目費用與優惠方案 (元)</p>
          <p class="mb-2 text-xs text-slate-500">
            原價留空表示沿用考試費用。優惠方案由學生報名時自選，承辦人員收費前核對資格。修改後只影響之後的報名，已報名者金額不變。
          </p>
          <div class="space-y-3">
            <div
              v-for="item in priceItems"
              :key="item.id"
              class="rounded-xl border border-slate-200 p-3"
            >
              <div class="flex flex-wrap items-center gap-3">
                <span class="min-w-0 flex-1 font-medium text-slate-700">{{ item.name }}</span>
                <label :for="`price-${item.id}`" class="text-sm text-slate-500">原價</label>
                <input
                  :id="`price-${item.id}`"
                  v-model="form.prices[item.id].base"
                  inputmode="numeric"
                  class="input w-28 py-1.5 text-right"
                  :class="ring(`price-${item.id}`)"
                  :placeholder="form.fee === '' ? '考試費用' : form.fee"
                />
              </div>
              <div
                v-for="(d, i) in form.prices[item.id].discounts"
                :key="i"
                class="mt-2 flex flex-wrap items-center gap-2 pl-4"
              >
                <input
                  :id="`discount-${item.id}-${i}-name`"
                  v-model="d.name"
                  maxlength="50"
                  class="input min-w-0 flex-1 py-1.5 text-sm"
                  :class="ring(`discount-${item.id}-${i}-name`)"
                  placeholder="優惠方案名稱，例如：本校生優惠"
                  aria-label="優惠方案名稱"
                />
                <input
                  :id="`discount-${item.id}-${i}-price`"
                  v-model="d.price"
                  inputmode="numeric"
                  class="input w-28 py-1.5 text-right text-sm"
                  :class="ring(`discount-${item.id}-${i}-price`)"
                  placeholder="費用"
                  aria-label="優惠方案費用"
                />
                <button
                  type="button"
                  class="icon-btn text-rose-500"
                  @click="form.prices[item.id].discounts.splice(i, 1)"
                >移除</button>
              </div>
              <button
                type="button"
                class="mt-2 ml-4 text-sm text-accent-600 hover:underline"
                @click="form.prices[item.id].discounts.push({ name: '', price: '' })"
              >＋ 新增優惠方案</button>
            </div>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend class="mb-2 text-sm font-medium text-slate-700">是否需官網註冊</legend>
            <div class="flex gap-4">
              <label class="flex items-center gap-2"><input v-model="form.requiresRegistration" type="radio" :value="true" class="accent-brand-500" />是</label>
              <label class="flex items-center gap-2"><input v-model="form.requiresRegistration" type="radio" :value="false" class="accent-brand-500" />否</label>
            </div>
          </fieldset>
          <fieldset v-if="!isCreate">
            <legend class="mb-2 text-sm font-medium text-slate-700">是否上架考試</legend>
            <div class="flex gap-4">
              <label class="flex items-center gap-2"><input v-model="form.isPublished" type="radio" :value="true" class="accent-brand-500" />上架</label>
              <label class="flex items-center gap-2"><input v-model="form.isPublished" type="radio" :value="false" class="accent-brand-500" />下架</label>
            </div>
          </fieldset>
        </div>

        <div>
          <label for="memo" class="mb-1 block text-sm font-medium text-slate-700">備註說明 <span class="text-rose-500">*</span></label>
          <textarea id="memo" v-model="form.memo" rows="10" maxlength="3000" class="input" :class="ring('memo')"></textarea>
          <p class="mt-1 text-right text-xs text-slate-400">{{ form.memo.length }} / 3000</p>
        </div>
      </fieldset>

      <p v-if="submitError" class="rounded-xl bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ submitError }}</p>

      <button v-if="!readonly" type="submit" :disabled="submitting" class="btn-primary w-full">
        {{ submitting ? '儲存中…' : isCreate ? '新增報名資訊' : '修改報名資訊' }}
      </button>
    </form>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiGet, apiPost, apiPut } from '@/api';
import { toDateTimeLocal } from '@/format';

const props = defineProps({ id: { type: String, default: null } });
const router = useRouter();
const route = useRoute();

const isCreate = computed(() => !props.id);
const loading = ref(true);
const loadError = ref('');
const exam = ref(null);
const groups = ref([]);
const groupId = ref('');
const submitting = ref(false);
const submitError = ref('');
const errorField = ref('');
const message = ref('');

const emptyForm = () => ({
  name: '',
  itemIds: [],
  capacity: '',
  fee: '',
  // { 項目編號: { base: 原價 (空字串表示沿用考試費用), discounts: [{ name, price }] } }
  prices: {},
  startDate: '',
  endDate: '',
  applyEndDate: '',
  requiresRegistration: false,
  isPublished: true,
  memo: '',
});
const form = reactive(emptyForm());

const readonly = computed(() => Boolean(exam.value && !exam.value.canEdit));
// 已隱藏的分類不提供選擇
const visibleGroups = computed(() => groups.value.filter((g) => !g.hidden));
const currentGroup = computed(() => groups.value.find((g) => g.id === groupId.value));
const allItems = computed(() => groups.value.flatMap((g) => g.items));
const selectedItems = computed(() => allItems.value.filter((i) => form.itemIds.includes(i.id)));
// 可設定費用的項目：新增時為已勾選的項目，修改時為考試既有的項目 (項目本身不可修改)
const priceItems = computed(() => (isCreate.value ? selectedItems.value : exam.value?.items ?? []));
// 新勾選的項目補上空白的價格設定，讓輸入框可直接綁定
watch(
  priceItems,
  (items) => {
    for (const item of items) form.prices[item.id] ??= { base: '', discounts: [] };
  },
  { immediate: true }
);

const ring = (field) => (errorField.value === field ? 'ring-2 ring-rose-300 border-rose-400' : '');

function fillForm(data) {
  Object.assign(form, {
    capacity: String(data.capacity),
    fee: String(data.fee),
    prices: Object.fromEntries(
      data.items.map((i) => [
        i.id,
        {
          base: i.customPrice == null ? '' : String(i.customPrice),
          discounts: i.plans.filter((p) => p.discount).map((p) => ({ name: p.name, price: String(p.price) })),
        },
      ])
    ),
    startDate: toDateTimeLocal(data.startDate),
    endDate: toDateTimeLocal(data.endDate),
    applyEndDate: toDateTimeLocal(data.applyEndDate),
    requiresRegistration: data.requiresRegistration,
    isPublished: data.isPublished,
    memo: data.memo,
  });
}

async function load() {
  loading.value = true;
  loadError.value = '';
  message.value = '';
  submitError.value = '';
  errorField.value = '';
  try {
    if (isCreate.value) {
      exam.value = null;
      Object.assign(form, emptyForm());
      // 已隱藏的證照項目不能用於新增考試
      groups.value = (await apiGet('/admin/license-groups')).map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.hidden),
      }));
    } else {
      exam.value = await apiGet(`/admin/exams/${props.id}`);
      fillForm(exam.value);
      if (route.query.created) message.value = '新增成功!';
    }
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
    if (isCreate.value) {
      // 只送出仍勾選中的項目價格
      const prices = Object.fromEntries(form.itemIds.map((id) => [id, form.prices[id]]));
      const data = await apiPost('/admin/exams', { ...form, prices });
      router.push({ name: 'admin-exam-edit', params: { id: data.exam.id }, query: { created: '1' } });
    } else {
      const data = await apiPut(`/admin/exams/${props.id}`, form);
      exam.value = data.exam;
      fillForm(data.exam);
      message.value = data.message;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    submitError.value = err.message;
    errorField.value = err.field || '';
    if (err.field) document.getElementById(err.field)?.focus();
  } finally {
    submitting.value = false;
  }
}
</script>
