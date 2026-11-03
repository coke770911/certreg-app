<template>
  <section class="mx-auto max-w-xl">
    <RouterLink
      :to="{ name: 'my-applications' }"
      class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
    >← 返回報名紀錄</RouterLink>

    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800 sm:text-3xl">TWQR線上轉帳</h1>
      <p class="mt-1 text-slate-500">使用支援 TWQR 的銀行 APP 或行動支付掃描轉帳</p>
    </div>

    <p v-if="loading" class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">載入中…</p>
    <p v-else-if="error" class="rounded-2xl bg-rose-50 p-8 text-center text-rose-600" role="alert">{{ error }}</p>

    <div v-else class="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div class="text-center">
        <p class="font-bold text-slate-800">{{ pay.examName }}</p>
        <p class="mt-1 text-sm text-accent-600">{{ pay.item }}</p>
        <p class="mt-4 text-sm text-slate-500">繳費金額</p>
        <p class="text-3xl font-bold text-brand-600">{{ formatMoney(pay.amount) }}</p>
      </div>

      <!-- QR Code 由後端產生 (SVG)，內容只含 TWQR 轉帳資料 -->
      <div class="mx-auto my-6 w-64 max-w-full rounded-xl border border-slate-200 bg-white p-2" v-html="pay.qrSvg"></div>

      <dl class="space-y-2 border-t border-slate-100 pt-4 text-sm">
        <div class="flex gap-3">
          <dt class="w-20 shrink-0 text-slate-400">轉入銀行</dt>
          <dd class="text-slate-700">{{ pay.bankCode }} {{ pay.bankName }}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-20 shrink-0 text-slate-400">轉入帳號</dt>
          <dd class="font-mono text-slate-700">{{ pay.account }}</dd>
        </div>
        <div v-if="pay.accountName" class="flex gap-3">
          <dt class="w-20 shrink-0 text-slate-400">戶名</dt>
          <dd class="text-slate-700">{{ pay.accountName }}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-20 shrink-0 text-slate-400">報名者</dt>
          <dd class="text-slate-700">{{ pay.studentNo }} {{ pay.name }}</dd>
        </div>
        <div class="flex gap-3">
          <dt class="w-20 shrink-0 text-slate-400">繳款期限</dt>
          <dd class="text-slate-700">{{ formatDateTime(pay.dueDate) || '—' }}</dd>
        </div>
      </dl>

      <ul class="mt-5 list-disc space-y-1 rounded-xl bg-amber-50 p-4 pl-8 text-sm text-amber-800">
        <li>請確認轉帳金額為 {{ formatMoney(pay.amount) }}；部分 APP 掃描後不會自動帶入金額，請自行輸入。</li>
        <li>使用手機瀏覽時，可截圖後在銀行 APP 的掃碼畫面選擇「從相簿匯入」。</li>
        <li>轉帳完成後請保留交易明細，承辦單位確認入帳後才會更新繳費狀態。</li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { apiGet } from '@/api';
import { formatDateTime, formatMoney } from '@/format';

const props = defineProps({ id: { type: String, required: true } });

const pay = ref(null);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    pay.value = await apiGet(`/applications/${props.id}/twqr`);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});
</script>
