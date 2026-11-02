'use strict';

/**
 * 管理端輸入檢查與權限測試 (純邏輯，不連線資料庫)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExamInput, sortOtherLast } = require('../src/services/admin-exam-service');
const { requirePermission } = require('../src/middleware/auth');

const valid = {
  name: '  MOS 認證考試  ',
  itemIds: [3, '3', 5],
  capacity: '40',
  fee: '1,500',
  startDate: '2026-12-01T09:00',
  endDate: '2026-12-01 12:00',
  applyEndDate: '2026-11-20T17:00',
  memo: '請攜帶學生證',
  requiresRegistration: '1',
};

const fieldOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err.field;
  }
  return null;
};

test('新增考試：整理輸入值 (去空白、千分位、項目去重)', () => {
  const data = validateExamInput(valid, { isCreate: true });
  assert.equal(data.name, 'MOS 認證考試');
  assert.deepEqual(data.itemIds, [3, 5]);
  assert.equal(data.capacity, 40);
  assert.equal(data.fee, 1500);
  assert.equal(data.requiresRegistration, true);
  assert.equal(data.isPublished, true);
  // 以台北時間解讀
  assert.equal(data.startDate.getHours(), 9);
  assert.equal(data.endDate.getHours(), 12);
});

test('新增考試：必填欄位與格式錯誤會指出欄位', () => {
  const v = (patch) => fieldOf(() => validateExamInput({ ...valid, ...patch }, { isCreate: true }));
  assert.equal(v({ name: ' ' }), 'name');
  assert.equal(v({ itemIds: [] }), 'itemIds');
  assert.equal(v({ itemIds: ['x'] }), 'itemIds');
  assert.equal(v({ capacity: '' }), 'capacity');
  assert.equal(v({ capacity: '0' }), 'capacity');
  assert.equal(v({ capacity: '1.5' }), 'capacity');
  assert.equal(v({ fee: '-1' }), 'fee');
  assert.equal(v({ startDate: '2026-02-30T09:00' }), 'startDate');
  assert.equal(v({ applyEndDate: 'tomorrow' }), 'applyEndDate');
  assert.equal(v({ endDate: '2026-12-01T08:00' }), 'endDate');
  assert.equal(v({ memo: '' }), 'memo');
});

test('修改考試：不需名稱與項目，上下架依輸入', () => {
  const data = validateExamInput({ ...valid, name: '', itemIds: undefined, isPublished: false }, { isCreate: false });
  assert.equal(data.name, undefined);
  assert.equal(data.isPublished, false);
});

test('管理端權限：未登入 401、代理登入 403', async () => {
  const run = (auth) =>
    new Promise((resolve) => {
      requirePermission('manage')({ auth }, {}, (err) => resolve(err?.status ?? 'next'));
    });
  assert.equal(await run(undefined), 401);
  assert.equal(await run({ studentNo: 'd11000001', impersonatedBy: 'admin1' }), 403);
});

test('證照分類：「其他」排在最後，其餘維持原順序', () => {
  const groups = [{ lg_name: 'PMA' }, { lg_name: ' 其他 ' }, { lg_name: 'ITS' }, { lg_name: 'MCF' }];
  assert.deepEqual(sortOtherLast(groups).map((g) => g.lg_name.trim()), ['PMA', 'ITS', 'MCF', '其他']);
});
