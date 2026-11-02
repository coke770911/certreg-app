'use strict';

/**
 * 使用者資料同步：每次登入時將校務系統檢視表 v_UserData 差異更新至 UserData
 *
 *   - UserData 沒有此帳號 -> 新增
 *   - UserData 已有此帳號 -> 只更新與 v_UserData 不同的欄位
 *   - v_UserData 的值為 NULL / 空白時不覆蓋 (避免來源缺資料時清掉既有資料)
 *   - us_phone、us_email 不在 v_UserData 中，保留原值
 *   - v_UserData 讀取失敗 (例如 Linked Server 斷線) 時沿用既有 UserData，不阻擋登入
 *
 * v_UserData 的欄位長度比 UserData 寬，超過長度的值會截斷並記錄警告。
 */

const { QueryTypes } = require('sequelize');
const { sequelize, UserData, UserDataSource } = require('../models');

// 同步欄位與 UserData 欄位長度 (null 表示非字串欄位)
const SYNC_FIELDS = {
  us_name: 50,
  us_logid: 10,
  us_title: 10,
  us_ename: 50,
  us_id: 20,
  us_sex: 2,
  us_yy: 4,
  us_mm: 2,
  us_dd: 2,
  us_dept: 50,
  us_grade: null,
  us_class: 1,
};

/** 去除 char 欄位補的空白；空字串視為沒有值 */
function clean(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/** 將 v_UserData 的一列轉為 UserData 欄位值 (未有值的欄位為 null) */
function mapSourceRow(source) {
  const values = {};
  for (const [field, maxLength] of Object.entries(SYNC_FIELDS)) {
    let value = clean(source[field]);
    if (value == null) {
      values[field] = null;
      continue;
    }
    if (field === 'us_grade') {
      const grade = Number.parseInt(value, 10);
      values[field] = Number.isInteger(grade) && grade >= 0 && grade <= 255 ? grade : null;
      continue;
    }
    if (field === 'us_ename') value = value.toUpperCase();
    if (value.length > maxLength) {
      console.warn(`[user-sync] ${clean(source.us_no)} 的 ${field} 超過 ${maxLength} 字，已截斷`);
      value = value.slice(0, maxLength);
    }
    values[field] = value;
  }
  return values;
}

/** 比對差異：只回傳來源有值且與目前資料不同的欄位 */
function diffUser(current, values) {
  const changes = {};
  for (const [field, value] of Object.entries(values)) {
    if (value == null) continue;
    const now = field === 'us_grade' ? current[field] ?? null : clean(current[field]);
    if (now !== value) changes[field] = value;
  }
  return changes;
}

async function readSource(studentNo) {
  try {
    return await UserDataSource.findOne({ where: { us_no: studentNo }, raw: true });
  } catch (err) {
    console.error(`[user-sync] 讀取 v_UserData 失敗，改用既有 UserData：${err.message}`);
    return undefined;
  }
}

/**
 * 登入時同步使用者資料，回傳同步後的 UserData；兩邊都沒有資料時回傳 null。
 * options.transaction：沿用外部交易 (測試時可整批回復)，未提供時自行建立交易。
 */
async function syncUserOnLogin(studentNo, options = {}) {
  const source = await readSource(studentNo);
  const run = (fn) => (options.transaction ? fn(options.transaction) : sequelize.transaction(fn));

  return run(async (transaction) => {
    // UPDLOCK + HOLDLOCK：同一帳號同時登入時依序處理，避免重複新增
    const [locked] = await sequelize.query(
      'SELECT TOP 1 us_uid FROM [dbo].[UserData] WITH (UPDLOCK, HOLDLOCK) WHERE us_no = :studentNo ORDER BY us_uid',
      { replacements: { studentNo }, type: QueryTypes.SELECT, transaction }
    );
    const user = locked ? await UserData.findByPk(locked.us_uid, { transaction }) : null;

    if (!source) return user;

    const values = mapSourceRow(source);
    if (!user) {
      const created = await UserData.create(
        {
          ...values,
          us_no: clean(source.us_no),
          us_name: values.us_name ?? '',
          us_logid: values.us_logid ?? '',
          us_title: values.us_title ?? '',
        },
        { transaction }
      );
      console.log(`[user-sync] 新增使用者資料：${created.us_no}`);
      return created;
    }

    const changes = diffUser(user, values);
    if (Object.keys(changes).length > 0) {
      await user.update(changes, { transaction });
      console.log(`[user-sync] 更新使用者資料：${user.us_no}，欄位 ${Object.keys(changes).join(', ')}`);
    }
    return user;
  });
}

module.exports = { mapSourceRow, diffUser, syncUserOnLogin };
