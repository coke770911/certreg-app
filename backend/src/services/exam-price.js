'use strict';

/**
 * 考試項目價格 (RegPrice 資料表)：各考試項目的原價與優惠方案
 *
 *   - 某考試某項目沒有資料時，原價為考試費用 rg_money、沒有優惠方案
 *     (由正式資料庫複製過來的舊考試皆為此情形)
 *   - 原價與考試費用相同時不存資料列，之後調整考試費用會一併套用
 *   - 學生報名時自選方案，Apply.ap_discount 存方案名稱 (原價為 NULL)，承辦人員核對資格
 */

const { Op } = require('sequelize');
const { RegPrice } = require('../models');
const { AppError } = require('../errors');

const BASE_NAME = '原價';
const MAX_PRICE = 999999;

const key = (rgId, leId) => `${rgId}:${leId}`;
const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const fail = (message, field) => {
  throw new AppError(400, message, field);
};

/** 讀取多場考試的價格設定，回傳 Map(「考試:項目」→ { base, discounts }) */
async function loadPrices(rgIds, transaction) {
  const map = new Map();
  if (!rgIds.length) return map;
  const rows = await RegPrice.findAll({
    where: { rp_rg_id: { [Op.in]: rgIds } },
    order: [['rp_order', 'ASC'], ['rp_id', 'ASC']],
    transaction,
  });
  for (const row of rows) {
    const k = key(row.rp_rg_id, row.rp_le_id);
    if (!map.has(k)) map.set(k, { base: null, discounts: [] });
    const entry = map.get(k);
    if (row.rp_is_base) entry.base = row.rp_money;
    else entry.discounts.push({ name: row.rp_name, price: row.rp_money });
  }
  return map;
}

/** 某考試某項目的價格：price 為原價，plans 為可選方案 (第一個固定為原價) */
function priceOf(prices, rg, leId) {
  const entry = prices.get(key(rg.rg_id, leId));
  const price = entry?.base ?? rg.rg_money;
  return {
    price,
    customPrice: entry?.base ?? null,
    plans: [{ name: BASE_NAME, price, discount: false }, ...(entry?.discounts ?? []).map((d) => ({ ...d, discount: true }))],
  };
}

/** 考試費用範圍 (依各項目原價) 與是否有優惠方案 */
function feeSummary(items, fallback) {
  if (!items.length) return { feeMin: fallback, feeMax: fallback, hasDiscount: false };
  const prices = items.map((i) => i.price);
  return {
    feeMin: Math.min(...prices),
    feeMax: Math.max(...prices),
    hasDiscount: items.some((i) => i.plans.length > 1),
  };
}

function parsePrice(value, field) {
  const s = text(value).replace(/,/g, '');
  if (!/^\d+$/.test(s)) fail('費用必須為整數', field);
  const n = Number(s);
  if (n > MAX_PRICE) fail(`費用必須介於 0 ~ ${MAX_PRICE.toLocaleString('en-US')}`, field);
  return n;
}

/**
 * 檢查管理端送出的價格設定，回傳要寫入的資料列。
 * input：{ 項目編號: { base: '2300' 或空白 (沿用考試費用), discounts: [{ name, price }] } }
 */
function parsePrices(input, itemIds, fee) {
  if (input == null) return [];
  if (typeof input !== 'object' || Array.isArray(input)) fail('價格設定格式錯誤', 'prices');
  const rows = [];
  for (const [k, setting] of Object.entries(input)) {
    const leId = Number(k);
    if (!itemIds.includes(leId)) fail('價格設定對應的考試項目不存在', 'prices');
    const base = text(setting?.base);
    if (base !== '') {
      const money = parsePrice(base, `price-${leId}`);
      if (money !== fee) rows.push({ rp_le_id: leId, rp_name: BASE_NAME, rp_money: money, rp_is_base: true, rp_order: 0 });
    }
    const discounts = Array.isArray(setting?.discounts) ? setting.discounts : [];
    const names = new Set();
    discounts.forEach((d, i) => {
      const field = `discount-${leId}-${i}`;
      const name = text(d?.name);
      if (!name) fail('請輸入優惠方案名稱', `${field}-name`);
      if (name.length > 50) fail('優惠方案名稱不可超過 50 字', `${field}-name`);
      if (name === BASE_NAME) fail(`優惠方案名稱不可為「${BASE_NAME}」`, `${field}-name`);
      if (names.has(name)) fail('同一項目的優惠方案名稱不可重複', `${field}-name`);
      names.add(name);
      if (text(d?.price) === '') fail('請輸入優惠方案費用', `${field}-price`);
      const money = parsePrice(d.price, `${field}-price`);
      rows.push({ rp_le_id: leId, rp_name: name, rp_money: money, rp_is_base: false, rp_order: i + 1 });
    });
  }
  return rows;
}

/** 以新的設定取代某場考試的所有價格資料 (只影響之後的報名，已報名者金額為快照) */
async function replacePrices(rgId, rows, transaction) {
  await RegPrice.destroy({ where: { rp_rg_id: rgId }, transaction });
  if (rows.length) await RegPrice.bulkCreate(rows.map((r) => ({ ...r, rp_rg_id: rgId })), { transaction });
}

/**
 * 報名時依所選項目與方案計算應繳金額；discount 為方案名稱，空白表示原價。
 * 方案不存在 (例如管理端剛移除) 時拒絕。
 */
async function resolveFee(rg, leId, discount, transaction) {
  const prices = await loadPrices([rg.rg_id], transaction);
  const { plans } = priceOf(prices, rg, leId);
  const name = text(discount) || BASE_NAME;
  const plan = plans.find((p) => p.name === name);
  if (!plan) throw new AppError(400, '所選的收費方案不存在，請重新選擇', 'discount');
  return { fee: plan.price, discount: plan.discount ? plan.name : null };
}

module.exports = { BASE_NAME, loadPrices, priceOf, feeSummary, parsePrices, replacePrices, resolveFee };
