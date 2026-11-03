'use strict';

/**
 * 管理端：考試場次與證照項目維護
 * (對應舊系統 Manage/index、addTheme、detailed、ThemeProcess、addItem、addItemProcess、selItem)
 *
 * 與舊系統的差異：
 *   - 欄位格式 (人數、費用、日期) 在伺服器端完整檢查 (舊系統只檢查是否空白)
 *   - 考試結束後不可再修改 (舊系統只在畫面上隱藏按鈕)
 *   - 新增考試時，考試項目必須是存在且未停用的證照項目
 */

const { Op, literal } = require('sequelize');
const { sequelize, Registration, License, LicenseGroup, LinkRgLe } = require('../models');
const { AppError } = require('../errors');

const appliedCount = [
  literal('(SELECT COUNT(*) FROM [dbo].[Apply] WHERE [Apply].[ap_rg_id] = [Registration].[rg_id] AND [Apply].[ap_is_del] = 0)'),
  'appliedCount',
];

const itemsInclude = {
  model: License,
  as: 'items',
  attributes: ['le_id', 'le_name'],
  through: { attributes: [] },
};

function toAdminExamDto(rg, now = new Date()) {
  return {
    id: rg.rg_id,
    name: rg.rg_name,
    startDate: rg.rg_startDate,
    endDate: rg.rg_endDate,
    applyEndDate: rg.rg_applyEndDate,
    fee: rg.rg_money,
    capacity: rg.rg_number,
    appliedCount: Number(rg.get('appliedCount') ?? 0),
    requiresRegistration: Boolean(rg.rg_is_regi),
    isPublished: !rg.rg_is_del,
    memo: rg.rg_memo,
    creator: rg.rg_creator,
    isOpen: !rg.rg_is_del && rg.rg_applyEndDate > now,
    canEdit: rg.rg_endDate >= now,
    items: (rg.items || []).map((le) => ({ id: le.le_id, name: text(le.le_name) })).sort((a, b) => a.id - b.id),
  };
}

/** 所有考試 (含下架)，新建立的在前 (與舊系統 getList 相同) */
async function listAllExams() {
  const rows = await Registration.findAll({
    attributes: { include: [appliedCount] },
    include: [itemsInclude],
    order: [['rg_id', 'DESC']],
  });
  const now = new Date();
  return rows.map((rg) => toAdminExamDto(rg, now));
}

async function getAdminExam(id) {
  const rg = await Registration.findByPk(id, { attributes: { include: [appliedCount] }, include: [itemsInclude] });
  if (!rg) throw new AppError(404, '找不到此考試');
  return toAdminExamDto(rg);
}

// ---------- 輸入檢查 ----------

const fail = (message, field) => {
  throw new AppError(400, message, field);
};

const text = (value) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim());

/** 正整數或 0；接受 "1,500" 這類千分位寫法 (與舊系統相同) */
function parseAmount(value, { field, emptyMessage, label, min, max }) {
  const s = text(value).replace(/,/g, '');
  if (s === '') fail(emptyMessage, field);
  if (!/^\d+$/.test(s)) fail(`${label}必須為整數`, field);
  const n = Number(s);
  if (n < min || n > max) fail(`${label}必須介於 ${min} ~ ${max.toLocaleString('en-US')}`, field);
  return n;
}

/** 日期時間：接受 "YYYY-MM-DDTHH:mm" 或 "YYYY-MM-DD HH:mm"，以台北時間解讀 */
function parseDateTime(value, { field, emptyMessage }) {
  const s = text(value);
  if (s === '') fail(emptyMessage, field);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) fail('日期時間格式錯誤', field);
  const [, y, mo, d, h, mi, sec = '00'] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
  // 排除 2026-02-30 這類不存在的日期
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    fail('日期時間格式錯誤', field);
  }
  return date;
}

const toBool = (value) => value === true || value === 1 || value === '1' || value === 'true';

/** 檢查考試資料；isCreate 時另需名稱與考試項目 */
function validateExamInput(input = {}, { isCreate }) {
  const data = {};

  if (isCreate) {
    data.name = text(input.name);
    if (!data.name) fail('請輸入考試名稱!', 'name');
    if (data.name.length > 255) fail('考試名稱不可超過 255 字', 'name');

    const itemIds = Array.isArray(input.itemIds) ? input.itemIds : [];
    data.itemIds = [...new Set(itemIds.map((v) => Number(v)))];
    if (data.itemIds.length === 0) fail('請選擇考試項目!', 'itemIds');
    if (data.itemIds.some((v) => !Number.isInteger(v) || v <= 0)) fail('考試項目格式錯誤', 'itemIds');
  }

  data.capacity = parseAmount(input.capacity, {
    field: 'capacity',
    emptyMessage: '請輸入考試限制人數!',
    label: '報名人數限制',
    min: 1,
    max: 9999,
  });
  data.fee = parseAmount(input.fee, {
    field: 'fee',
    emptyMessage: '請輸入考試費用!',
    label: '考試費用',
    min: 0,
    max: 999999,
  });
  data.startDate = parseDateTime(input.startDate, { field: 'startDate', emptyMessage: '請輸入考試起始時間!' });
  data.endDate = parseDateTime(input.endDate, { field: 'endDate', emptyMessage: '請輸入考試結束時間!' });
  data.applyEndDate = parseDateTime(input.applyEndDate, {
    field: 'applyEndDate',
    emptyMessage: '請輸入報名截止時間!',
  });
  if (data.endDate < data.startDate) fail('考試結束時間不可早於起始時間', 'endDate');

  data.memo = text(input.memo);
  if (!data.memo) fail('請輸入備註!', 'memo');
  if (data.memo.length > 3000) fail('備註不可超過 3000 字', 'memo');

  data.requiresRegistration = toBool(input.requiresRegistration);
  data.isPublished = isCreate ? true : toBool(input.isPublished);
  return data;
}

/** 新增考試 (含考試項目) */
async function createExam(input, creator) {
  const data = validateExamInput(input, { isCreate: true });
  return sequelize.transaction(async (transaction) => {
    const found = await License.count({
      where: { le_id: { [Op.in]: data.itemIds }, le_is_del: false },
      transaction,
    });
    if (found !== data.itemIds.length) fail('考試項目不存在或已停用', 'itemIds');

    const rg = await Registration.create(
      {
        rg_name: data.name,
        rg_startDate: data.startDate,
        rg_endDate: data.endDate,
        rg_applyEndDate: data.applyEndDate,
        rg_memo: data.memo,
        rg_money: data.fee,
        rg_number: data.capacity,
        rg_is_regi: data.requiresRegistration,
        rg_is_del: false,
        rg_creator: creator,
        rg_creatDate: new Date(),
      },
      { transaction }
    );
    await LinkRgLe.bulkCreate(
      data.itemIds.map((le) => ({ lk_rg_id: rg.rg_id, lk_le_id: le })),
      { transaction }
    );
    return rg.rg_id;
  });
}

/** 修改考試 (名稱與考試項目不可修改，與舊系統相同) */
async function updateExam(id, input) {
  const data = validateExamInput(input, { isCreate: false });
  await sequelize.transaction(async (transaction) => {
    const rg = await Registration.findByPk(id, { transaction });
    if (!rg) throw new AppError(404, '找不到此考試');
    if (rg.rg_endDate < new Date()) throw new AppError(409, '考試已結束，無法修改');
    await rg.update(
      {
        rg_startDate: data.startDate,
        rg_endDate: data.endDate,
        rg_applyEndDate: data.applyEndDate,
        rg_memo: data.memo,
        rg_money: data.fee,
        rg_number: data.capacity,
        rg_is_regi: data.requiresRegistration,
        rg_is_del: !data.isPublished,
      },
      { transaction }
    );
  });
}

// ---------- 證照分類與項目 ----------

const OTHER_GROUP_NAME = '其他';

/** 「其他」分類固定排在最後 (與舊系統下拉選單相同)，其餘維持資料庫排序 */
function sortOtherLast(groups) {
  const isOther = (g) => String(g.lg_name ?? '').trim() === OTHER_GROUP_NAME;
  return [...groups.filter((g) => !isOther(g)), ...groups.filter(isOther)];
}

/** 證照分類與其項目 (依排序欄位、編號排序，「其他」排最後)；hidden 表示已隱藏 */
async function listLicenseGroups() {
  const [groups, licenses] = await Promise.all([
    LicenseGroup.findAll({ order: [['lg_order', 'ASC'], ['lg_id', 'ASC']] }),
    License.findAll({ where: { le_is_del: false }, order: [['le_order', 'ASC'], ['le_id', 'ASC']] }),
  ]);
  return sortOtherLast(groups).map((g) => ({
    id: g.lg_id,
    name: g.lg_name,
    hidden: Boolean(g.lg_is_hidden),
    items: licenses.filter((le) => le.le_group === g.lg_id).map((le) => ({ id: le.le_id, name: text(le.le_name) })),
  }));
}

const isOtherGroup = (g) => String(g.lg_name ?? '').trim() === OTHER_GROUP_NAME;

function groupNameOf(input, field) {
  const name = text(input?.name);
  if (!name) fail('請輸入分類名稱！', field);
  if (name.length > 100) fail('分類名稱不可超過 100 字', field);
  return name;
}

function licenseNameOf(input, field) {
  const name = text(input?.name);
  if (!name) fail('請輸入證照名稱！', field);
  if (name.length > 50) fail('證照名稱不可超過 50 字', field);
  return name;
}

function groupIdOf(input, field) {
  const groupId = Number(input?.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) fail('請選擇證照分類！', field);
  return groupId;
}

async function findGroup(id, transaction) {
  const lg = await LicenseGroup.findByPk(id, { transaction });
  if (!lg) throw new AppError(404, '找不到此證照分類');
  return lg;
}

async function findLicense(id, transaction) {
  const le = await License.findOne({ where: { le_id: id, le_is_del: false }, transaction });
  if (!le) throw new AppError(404, '找不到此證照項目');
  return le;
}

async function assertGroupNameFree(name, exceptId, transaction) {
  const dup = await LicenseGroup.findOne({ where: { lg_name: name }, transaction });
  if (dup && dup.lg_id !== exceptId) fail('已有相同名稱的證照分類', exceptId ? 'editGroupName' : 'groupName');
}

async function assertLicenseNameFree(groupId, name, exceptId, field, transaction) {
  const dup = await License.findOne({ where: { le_group: groupId, le_name: name, le_is_del: false }, transaction });
  if (dup && dup.le_id !== exceptId) fail('此分類已有相同名稱的證照項目', field);
}

/** 使用此證照項目、且尚未結束的考試 (含下架)；改名或刪除會影響這些考試的報名 */
async function unfinishedExamsUsing(licenseId, transaction) {
  const links = await LinkRgLe.findAll({ where: { lk_le_id: licenseId }, attributes: ['lk_rg_id'], transaction });
  if (links.length === 0) return [];
  return Registration.findAll({
    attributes: ['rg_id', 'rg_name'],
    where: { rg_id: { [Op.in]: links.map((l) => l.lk_rg_id) }, rg_endDate: { [Op.gte]: new Date() } },
    transaction,
  });
}

async function assertNotInUnfinishedExam(licenseId, action, transaction) {
  const exams = await unfinishedExamsUsing(licenseId, transaction);
  if (exams.length) {
    const names = exams.slice(0, 3).map((rg) => `「${rg.rg_name}」`).join('、');
    throw new AppError(409, `此項目已用於尚未結束的考試${names}${exams.length > 3 ? '等' : ''}，無法${action}`);
  }
}

/** 新增證照分類 (名稱不可重複)；排序接在現有分類之後 (lg_order 為 tinyint，上限 255) */
async function createLicenseGroup(input = {}) {
  const name = groupNameOf(input, 'groupName');
  return sequelize.transaction(async (transaction) => {
    await assertGroupNameFree(name, null, transaction);
    const maxOrder = (await LicenseGroup.max('lg_order', { transaction })) ?? 0;
    const lg = await LicenseGroup.create({ lg_name: name, lg_order: Math.min(maxOrder + 1, 255) }, { transaction });
    return { id: lg.lg_id, name: lg.lg_name };
  });
}

/** 修改證照分類名稱 */
async function updateLicenseGroup(id, input = {}) {
  const name = groupNameOf(input, 'editGroupName');
  return sequelize.transaction(async (transaction) => {
    const lg = await findGroup(id, transaction);
    await assertGroupNameFree(name, lg.lg_id, transaction);
    const before = lg.lg_name;
    await lg.update({ lg_name: name }, { transaction });
    return { id: lg.lg_id, name, before };
  });
}

/**
 * 隱藏／取消隱藏證照分類。分類不提供刪除，避免舊考試與報名紀錄無法對照；
 * 隱藏後不出現在新增考試與證照項目的分類選單，分類下的項目與既有資料不變。
 */
async function setLicenseGroupHidden(id, hidden) {
  if (typeof hidden !== 'boolean') throw new AppError(400, '隱藏設定格式錯誤');
  return sequelize.transaction(async (transaction) => {
    const lg = await findGroup(id, transaction);
    if (Boolean(lg.lg_is_hidden) === hidden) throw new AppError(409, hidden ? '此分類已經隱藏' : '此分類沒有隱藏');
    await lg.update({ lg_is_hidden: hidden }, { transaction });
    return { id: lg.lg_id, name: lg.lg_name };
  });
}

/** 新增或移動證照項目時，目標分類必須存在且未隱藏 */
async function assertGroupUsable(groupId, field, transaction) {
  const lg = await LicenseGroup.findByPk(groupId, { transaction });
  if (!lg) fail('證照分類不存在', field);
  if (lg.lg_is_hidden) fail('此分類已隱藏，請先取消隱藏', field);
}

/** 調整分類順序 (上移／下移)：依顯示順序交換後重新編號；「其他」固定最後不可移動 */
async function moveLicenseGroup(id, direction) {
  if (!['up', 'down'].includes(direction)) throw new AppError(400, '移動方向錯誤');
  return sequelize.transaction(async (transaction) => {
    const groups = sortOtherLast(
      await LicenseGroup.findAll({ order: [['lg_order', 'ASC'], ['lg_id', 'ASC']], transaction })
    );
    const index = groups.findIndex((g) => g.lg_id === id);
    if (index < 0) throw new AppError(404, '找不到此證照分類');
    const target = direction === 'up' ? index - 1 : index + 1;
    if (isOtherGroup(groups[index]) || !groups[target] || isOtherGroup(groups[target])) {
      throw new AppError(409, '已在最前或最後，無法再移動');
    }
    [groups[index], groups[target]] = [groups[target], groups[index]];
    for (const [i, g] of groups.entries()) {
      const order = Math.min(i + 1, 255);
      if (g.lg_order !== order) await g.update({ lg_order: order }, { transaction });
    }
    return { id, name: groups[target].lg_name };
  });
}

/** 新增證照項目 (同分類下不可重複名稱) */
async function createLicense(input = {}) {
  const groupId = groupIdOf(input, 'groupId');
  const name = licenseNameOf(input, 'name');
  return sequelize.transaction(async (transaction) => {
    await assertGroupUsable(groupId, 'groupId', transaction);
    await assertLicenseNameFree(groupId, name, null, 'name', transaction);
    const le = await License.create(
      { le_name: name, le_group: groupId, le_order: 0, le_is_del: false, le_creatDate: new Date() },
      { transaction }
    );
    return { id: le.le_id, name: le.le_name, groupId };
  });
}

/** 修改證照項目 (名稱、所屬分類)；用於尚未結束的考試時不可改名 */
async function updateLicense(id, input = {}) {
  const name = licenseNameOf(input, 'editItemName');
  const groupId = groupIdOf(input, 'editItemGroup');
  return sequelize.transaction(async (transaction) => {
    const le = await findLicense(id, transaction);
    // 留在原分類 (即使已隱藏) 可以改名；移到其他分類時目標不可為隱藏分類
    if (groupId !== le.le_group) await assertGroupUsable(groupId, 'editItemGroup', transaction);
    await assertLicenseNameFree(groupId, name, le.le_id, 'editItemName', transaction);
    // 舊資料名稱可能帶前後空白，只去除空白不算改名
    if (name !== text(le.le_name)) await assertNotInUnfinishedExam(le.le_id, '修改名稱', transaction);
    const before = { name: le.le_name, groupId: le.le_group };
    await le.update({ le_name: name, le_group: groupId }, { transaction });
    return { id: le.le_id, name, groupId, before };
  });
}

/** 刪除證照項目 (標記 le_is_del，已建立的考試與報名紀錄不受影響)；用於尚未結束的考試時不可刪除 */
async function deleteLicense(id) {
  return sequelize.transaction(async (transaction) => {
    const le = await findLicense(id, transaction);
    await assertNotInUnfinishedExam(le.le_id, '刪除', transaction);
    await le.update({ le_is_del: true }, { transaction });
    return { id: le.le_id, name: le.le_name, groupId: le.le_group };
  });
}

module.exports = {
  sortOtherLast,
  validateExamInput,
  listAllExams,
  getAdminExam,
  createExam,
  updateExam,
  listLicenseGroups,
  createLicenseGroup,
  updateLicenseGroup,
  setLicenseGroupHidden,
  moveLicenseGroup,
  createLicense,
  updateLicense,
  deleteLicense,
};
