'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { priceOf, feeSummary, parsePrices } = require('../src/services/exam-price');

const rg = { rg_id: 7, rg_money: 2300 };

test('價格：沒有設定時原價為考試費用、沒有優惠方案', () => {
  assert.deepEqual(priceOf(new Map(), rg, 1), {
    price: 2300,
    customPrice: null,
    plans: [{ name: '原價', price: 2300, discount: false }],
  });
});

test('價格：另設原價與優惠方案', () => {
  const prices = new Map([['7:1', { base: 2000, discounts: [{ name: '本校生優惠', price: 1500 }] }]]);
  const p = priceOf(prices, rg, 1);
  assert.equal(p.price, 2000);
  assert.deepEqual(p.plans.map((x) => [x.name, x.price, x.discount]), [
    ['原價', 2000, false],
    ['本校生優惠', 1500, true],
  ]);
  assert.deepEqual(feeSummary([p, priceOf(prices, rg, 2)], 2300), { feeMin: 2000, feeMax: 2300, hasDiscount: true });
});

test('價格設定：原價與考試費用相同時不存，優惠方案依序存入', () => {
  const rows = parsePrices(
    { 1: { base: '2,300', discounts: [{ name: ' 本校生優惠 ', price: '1500' }, { name: '校友', price: 2000 }] }, 2: { base: '1800' } },
    [1, 2],
    2300
  );
  assert.deepEqual(
    rows.map((r) => [r.rp_le_id, r.rp_name, r.rp_money, r.rp_is_base, r.rp_order]),
    [
      [1, '本校生優惠', 1500, false, 1],
      [1, '校友', 2000, false, 2],
      [2, '原價', 1800, true, 0],
    ]
  );
});

test('價格設定：格式錯誤時回報對應欄位', () => {
  const cases = [
    [{ 9: { base: '100' } }, 'prices'],
    [{ 1: { base: 'abc' } }, 'price-1'],
    [{ 1: { discounts: [{ name: '', price: '1' }] } }, 'discount-1-0-name'],
    [{ 1: { discounts: [{ name: '原價', price: '1' }] } }, 'discount-1-0-name'],
    [{ 1: { discounts: [{ name: 'A', price: '1' }, { name: 'A', price: '2' }] } }, 'discount-1-1-name'],
    [{ 1: { discounts: [{ name: 'A', price: '' }] } }, 'discount-1-0-price'],
    [{ 1: { discounts: [{ name: 'A', price: '1000000' }] } }, 'discount-1-0-price'],
  ];
  for (const [input, field] of cases) {
    assert.throws(() => parsePrices(input, [1], 2300), (err) => err.status === 400 && err.field === field, field);
  }
});
