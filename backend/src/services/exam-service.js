'use strict';

/**
 * 考試場次查詢 (對應舊系統 M_Registration 的 getNowList / getData / getItem)
 */

const { Op, literal } = require('sequelize');
const { Registration, License } = require('../models');

// 有效報名人數 (排除已取消)，與舊系統 rg_nowNumber 計算方式相同
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

function toExamDto(rg) {
  const appliedCount = Number(rg.get('appliedCount') ?? 0);
  const now = new Date();
  return {
    id: rg.rg_id,
    name: rg.rg_name,
    startDate: rg.rg_startDate,
    endDate: rg.rg_endDate,
    applyEndDate: rg.rg_applyEndDate,
    fee: rg.rg_money,
    capacity: rg.rg_number,
    appliedCount,
    requiresRegistration: Boolean(rg.rg_is_regi),
    memo: rg.rg_memo,
    isOpen: rg.rg_applyEndDate > now,
    isFull: appliedCount >= rg.rg_number,
    items: (rg.items || [])
      // 部分舊資料的項目名稱帶有前後空白 (如「Photoshop 」)，舊系統寫入報名時為去除空白的名稱
      .map((le) => ({ id: le.le_id, name: String(le.le_name ?? '').trim() }))
      .sort((a, b) => a.id - b.id),
  };
}

/** 開放報名中的考試 (未刪除且報名截止時間未到)，依名稱排序 */
async function listOpenExams() {
  const rows = await Registration.findAll({
    attributes: { include: [appliedCount] },
    where: { rg_is_del: false, rg_applyEndDate: { [Op.gt]: new Date() } },
    include: [itemsInclude],
    order: [['rg_name', 'ASC']],
  });
  return rows.map(toExamDto);
}

/** 單一考試詳細資料 (已刪除的考試視為不存在) */
async function getExam(id) {
  const rg = await Registration.findOne({
    attributes: { include: [appliedCount] },
    where: { rg_id: id, rg_is_del: false },
    include: [itemsInclude],
  });
  return rg ? toExamDto(rg) : null;
}

module.exports = { listOpenExams, getExam };
