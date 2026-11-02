<template>
  <div class="slip-page">
    <div class="toolbar no-print">
      <RouterLink v-if="admin" :to="backTo" class="toolbar-link">← 回繳費處理</RouterLink>
      <RouterLink v-else :to="{ name: 'my-applications' }" class="toolbar-link">← 回報名紀錄</RouterLink>
      <button v-if="slip" type="button" class="toolbar-btn" @click="print">列印繳費單</button>
    </div>

    <p v-if="loading" class="notice no-print">載入中…</p>
    <p v-else-if="error" class="notice notice-error no-print">{{ error }}</p>

    <div v-else class="slip">
      <!-- 第一聯：銀行存查 -->
      <div class="bank">
        <table class="side-note">
          <tr><td colspan="2" class="no-border bottom-border">備註</td></tr>
          <tr class="side-note-body">
            <td class="vertical no-border">二、存入票據須俟收妥後始可抵用</td>
            <td class="vertical no-border">一、票據、現金應分別另張填寫</td>
          </tr>
        </table>

        <table class="grid">
          <tr>
            <td colspan="17" class="no-border bottom-border header-cell">
              <img src="/images/feib.png" alt="" height="50" />
              <div class="small right">年　　　月　　　日</div>
            </td>
          </tr>
          <tr>
            <td rowspan="2" class="vertical-label">帳<br />號</td>
            <td colspan="3">單位別</td>
            <td colspan="3">科目</td>
            <td colspan="7">編號</td>
            <td>檢</td>
            <td rowspan="2" class="vertical-label">戶<br />名</td>
            <td rowspan="2" class="left payee-name">{{ slip.payee.accountName }}</td>
            <td rowspan="2" class="copy-label">第一聯</td>
          </tr>
          <tr>
            <td v-for="(d, i) in accountDigits" :key="i" class="digit" :class="digitBorder(i)">{{ d }}</td>
          </tr>
        </table>

        <table class="grid">
          <tr>
            <td colspan="4">身分證字號/統一編號<br /><span class="small">(信用卡用)</span></td>
            <td colspan="8"></td>
            <td rowspan="5" class="top stamp">
              (收訖戳記)
              <div class="due">繳款期限：{{ formatRocDate(slip.dueDate) }}</div>
            </td>
            <td rowspan="5" class="copy-label top">：銀行存查</td>
          </tr>
          <tr>
            <td rowspan="2" class="nt">新臺幣<br />NT$</td>
            <td v-for="u in AMOUNT_UNITS" :key="u.key" class="money">{{ u.label }}</td>
          </tr>
          <tr class="amount-row">
            <td v-for="(d, i) in slip.amountDigits" :key="i" class="money amount" :class="i % 3 === 1 ? 'dash-left dash-right' : i % 3 === 0 ? 'dash-right' : 'dash-left'">
              {{ d }}
            </td>
          </tr>
          <tr>
            <td colspan="4">存款方式</td>
            <td colspan="8" class="left">□現金 □轉帳 □票據______張</td>
          </tr>
          <tr>
            <td colspan="12" class="left">繳款人學號：<u>{{ slip.studentNo }}</u></td>
          </tr>
        </table>

        <table class="grid">
          <tr class="machine-head">
            <td rowspan="2" class="vertical-label">機<br />器<br />印<br />錄</td>
            <td>分別行</td>
            <td>櫃台機</td>
            <td>序時編號</td>
            <td>交易序號</td>
            <td>櫃員</td>
            <td>主管</td>
            <td>日期</td>
            <td>時間</td>
            <td>帳號</td>
            <td rowspan="2" class="copy-label"></td>
          </tr>
          <tr class="machine-body"><td colspan="9"></td></tr>
          <tr>
            <td colspan="4" class="left small no-border top-border">P20 / P30 / K20 / T20 / J19 二聯式</td>
            <td colspan="6" class="left no-border top-border">主管　　　　　　　　經辦</td>
          </tr>
        </table>
      </div>

      <table class="receipt">
        <tr>
          <td colspan="4" class="left no-border bottom-border">第一聯　{{ slip.payee.branchName }}收款留存</td>
        </tr>
        <tr>
          <td rowspan="2" class="label">繳款人</td>
          <td class="left half">姓名：<u>{{ slip.name }}</u></td>
          <td class="left half">學號：<u>{{ slip.studentNo }}</u></td>
        </tr>
        <tr>
          <td class="left">行動電話：<u>{{ slip.phone }}</u></td>
          <td class="left">E-Mail：<u>{{ slip.email }}</u></td>
        </tr>
      </table>

      <hr class="cut" />

      <!-- 第二聯：繳款人收據 -->
      <table class="receipt">
        <tr>
          <td colspan="4" class="left no-border bottom-border">{{ slip.payee.accountName }}　　繳款收據</td>
        </tr>
        <tr>
          <td class="label">繳款人</td>
          <td class="left half">姓名：<u>{{ slip.name }}</u></td>
          <td class="left half">學號：<u>{{ slip.studentNo }}</u></td>
          <td rowspan="3" class="top stamp-small">經收單位<br />收訖戳記</td>
        </tr>
        <tr>
          <td class="label">金額</td>
          <td class="left">新台幣 <u>{{ slip.amountChinese }} 元</u>整</td>
          <td class="left">NT$：<u>{{ amountText }}</u></td>
        </tr>
        <tr>
          <td class="label">收費<br />項目</td>
          <td colspan="2" class="left">代收「{{ slip.examName }}-{{ slip.item }}」證照認證考試報名費</td>
        </tr>
        <tr>
          <td colspan="4" class="left no-border top-border">第二聯　請交繳款人自行留存</td>
        </tr>
      </table>

      <p class="warning">本收款收據需經{{ slip.payee.bankName }}加蓋收款戳記後始生效</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { apiGet } from '@/api';
import { formatRocDate } from '@/format';

// admin：管理端代印 (任何考生、任何繳費狀態)
const props = defineProps({ id: { type: String, required: true }, admin: { type: Boolean, default: false } });

const AMOUNT_UNITS = ['佰', '拾', '億', '仟', '佰', '拾', '萬', '仟', '佰', '拾', '元'].map((label, key) => ({ key, label }));

const slip = ref(null);
const loading = ref(true);
const error = ref('');

// 帳號 14 格，依單位別 / 科目 / 編號分組加上虛線
const accountDigits = computed(() => slip.value.payee.accountParts.join('').split(''));
const GROUP_ENDS = new Set([2, 5, 12]);
const digitBorder = (i) => [i > 0 && !GROUP_ENDS.has(i - 1) && 'dash-left', !GROUP_ENDS.has(i) && i < 13 && 'dash-right'];

const amountText = computed(() =>
  Number(slip.value.amount).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
);

watch(
  () => props.id,
  async (id) => {
    loading.value = true;
    error.value = '';
    try {
      slip.value = await apiGet(props.admin ? `/admin/applications/${id}/slip` : `/applications/${id}/slip`);
      document.title = `繳費單 - ${slip.value.examName}`;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);

const backTo = computed(() =>
  slip.value?.examId ? { name: 'admin-payments', params: { id: slip.value.examId } } : { name: 'admin-exams' }
);

const print = () => window.print();
</script>

<style scoped>
.slip-page {
  min-height: 100vh;
  background: #f1f5f9;
  padding: 16px;
  color: #000;
}
.toolbar {
  max-width: 760px;
  margin: 0 auto 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.toolbar-link {
  color: #64748b;
  font-size: 14px;
}
.toolbar-btn {
  background: #f97316;
  color: #fff;
  border-radius: 9999px;
  padding: 8px 20px;
  font-weight: 700;
}
.notice {
  max-width: 760px;
  margin: 0 auto;
  background: #fff;
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  color: #64748b;
}
.notice-error {
  background: #fff1f2;
  color: #e11d48;
}

/* 繳費單本體：固定寬度，與舊系統一致；窄螢幕可左右捲動 */
.slip {
  width: 720px;
  margin: 0 auto;
  background: #fff;
  padding: 20px;
  font-family: 'DFKai-SB', 'BiauKai', '標楷體', 'Kaiti TC', serif;
  font-size: 16px;
  overflow-x: auto;
}
@media (max-width: 760px) {
  .slip-page {
    overflow-x: auto;
  }
}
.bank {
  width: 680px;
}
table {
  border-collapse: collapse;
  text-align: center;
}
td {
  border: 1px solid #000;
  padding: 2px;
}
.grid {
  width: 650px;
}
.side-note {
  float: right;
  width: 20px;
}
.side-note-body {
  height: 200px;
}
.vertical {
  writing-mode: vertical-rl;
  vertical-align: top;
  width: 10px;
  font-size: 14px;
}
.vertical-label {
  width: 24px;
}
.no-border {
  border: 1px solid transparent;
}
.bottom-border {
  border-bottom: 1px solid #000;
}
.top-border {
  border-top: 1px solid #000;
}
.header-cell {
  text-align: left;
}
/* Tailwind 基礎樣式會將 img 設為 height:auto，需明確指定 */
.header-cell img {
  height: 50px;
  width: auto;
  display: inline-block;
}
.small {
  font-size: 12px;
}
.right {
  text-align: right;
}
.left {
  text-align: left;
}
.top {
  vertical-align: top;
}
.payee-name {
  font-size: 18px;
  font-weight: 700;
}
.copy-label {
  width: 20px;
  border: 1px solid transparent;
  border-left: 1px solid #000;
  writing-mode: vertical-rl;
}
.digit {
  width: 20px;
}
.money {
  width: 30px;
}
.amount-row {
  height: 40px;
}
.amount {
  font-size: 18px;
}
.nt {
  width: 70px;
}
.dash-left {
  border-left: 1px dashed #000;
}
.dash-right {
  border-right: 1px dashed #000;
}
.stamp {
  width: 150px;
}
.due {
  margin-top: 90px;
  font-size: 14px;
}
.machine-head {
  height: 30px;
}
.machine-body {
  height: 100px;
}
.receipt {
  width: 710px;
  margin-top: 16px;
  line-height: 30px;
}
.receipt .label {
  width: 70px;
}
.receipt .half {
  width: 233px;
}
.stamp-small {
  width: 100px;
}
.cut {
  border: 0;
  border-top: 1px dashed #000;
  margin: 16px 0;
}
.warning {
  text-align: right;
  color: #f00;
  margin-top: 24px;
}

@media print {
  .no-print {
    display: none !important;
  }
  .slip-page {
    background: #fff;
    padding: 0;
  }
  .slip {
    padding: 0;
    margin: 0;
  }
  @page {
    size: A4 portrait;
    margin: 10mm;
  }
}
</style>
