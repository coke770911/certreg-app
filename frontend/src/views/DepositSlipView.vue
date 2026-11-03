<template>
  <div class="slip-page">
    <div class="toolbar no-print">
      <RouterLink v-if="admin" :to="backTo" class="toolbar-link">← 回繳費處理</RouterLink>
      <RouterLink v-else :to="{ name: 'my-applications' }" class="toolbar-link">← 回報名紀錄</RouterLink>
      <button v-if="slip" type="button" class="toolbar-btn" @click="print">列印繳費單</button>
    </div>

    <p v-if="loading" class="notice no-print">載入中…</p>
    <p v-else-if="error" class="notice notice-error no-print">{{ error }}</p>

    <!-- 版面依舊系統 V_depositSlip.php 重現；class 一律加 slip- 前綴，避免與 Tailwind 工具類別 (如 grid、table) 衝突 -->
    <div v-else class="slip">
      <div class="slip-bank">
        <table class="slip-table slip-side-note">
          <tbody>
            <tr><td colspan="2" class="slip-no-border slip-bottom-border">備註</td></tr>
            <tr class="slip-side-note-body">
              <td class="slip-stack slip-no-border">
                <span v-for="(c, i) in SIDE_NOTE_2" :key="i">{{ c }}</span>
              </td>
              <td class="slip-stack slip-no-border">
                <span v-for="(c, i) in SIDE_NOTE_1" :key="i">{{ c }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <table class="slip-table slip-bank-table">
          <tbody>
            <tr>
              <td colspan="17" class="slip-no-border slip-bottom-border">
                <img src="/images/feib.png" alt="" class="slip-logo" />
                <div class="slip-small slip-right">年　　　月　　　日</div>
              </td>
            </tr>
            <tr>
              <td rowspan="2">帳<br />號</td>
              <td colspan="3">單位別</td>
              <td colspan="3">科目</td>
              <td colspan="7">編號</td>
              <td>檢</td>
              <td rowspan="2">戶<br />名</td>
              <td rowspan="2" class="slip-left slip-payee">{{ slip.payee.accountName }}</td>
              <td rowspan="2" class="slip-copy-label">第一聯</td>
            </tr>
            <tr>
              <td v-for="(d, i) in accountDigits" :key="i" class="slip-account" :class="ACCOUNT_DASH[i]">{{ d }}</td>
            </tr>
          </tbody>
        </table>

        <table class="slip-table slip-bank-table">
          <tbody>
            <tr>
              <td colspan="4">身分證字號/統一編號<br /><span class="slip-small">(信用卡用)</span></td>
              <td colspan="8"></td>
              <td rowspan="5" class="slip-top">
                (收訖戳記)<br /><br /><br /><br /><br /><br />
                <span class="slip-due">繳款期限：{{ formatRocDate(slip.dueDate) }}</span>
              </td>
              <td rowspan="5" class="slip-top slip-copy-label">：銀行存查</td>
            </tr>
            <tr>
              <td rowspan="2" class="slip-nt">新臺幣<br />NT$</td>
              <td v-for="u in AMOUNT_UNITS" :key="u.key" class="slip-money">{{ u.label }}</td>
            </tr>
            <tr class="slip-amount-row">
              <td v-for="(d, i) in slip.amountDigits" :key="i" :class="AMOUNT_DASH[i]">{{ d }}</td>
            </tr>
            <tr>
              <td colspan="4">存款方式</td>
              <td colspan="8" class="slip-left">□現金 □轉帳 □票據______張</td>
            </tr>
            <tr>
              <td colspan="12" class="slip-left">繳款人學號：<u>{{ slip.studentNo }}</u></td>
            </tr>
          </tbody>
        </table>

        <table class="slip-table slip-bank-table">
          <tbody>
            <tr class="slip-machine-head">
              <td rowspan="2">機<br />器<br />印<br />錄</td>
              <td>分別行</td>
              <td>櫃台機</td>
              <td>序時編號</td>
              <td>交易序號</td>
              <td>櫃員</td>
              <td>主管</td>
              <td>日期</td>
              <td>時間</td>
              <td>帳號</td>
              <td rowspan="2" class="slip-copy-label"></td>
            </tr>
            <tr class="slip-machine-body"><td colspan="9"></td></tr>
            <tr>
              <td colspan="4" class="slip-left slip-small slip-no-border slip-top-border">
                P20 / P30 / K20 / T20 / J19 二聯式<br />103.10(宏宇)
              </td>
              <td colspan="6" class="slip-left slip-no-border slip-top-border">主管　　　　　　　　經辦</td>
            </tr>
          </tbody>
        </table>
      </div>
      <br />

      <!-- 第一聯：銀行收款留存 -->
      <table class="slip-table slip-receipt">
        <tbody>
          <tr>
            <td colspan="4" class="slip-left slip-no-border slip-bottom-border">第一聯　{{ slip.payee.branchName }}收款留存</td>
          </tr>
          <tr>
            <td rowspan="2" class="slip-label">繳款人</td>
            <td class="slip-left slip-half slip-hide-right slip-hide-bottom">姓名：<u>{{ slip.name }}</u></td>
            <td class="slip-left slip-half slip-hide-bottom">學號：<u>{{ slip.studentNo }}</u></td>
          </tr>
          <tr>
            <td class="slip-left slip-hide-right">行動電話：<u>{{ slip.phone }}</u></td>
            <td class="slip-left">E-Mail：<u>{{ slip.email }}</u></td>
          </tr>
        </tbody>
      </table>

      <hr class="slip-cut" />

      <!-- 第二聯：繳款人收據 -->
      <table class="slip-table slip-receipt">
        <tbody>
          <tr>
            <td colspan="4" class="slip-left slip-no-border slip-bottom-border">{{ slip.payee.accountName }}　　繳款收據</td>
          </tr>
          <tr>
            <td class="slip-label">繳款人</td>
            <td class="slip-left slip-half slip-hide-right">姓名：<u>{{ slip.name }}</u></td>
            <td class="slip-left slip-half">學號：<u>{{ slip.studentNo }}</u></td>
            <td rowspan="3" class="slip-top slip-stamp">經收單位<br />收訖戳記</td>
          </tr>
          <tr>
            <td>金額</td>
            <td class="slip-left slip-half">新台幣 <u>{{ slip.amountChinese }} 元</u>整</td>
            <td class="slip-left slip-half">NT$：<u>{{ amountText }}</u></td>
          </tr>
          <tr>
            <td>收費<br />項目</td>
            <td colspan="2" class="slip-left">代收「{{ slip.examName }}-{{ slip.item }}」證照認證考試報名費</td>
          </tr>
          <tr>
            <td colspan="4" class="slip-left slip-no-border slip-top-border">第二聯　請交繳款人自行留存</td>
          </tr>
        </tbody>
      </table>
      <br /><br />
      <div class="slip-warning">本收款收據需經{{ slip.payee.bankName }}加蓋收款戳記後始生效</div>
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
// 右側直書備註：逐字換行 (與舊系統相同，不用 writing-mode，標點位置才一致)
const SIDE_NOTE_1 = [...'一、票據、現金應分別另張填寫'];
const SIDE_NOTE_2 = [...'二、存入票據須俟收妥後始可抵用'];

// 帳號 14 格與金額 11 格的虛線位置，與舊系統相同 (同一組內以虛線分隔，組與組之間為實線)
const L = 'slip-dash-left';
const R = 'slip-dash-right';
const ACCOUNT_DASH = [[R], [R, L], [R, L], [R], [R, L], [R, L], [R], [R, L], [R, L], [R, L], [R, L], [R, L], [L], []];
const AMOUNT_DASH = [[R], [L], [R], [L, R], [L], [R], [L, R], [L], [R], [L, R], [L]];

const slip = ref(null);
const loading = ref(true);
const error = ref('');

const accountDigits = computed(() => slip.value.payee.accountParts.join('').split(''));

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
/* 繳費單固定寬度 (與舊系統相同)，窄螢幕改為左右捲動 */
@media (max-width: 800px) {
  .slip-page {
    overflow-x: auto;
  }
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

/*
 * 繳費單本體：尺寸、字型與框線沿用舊系統 V_depositSlip.php。
 * 網站全域的 Tailwind 基礎樣式 (box-sizing、行高、img) 會改變表格尺寸，這裡還原為瀏覽器預設。
 */
.slip {
  box-sizing: content-box;
  width: 720px;
  margin: 0 auto;
  padding: 20px;
  background: #fff;
  font-family: 'DFKai-SB', 'BiauKai', '標楷體', 'Kaiti TC', serif;
  font-size: 16px;
  line-height: normal;
}
.slip :deep(*) {
  box-sizing: content-box;
}
.slip-bank {
  width: 720px;
}
.slip-table {
  /* 不設表格外框：舊系統的 table 外框會在右側與備註周圍留下括號狀的線，列印時不應出現 */
  border-collapse: collapse;
  text-align: center;
  font-size: 16px;
  font-family: inherit;
}
.slip-table td {
  border: 1px solid #000;
  padding: 1px;
}
.slip-bank-table {
  width: 680px;
}
.slip-receipt {
  width: 710px;
  line-height: 30px;
}

/* 右側直書備註 */
.slip-side-note {
  float: right;
  width: 10px;
}
.slip-side-note-body {
  height: 200px;
}
.slip-stack {
  width: 10px;
  vertical-align: text-top;
}
.slip-stack span {
  display: block;
}

.slip-logo {
  display: inline;
  height: 50px;
  width: auto;
  max-width: none;
  vertical-align: baseline;
}
.slip-small {
  font-size: 12px;
}
.slip-right {
  text-align: right;
}
.slip-left {
  text-align: left;
}
.slip-top {
  vertical-align: text-top;
}
.slip-payee {
  font-size: 20px;
  font-weight: 700;
}
.slip-copy-label {
  width: 20px;
}
.slip-account {
  width: 20px;
}
.slip-money {
  width: 30px;
}
.slip-nt {
  width: 70px;
}
.slip-amount-row {
  height: 40px;
}
.slip-due {
  font-size: 14px;
}
.slip-machine-head {
  height: 30px;
}
.slip-machine-body {
  height: 100px;
}
.slip-label {
  width: 70px;
}
.slip-half {
  width: 233px;
}
.slip-stamp {
  width: 100px;
}

/* 框線：無框、只留上／下框、白色隱藏框，對應舊系統的 border: 1px solid #FFF 寫法 */
.slip-table td.slip-copy-label {
  border-color: #fff;
  border-left-color: #000;
}
.slip-table td.slip-no-border {
  border-color: #fff;
}
.slip-table td.slip-bottom-border {
  border-bottom-color: #000;
}
.slip-table td.slip-top-border {
  border-top-color: #000;
}
.slip-table td.slip-hide-right {
  border-right-color: #fff;
}
.slip-table td.slip-hide-bottom {
  border-bottom-color: #fff;
}
.slip-table td.slip-dash-left {
  border-left: 1px dashed #000;
}
.slip-table td.slip-dash-right {
  border-right: 1px dashed #000;
}

.slip-cut {
  border: 0;
  border-top: 1px dashed #000;
  margin: 8px 0;
}
.slip-warning {
  text-align: right;
  color: #f00;
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
  /* A4 寬 210mm，左右各留 8mm，可容納 720px (約 190.5mm) 的繳費單不需縮放 */
  @page {
    size: A4 portrait;
    margin: 8mm;
  }
}
</style>
