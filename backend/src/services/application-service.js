'use strict';

/**
 * 線上報名 (對應舊系統 Apply/applyData、Apply/addProcess 與 M_UserApply)
 *
 * 與舊系統的差異 (安全性修正)：
 *   - 學號一律取自登入身分，不接受表單傳入，避免替他人報名
 *   - 考試項目必須是該場考試的項目之一
 *   - 已刪除的考試不可報名
 *   - 截止、額滿、重複報名的檢查與寫入在同一交易內並鎖定考試列，避免同時送出造成超額
 */

const { QueryTypes } = require('sequelize');
const { sequelize, Apply, UserData } = require('../models');
const { getExam } = require('./exam-service');
const { AppError } = require('../errors');

const PAY_STATUS = { 0: '尚未繳費', 1: '已繳費', 2: '退費', 3: '免繳費' };

/**
 * 報名時填寫的電話與 Email 回存至 UserData (下次報名預設帶出)
 * 只更新有變動的欄位；UserData 沒有此帳號時不處理 (登入時才會建立)
 */
async function saveContactToProfile(studentNo, { phone, email }, transaction) {
  const user = await UserData.findOne({ where: { us_no: studentNo }, transaction });
  if (!user) return;
  const changes = {};
  if (phone && (user.us_phone || '').trim() !== phone) changes.us_phone = phone;
  if (email && (user.us_email || '').trim() !== email) changes.us_email = email;
  if (Object.keys(changes).length > 0) await user.update(changes, { transaction });
}

/** 預設聯絡資料：以 UserData 為主，沒有資料時改用最近一次報名填寫的值 */
async function defaultContact(user) {
  let phone = (user.us_phone || '').trim();
  let email = (user.us_email || '').trim();
  if (!phone || !email) {
    const last = await Apply.findOne({
      where: { ap_us_no: user.us_no },
      attributes: ['ap_us_phone', 'ap_us_email'],
      order: [['ap_id', 'DESC']],
    });
    phone ||= (last?.ap_us_phone || '').trim();
    email ||= (last?.ap_us_email || '').trim();
  }
  return { phone, email };
}

const fieldError = (message, field) => new AppError(400, message, field);
const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/** 驗證並整理報名表單；回傳可寫入的欄位值 */
function validateApplyInput(input, exam) {
  const data = input || {};

  // 以證照項目編號 (le_id) 選擇，必須是該場考試的項目
  const itemId = Number(data.itemId);
  const selected = Number.isInteger(itemId) ? exam.items.find((i) => i.id === itemId) : null;
  if (!selected) throw fieldError('請選擇考試項目!', 'itemId');

  const name = text(data.name);
  if (!name) throw fieldError('請輸入姓名!', 'name');
  if (name.length > 50) throw fieldError('姓名過長', 'name');

  const englishName = text(data.englishName).toUpperCase();
  if (!englishName) throw fieldError('請輸入英文姓名!', 'englishName');
  if (englishName.length > 50 || !/^[A-Z][A-Z ,.'-]*$/.test(englishName)) {
    throw fieldError('英文姓名格式錯誤，例如：WANG,SIAO-MING', 'englishName');
  }

  const sex = text(data.sex).toUpperCase();
  if (!['M', 'F'].includes(sex)) throw fieldError('請選擇性別!', 'sex');

  const idNumber = text(data.idNumber).toUpperCase();
  if (!idNumber) throw fieldError('請輸入身分證字號!', 'idNumber');
  if (!/^[A-Z0-9]{6,20}$/.test(idNumber)) throw fieldError('身分證字號格式錯誤', 'idNumber');

  const dept = text(data.dept);
  if (!dept) throw fieldError('請輸入系年班!', 'dept');
  if (dept.length > 50) throw fieldError('系年班過長', 'dept');

  const phone = text(data.phone);
  if (!phone) throw fieldError('請輸入連絡電話!', 'phone');
  if (!/^\d{8,15}$/.test(phone)) throw fieldError('連絡電話請輸入數字，勿加入符號與空白，例如：0910123456', 'phone');

  const email = text(data.email);
  if (!email) throw fieldError('請輸入電子郵件!', 'email');
  if (email.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fieldError('電子郵件格式錯誤', 'email');

  const memo = text(data.memo);
  if (memo.length > 120) throw fieldError('備註最多 120 字', 'memo');

  return {
    itemId: selected.id,
    // 報名當下的項目名稱快照 (去除舊資料的前後空白，與舊系統寫入一致)
    item: text(selected.name),
    name,
    englishName,
    sex,
    idNumber,
    dept,
    phone,
    email,
    memo,
    isRegistered: exam.requiresRegistration ? data.isRegistered === true : false,
  };
}

function toApplicationDto(ap) {
  return {
    id: ap.ap_id,
    examId: ap.ap_rg_id,
    examName: ap.ap_rg_name,
    itemId: ap.ap_le_id ?? null,
    item: ap.ap_le_name,
    fee: ap.ap_rg_money,
    payStatus: PAY_STATUS[ap.ap_is_pay ?? '0'] ?? PAY_STATUS[0],
    createdAt: ap.ap_createDate,
  };
}

async function findActiveApplication(examId, studentNo, transaction) {
  return Apply.findOne({ where: { ap_rg_id: examId, ap_us_no: studentNo, ap_is_del: false }, transaction });
}

/** 報名表單資料：考試資訊、以個人資料預填的欄位、是否已報名 */
async function getApplyForm(examId, studentNo) {
  const exam = await getExam(examId);
  if (!exam) throw new AppError(404, '找不到此考試');

  const user = await UserData.findOne({ where: { us_no: studentNo } });
  if (!user) throw new AppError(401, '請先登入');

  const existing = await findActiveApplication(examId, studentNo);
  const contact = await defaultContact(user);
  return {
    exam,
    profile: {
      studentNo: user.us_no,
      name: user.us_name || '',
      englishName: (user.us_ename || '').toUpperCase(),
      sex: user.us_sex === 'M' || user.us_sex === 'F' ? user.us_sex : '',
      idNumber: user.us_id || '',
      dept: [user.us_dept, user.us_grade, user.us_class].filter((v) => v != null && v !== '').join(''),
      phone: contact.phone,
      email: contact.email,
    },
    application: existing ? toApplicationDto(existing) : null,
  };
}

/** 送出報名 */
async function submitApplication(examId, studentNo, input) {
  const exam = await getExam(examId);
  if (!exam) throw new AppError(404, '此考試項目不存在，請洽詢系統管理者!');
  const data = validateApplyInput(input, exam);

  return sequelize.transaction(async (transaction) => {
    // 鎖定考試列：同一場考試的報名依序處理，人數檢查才不會被同時送出的請求繞過
    const [rg] = await sequelize.query(
      `SELECT rg_id, rg_name, rg_money, rg_number,
              CASE WHEN rg_applyEndDate > GETDATE() THEN 1 ELSE 0 END AS isOpen
       FROM [dbo].[Registration] WITH (UPDLOCK, ROWLOCK)
       WHERE rg_id = :examId AND rg_is_del = 0`,
      { replacements: { examId }, type: QueryTypes.SELECT, transaction }
    );
    if (!rg) throw new AppError(404, '此考試項目不存在，請洽詢系統管理者!');
    if (!rg.isOpen) throw new AppError(409, '報名時間已過!');

    if (await findActiveApplication(examId, studentNo, transaction)) {
      throw new AppError(409, '您已報名、請勿重複報名!');
    }

    const applied = await Apply.count({ where: { ap_rg_id: examId, ap_is_del: false }, transaction });
    if (applied >= rg.rg_number) throw new AppError(409, '報名人數已滿!');

    const ap = await Apply.create(
      {
        ap_rg_id: rg.rg_id,
        ap_rg_name: rg.rg_name,
        ap_le_id: data.itemId,
        ap_le_name: data.item,
        ap_rg_money: rg.rg_money,
        ap_us_no: studentNo,
        ap_us_name: data.name,
        ap_us_ename: data.englishName,
        ap_us_id: data.idNumber,
        ap_us_sex: data.sex,
        ap_us_cdept: data.dept,
        ap_us_phone: data.phone,
        ap_us_email: data.email,
        ap_us_memo: data.memo,
        ap_is_regi: data.isRegistered,
        ap_score: '未輸入',
        ap_is_pay: '0',
      },
      { transaction }
    );
    await saveContactToProfile(studentNo, data, transaction);
    return toApplicationDto(ap);
  });
}

module.exports = { PAY_STATUS, validateApplyInput, saveContactToProfile, getApplyForm, submitApplication };
