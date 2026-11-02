'use strict';

/**
 * 管理端：考生名單、繳費處理、成績處理、名單匯出、代印繳費單
 * (對應舊系統 Manage/checkPay、payProcess、inpScore、scoreProcess、exportList 與 Apply/ManagePrintPay)
 *
 * 與舊系統的差異：
 *   - 批次更新只會影響「該場考試」且「未取消」的報名，並在同一交易內完成 (舊系統逐筆更新，中途失敗會留下部分結果)
 *   - 成績長度在伺服器端檢查 (資料庫欄位 nvarchar(10))
 *   - 匯出改為 .xlsx 格式
 */

const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const { sequelize, Apply, Registration, UserData } = require('../models');
const { PAY_STATUS } = require('./application-service');
const { formatScore, buildDepositSlip } = require('./my-application-service');
const { AppError } = require('../errors');

// 批次繳費操作 → 寫入的值 (cancel 對應舊系統的「取消報名」)
const PAY_ACTIONS = {
  paid: { ap_is_pay: '1', ap_is_del: false, label: '已繳費' },
  refund: { ap_is_pay: '2', ap_is_del: false, label: '退費' },
  exempt: { ap_is_pay: '3', ap_is_del: false, label: '免繳費' },
  unpaid: { ap_is_pay: '0', ap_is_del: false, label: '未繳費' },
  cancel: { ap_is_pay: '0', ap_is_del: true, label: '取消報名' },
};

const SCORE_MAX_LENGTH = 10;

const payCodeOf = (ap) => String(ap.ap_is_pay ?? '0').trim() || '0';

async function findExam(examId) {
  const rg = await Registration.findByPk(examId);
  if (!rg) throw new AppError(404, '找不到此考試');
  return rg;
}

/** 某場考試的有效報名 (依學號排序，與舊系統相同) */
async function findActiveApplies(examId, transaction) {
  return Apply.findAll({
    where: { ap_rg_id: examId, ap_is_del: false },
    order: [['ap_us_no', 'ASC'], ['ap_id', 'ASC']],
    transaction,
  });
}

function toApplicantDto(ap) {
  const payCode = payCodeOf(ap);
  return {
    id: ap.ap_id,
    studentNo: ap.ap_us_no,
    name: ap.ap_us_name,
    englishName: ap.ap_us_ename,
    idNumber: ap.ap_us_id,
    sex: ap.ap_us_sex,
    dept: ap.ap_us_cdept,
    phone: ap.ap_us_phone,
    email: ap.ap_us_email,
    item: ap.ap_le_name,
    fee: ap.ap_rg_money,
    isRegistered: Boolean(ap.ap_is_regi),
    memo: ap.ap_us_memo,
    payCode,
    payStatus: PAY_STATUS[payCode] ?? PAY_STATUS[0],
    score: formatScore(ap.ap_score) ?? '',
    scorePass: Boolean(ap.ap_scorePass),
    createdAt: ap.ap_createDate,
  };
}

/** 考生名單與繳費統計 */
async function listApplicants(examId) {
  const rg = await findExam(examId);
  const applicants = (await findActiveApplies(examId)).map(toApplicantDto);
  const paid = applicants.filter((a) => a.payCode === '1');
  return {
    exam: { id: rg.rg_id, name: rg.rg_name, startDate: rg.rg_startDate, endDate: rg.rg_endDate, fee: rg.rg_money },
    applicants,
    summary: {
      total: applicants.length,
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, a) => sum + Number(a.fee || 0), 0),
    },
  };
}

function parseIdList(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new AppError(400, '未勾選任何學生！', 'ids');
  const list = [...new Set(ids.map(Number))];
  if (list.some((v) => !Number.isInteger(v) || v <= 0)) throw new AppError(400, '報名編號格式錯誤', 'ids');
  if (list.length > 2000) throw new AppError(400, '一次最多處理 2000 筆', 'ids');
  return list;
}

/** 批次更新繳費狀態；任何一筆不屬於此考試或已取消，整批不更新 */
async function updatePayStatus(examId, input = {}) {
  const action = PAY_ACTIONS[input.action];
  if (!action) throw new AppError(400, '繳費處理項目錯誤', 'action');
  const ids = parseIdList(input.ids);

  return sequelize.transaction(async (transaction) => {
    const [count] = await Apply.update(
      { ap_is_pay: action.ap_is_pay, ap_is_del: action.ap_is_del, ap_modifyDate: new Date() },
      { where: { ap_id: { [Op.in]: ids }, ap_rg_id: examId, ap_is_del: false }, transaction }
    );
    if (count !== ids.length) {
      throw new AppError(409, '部分報名資料已取消或不屬於此考試，請重新整理後再試');
    }
    return { count, label: action.label, ids };
  });
}

/** 批次更新成績 */
async function updateScores(examId, input = {}) {
  const rows = Array.isArray(input.scores) ? input.scores : [];
  if (rows.length === 0) throw new AppError(400, '沒有要更新的成績');
  if (rows.length > 2000) throw new AppError(400, '一次最多處理 2000 筆');

  const updates = rows.map((row) => {
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(400, '報名編號格式錯誤');
    const score = typeof row.score === 'string' ? row.score.trim() : row.score == null ? '' : String(row.score).trim();
    if (score.length > SCORE_MAX_LENGTH) {
      throw new AppError(400, `成績最多 ${SCORE_MAX_LENGTH} 個字`, `score-${id}`);
    }
    return { id, score: score || '未輸入', pass: row.pass === true };
  });
  if (new Set(updates.map((u) => u.id)).size !== updates.length) throw new AppError(400, '報名編號重複');

  return sequelize.transaction(async (transaction) => {
    const valid = await Apply.count({
      where: { ap_id: { [Op.in]: updates.map((u) => u.id) }, ap_rg_id: examId, ap_is_del: false },
      transaction,
    });
    if (valid !== updates.length) {
      throw new AppError(409, '部分報名資料已取消或不屬於此考試，請重新整理後再試');
    }
    for (const u of updates) {
      await Apply.update(
        { ap_score: u.score, ap_scorePass: u.pass, ap_modifyDate: new Date() },
        { where: { ap_id: u.id }, transaction }
      );
    }
    return updates.length;
  });
}

const EXPORT_COLUMNS = [
  { header: '日期', key: 'date', width: 11 },
  { header: '場次', key: 'session', width: 8 },
  { header: '考試項目', key: 'item', width: 24 },
  { header: '系別班級', key: 'dept', width: 20 },
  { header: '姓名', key: 'name', width: 10 },
  { header: '英文姓名', key: 'englishName', width: 20 },
  { header: '學號', key: 'studentNo', width: 12 },
  { header: '身分證字號', key: 'idNumber', width: 13 },
  { header: '出生年月日', key: 'birthday', width: 11 },
  { header: '性別', key: 'sex', width: 6 },
  { header: '行動電話', key: 'phone', width: 13 },
  { header: '電子郵件', key: 'email', width: 28 },
  { header: '官網註冊', key: 'registered', width: 9 },
  { header: '是否繳費', key: 'pay', width: 9 },
  { header: '意見', key: 'memo', width: 24 },
  { header: '成績', key: 'score', width: 8 },
  { header: '是否合格', key: 'pass', width: 9 },
];

const ymd = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

/** 名單匯出 Excel (欄位與舊系統 exportList 相同)；回傳 { buffer, filename } */
async function exportApplicants(examId) {
  const rg = await findExam(examId);
  const applies = await findActiveApplies(examId);

  // 出生年月日取自使用者資料 (報名資料未保存)
  const users = applies.length
    ? await UserData.findAll({
        attributes: ['us_no', 'us_yy', 'us_mm', 'us_dd'],
        where: { us_no: { [Op.in]: [...new Set(applies.map((ap) => ap.ap_us_no))] } },
      })
    : [];
  const birthdayOf = new Map(
    users.map((u) => [u.us_no, u.us_yy ? [u.us_yy, u.us_mm, u.us_dd].map((v) => (v ?? '').trim()).join('/') : ''])
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('報名名單');
  sheet.columns = EXPORT_COLUMNS;
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const ap of applies) {
    sheet.addRow({
      date: ymd(rg.rg_startDate),
      session: '',
      item: ap.ap_le_name,
      dept: ap.ap_us_cdept,
      name: ap.ap_us_name,
      englishName: ap.ap_us_ename,
      studentNo: ap.ap_us_no,
      idNumber: ap.ap_us_id,
      birthday: birthdayOf.get(ap.ap_us_no) ?? '',
      sex: String(ap.ap_us_sex).trim() === 'F' ? '女' : '男',
      phone: ap.ap_us_phone,
      email: ap.ap_us_email,
      registered: ap.ap_is_regi ? '是' : '否',
      pay: PAY_STATUS[payCodeOf(ap)] ?? PAY_STATUS[0],
      memo: ap.ap_us_memo,
      score: formatScore(ap.ap_score) ?? '',
      pass: ap.ap_scorePass ? '合格' : '不合格',
    });
  }
  // 學號、電話、身分證以文字儲存，避免 Excel 去掉開頭的 0
  for (const key of ['studentNo', 'idNumber', 'phone']) sheet.getColumn(key).numFmt = '@';

  const buffer = await workbook.xlsx.writeBuffer();
  // 移除 Windows 檔名不允許的字元
  const safeName = rg.rg_name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 80);
  return { buffer, filename: `${ymd(new Date())}證照報名資料-${safeName}.xlsx` };
}

/** 管理端代印繳費單 (對應 Apply/ManagePrintPay，不限繳費狀態) */
async function getAdminDepositSlip(applyId, payee) {
  const ap = await Apply.findOne({ where: { ap_id: applyId, ap_is_del: false } });
  if (!ap) throw new AppError(404, '找不到此報名資料');
  return { ...(await buildDepositSlip(ap, payee)), examId: ap.ap_rg_id };
}

module.exports = {
  PAY_ACTIONS,
  listApplicants,
  updatePayStatus,
  updateScores,
  exportApplicants,
  getAdminDepositSlip,
};
