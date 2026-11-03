'use strict';

/**
 * 我的報名紀錄：列表、詳細、修改、取消、繳費單
 * (對應舊系統 Apply/historyList、detailed、editProcess、cancel、PrintPay)
 *
 * 與舊系統的差異 (安全性修正)：
 *   - 所有操作都限定登入者本人的報名 (舊系統取消報名只看 ap_id，可取消他人報名)
 *   - 修改、取消在伺服器端檢查報名截止時間 (舊系統只在畫面上隱藏按鈕)
 *   - 修改時姓名、性別、身分證字號沿用原報名資料，不可變更 (與舊系統畫面一致)
 */

const { QueryTypes } = require('sequelize');
const { sequelize, Apply, Registration } = require('../models');
const { getExam } = require('./exam-service');
const { PAY_STATUS, validateApplyInput } = require('./application-service');
const { toChineseAmount, toSlipDigits } = require('./chinese-amount');
const { AppError } = require('../errors');

const NO_SCORE = ['', '-1', '未輸入'];

function formatScore(score) {
  const s = score == null ? '' : String(score).trim();
  return NO_SCORE.includes(s) ? null : s;
}

function toListItem(ap, rg, now = new Date()) {
  const payCode = String(ap.ap_is_pay ?? '0').trim() || '0';
  const isOpen = Boolean(rg && !rg.rg_is_del && rg.rg_applyEndDate > now);
  return {
    id: ap.ap_id,
    examId: ap.ap_rg_id,
    examName: ap.ap_rg_name,
    item: ap.ap_le_name,
    fee: ap.ap_rg_money,
    payStatus: PAY_STATUS[payCode] ?? PAY_STATUS[0],
    score: formatScore(ap.ap_score),
    startDate: rg?.rg_startDate ?? null,
    endDate: rg?.rg_endDate ?? null,
    applyEndDate: rg?.rg_applyEndDate ?? null,
    createdAt: ap.ap_createDate,
    canEdit: isOpen,
    canCancel: isOpen,
    canPrintSlip: payCode === '0',
  };
}

/** 取得本人的有效報名；不存在或不屬於本人一律回 404 (不透露他人報名是否存在) */
async function findOwnApplication(id, studentNo, transaction) {
  const ap = await Apply.findOne({ where: { ap_id: id, ap_us_no: studentNo, ap_is_del: false }, transaction });
  if (!ap) throw new AppError(404, '找不到此報名資料');
  return ap;
}

/** 報名紀錄列表 (新報名在前) */
async function listMyApplications(studentNo) {
  const rows = await Apply.findAll({
    where: { ap_us_no: studentNo, ap_is_del: false },
    include: [{ model: Registration, as: 'registration' }],
    order: [['ap_id', 'DESC']],
  });
  const now = new Date();
  return rows.map((ap) => toListItem(ap, ap.registration, now));
}

/** 報名詳細 (含可修改欄位目前的值) */
async function getMyApplication(id, studentNo) {
  const ap = await findOwnApplication(id, studentNo);
  const rg = await Registration.findByPk(ap.ap_rg_id);
  const exam = await getExam(ap.ap_rg_id);
  return {
    ...toListItem(ap, rg),
    exam,
    form: {
      studentNo: ap.ap_us_no,
      name: ap.ap_us_name,
      englishName: ap.ap_us_ename,
      sex: ap.ap_us_sex,
      idNumber: ap.ap_us_id,
      // 舊紀錄沒有項目編號時，以名稱 (忽略前後空白) 對應該場考試的項目
      itemId: ap.ap_le_id ?? exam?.items.find((i) => i.name === String(ap.ap_le_name ?? '').trim())?.id ?? null,
      item: ap.ap_le_name,
      dept: ap.ap_us_cdept,
      phone: ap.ap_us_phone,
      email: ap.ap_us_email,
      isRegistered: Boolean(ap.ap_is_regi),
      memo: ap.ap_us_memo,
    },
  };
}

/** 確認考試仍開放 (以資料庫時間判斷，與報名時相同) */
async function assertExamOpen(examId, transaction) {
  const [rg] = await sequelize.query(
    `SELECT CASE WHEN rg_applyEndDate > GETDATE() AND rg_is_del = 0 THEN 1 ELSE 0 END AS isOpen
     FROM [dbo].[Registration] WHERE rg_id = :examId`,
    { replacements: { examId }, type: QueryTypes.SELECT, transaction }
  );
  if (!rg || !rg.isOpen) throw new AppError(409, '報名已截止，無法修改或取消，請洽承辦單位');
}

/** 修改報名 (對應 Apply/editProcess)：可改考試項目、英文姓名、系年班、電話、電子郵件、官網註冊、備註 */
async function updateMyApplication(id, studentNo, input) {
  return sequelize.transaction(async (transaction) => {
    const ap = await findOwnApplication(id, studentNo, transaction);
    await assertExamOpen(ap.ap_rg_id, transaction);

    const exam = await getExam(ap.ap_rg_id);
    const data = validateApplyInput(
      { ...input, name: ap.ap_us_name, sex: ap.ap_us_sex, idNumber: ap.ap_us_id },
      exam
    );

    await ap.update(
      {
        ap_le_id: data.itemId,
        ap_le_name: data.item,
        ap_us_ename: data.englishName,
        ap_us_cdept: data.dept,
        ap_us_phone: data.phone,
        ap_us_email: data.email,
        ap_us_memo: data.memo,
        ap_is_regi: exam.requiresRegistration ? data.isRegistered : ap.ap_is_regi,
        ap_modifyDate: new Date(),
      },
      { transaction }
    );
    return toListItem(ap, await Registration.findByPk(ap.ap_rg_id, { transaction }));
  });
}

/** 取消報名 (對應 Apply/cancel)：標記 ap_is_del = 1，不實際刪除 */
async function cancelMyApplication(id, studentNo) {
  return sequelize.transaction(async (transaction) => {
    const ap = await findOwnApplication(id, studentNo, transaction);
    await assertExamOpen(ap.ap_rg_id, transaction);
    await ap.update({ ap_is_del: true, ap_modifyDate: new Date() }, { transaction });
    return { id: ap.ap_id, examId: ap.ap_rg_id, examName: ap.ap_rg_name, item: ap.ap_le_name };
  });
}

/** 繳費單資料 (對應 Apply/PrintPay)；僅尚未繳費的報名可列印 */
async function getDepositSlip(id, studentNo, payee) {
  const ap = await findOwnApplication(id, studentNo);
  if (String(ap.ap_is_pay ?? '0').trim() !== '0') {
    throw new AppError(409, `此報名繳費狀態為「${PAY_STATUS[String(ap.ap_is_pay).trim()] ?? '未知'}」，無需列印繳費單`);
  }
  return buildDepositSlip(ap, payee);
}

/** 依報名資料組出繳費單內容 (學生端與管理端共用) */
async function buildDepositSlip(ap, payee) {
  const rg = await Registration.findByPk(ap.ap_rg_id);
  return {
    payee,
    studentNo: ap.ap_us_no,
    name: ap.ap_us_name,
    phone: ap.ap_us_phone,
    email: ap.ap_us_email,
    examName: ap.ap_rg_name,
    item: ap.ap_le_name,
    amount: ap.ap_rg_money,
    amountChinese: toChineseAmount(ap.ap_rg_money),
    amountDigits: toSlipDigits(ap.ap_rg_money),
    // 繳款期限 = 報名截止時間 (與舊系統相同)
    dueDate: rg?.rg_applyEndDate ?? null,
  };
}

module.exports = {
  formatScore,
  listMyApplications,
  getMyApplication,
  updateMyApplication,
  cancelMyApplication,
  getDepositSlip,
  buildDepositSlip,
};
