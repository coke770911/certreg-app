'use strict';

/**
 * 登入流程 (對應舊系統 User/login 與 M_UserData)
 *
 * 帳號格式：
 *   學號或教職員帳號       -> 以本人 AD 密碼登入
 *   學號/管理員帳號        -> 管理員以自己的 AD 密碼代替學生登入 (協助報名)，
 *                            管理員須於「權限設定」具備代理學生登入權限
 */

const jwt = require('jsonwebtoken');
const { syncUserOnLogin } = require('./user-sync');
const { AppError } = require('../errors');
const { verifyAdCredentials, AdServiceError } = require('./ad-auth');
const { getPermissionsFor, listImpersonators } = require('./permission-service');

/** 解析登入帳號；格式不合法時拋出錯誤 */
function parseLoginName(username, adminAccounts) {
  const name = String(username ?? '').trim().toLowerCase();
  if (!name) throw new AppError(400, '請輸入學號！', 'username');

  const parts = name.split('/');
  if (parts.length === 1) {
    return { studentNo: name, account: name, impersonatedBy: null };
  }
  const [studentNo, account] = parts;
  if (parts.length !== 2 || !studentNo || !adminAccounts.includes(account)) {
    throw new AppError(403, '請勿使用不合法方式登入系統！！', 'username');
  }
  return { studentNo, account, impersonatedBy: account };
}

async function login(username, password, config) {
  const who = parseLoginName(username, listImpersonators());
  if (!password) throw new AppError(400, '請輸入密碼！', 'password');

  if (config.provider === 'ad') {
    let verified;
    try {
      verified = await verifyAdCredentials(who.account, password, config);
    } catch (err) {
      if (err instanceof AdServiceError) {
        console.error(`[auth] ${err.message}`);
        throw new AppError(502, '系統認證出現錯誤，請聯絡圖資中心！');
      }
      throw err;
    }
    if (!verified.ok) {
      // 只記錄 AD 回應內容，不記錄密碼
      console.warn(`[auth] AD 驗證未通過：帳號 ${who.account}，回應「${verified.result}」`);
      throw new AppError(401, '帳號或密碼輸入錯誤！');
    }
  }

  // 每次登入都將 v_UserData 差異更新至 UserData (沒有資料則新增)
  const user = await syncUserOnLogin(who.studentNo);
  if (!user) {
    console.warn(`[auth] v_UserData 與 UserData 皆查無此帳號：${who.studentNo}`);
    throw new AppError(404, '找不到您的資料！');
  }

  if (who.impersonatedBy) {
    console.log(`[auth] 管理員 ${who.impersonatedBy} 代理登入 ${user.us_no}`);
  }
  return { user, impersonatedBy: who.impersonatedBy };
}

function toSessionUser(user, impersonatedBy = null) {
  return {
    studentNo: user.us_no,
    name: user.us_name,
    title: user.us_title,
    isStaff: user.us_logid === 'STAFF',
    impersonatedBy,
    // 管理端權限 (manage / impersonate / system)，代理登入時為空
    permissions: getPermissionsFor(user, impersonatedBy),
  };
}

function signToken(sessionUser, config) {
  return jwt.sign(
    { sub: sessionUser.studentNo, imp: sessionUser.impersonatedBy || undefined },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' }
  );
}

function verifyToken(token, config) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
}

module.exports = { parseLoginName, login, toSessionUser, signToken, verifyToken };
