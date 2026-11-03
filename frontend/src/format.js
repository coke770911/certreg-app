// 日期與金額格式化：一律以台北時區顯示
const dateTimeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dayKey = (d) => new Date(d).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

export function formatDateTime(value) {
  return value ? dateTimeFormat.format(new Date(value)) : '';
}

// 考試時間：同一天只顯示一次日期，例如 2026/11/23 09:00 ~ 12:00
export function formatRange(start, end) {
  if (!start || !end) return '';
  if (dayKey(start) === dayKey(end)) {
    return `${formatDateTime(start)} ~ ${timeFormat.format(new Date(end))}`;
  }
  return `${formatDateTime(start)} ~ ${formatDateTime(end)}`;
}

// 民國日期，例如 115/11/09 (繳費單使用)
export function formatRocDate(value) {
  if (!value) return '';
  const [y, m, d] = new Date(value)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
    .split('-');
  return `${Number(y) - 1911}/${m}/${d}`;
}

export function formatMoney(value) {
  return `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
}

// 考試費用：各項目同價時顯示單一金額，不同價時顯示範圍 (例如 NT$ 1,500 ～ NT$ 2,300)
export function formatFeeRange(exam) {
  const min = exam.feeMin ?? exam.fee;
  const max = exam.feeMax ?? exam.fee;
  return min === max ? formatMoney(min) : `${formatMoney(min)} ～ ${formatMoney(max)}`;
}

// 同一場考試的項目是否不同價 (不同價時才在項目旁標示價格)
export const hasItemPrices = (exam) => (exam.feeMin ?? exam.fee) !== (exam.feeMax ?? exam.fee);

// <input type="datetime-local"> 使用的值 (台北時間)，例如 2026-12-01T09:00
export function toDateTimeLocal(value) {
  if (!value) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
