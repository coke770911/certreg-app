'use strict';

/**
 * v_UserData → UserData 差異更新規則測試 (純邏輯，不連線資料庫)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapSourceRow, diffUser } = require('../src/services/user-sync');

const source = {
  us_no: 'd11000001',
  us_name: '王小明',
  us_logid: 'STD',
  us_title: '學生',
  us_ename: 'wang,siao-ming',
  us_id: 'A000000002',
  us_sex: 'M',
  us_yy: '090', // char(3) 民國年
  us_mm: '05',
  us_dd: '01',
  us_dept: '資管系',
  us_grade: '2',
  us_class: 'A',
};

test('來源資料轉換：去除 char 補白、英文姓名轉大寫、年級轉數字、空白視為無值', () => {
  const values = mapSourceRow({ ...source, us_class: 'A ', us_dept: '   ', us_mm: null });
  assert.equal(values.us_ename, 'WANG,SIAO-MING');
  assert.equal(values.us_grade, 2);
  assert.equal(values.us_class, 'A');
  assert.equal(values.us_dept, null);
  assert.equal(values.us_mm, null);
  assert.equal('us_no' in values, false);
  assert.equal('us_phone' in values, false);
});

test('來源資料轉換：超過 UserData 欄位長度時截斷', () => {
  const values = mapSourceRow({ ...source, us_ename: 'A'.repeat(80), us_logid: 'VERYLONGLOGINID' });
  assert.equal(values.us_ename.length, 50);
  assert.equal(values.us_logid, 'VERYLONGLO');
});

test('差異比對：只回傳不同的欄位，來源為 NULL 時不覆蓋既有資料', () => {
  const current = {
    ...mapSourceRow(source),
    us_class: 'A', // nchar(1)
    us_phone: '0910123456',
  };
  assert.deepEqual(diffUser(current, mapSourceRow(source)), {});

  const changed = diffUser(current, mapSourceRow({ ...source, us_title: '研究生', us_grade: '3', us_dept: null }));
  assert.deepEqual(changed, { us_title: '研究生', us_grade: 3 });
});

test('差異比對：既有資料有補白或為 NULL 時正確判斷', () => {
  const current = { us_name: '王小明 ', us_grade: null, us_sex: null };
  assert.deepEqual(diffUser(current, { us_name: '王小明', us_grade: 2, us_sex: 'M' }), { us_grade: 2, us_sex: 'M' });
});
