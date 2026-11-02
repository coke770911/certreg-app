'use strict';

/**
 * 登入狀態：JWT 存放於 httpOnly Cookie (前端 JavaScript 無法讀取，降低 XSS 竊取風險)，
 * SameSite=Strict 防止跨站請求偽造。
 */

const { resolveAuthConfig } = require('../config/auth');
const { verifyToken } = require('../services/auth-service');
const { AppError } = require('../errors');

const COOKIE_NAME = 'lrs_token';

/** 解析 Cookie 中的登入憑證，有效時寫入 req.auth；無效或過期則視為未登入 */
function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const payload = verifyToken(token, resolveAuthConfig());
      req.auth = { studentNo: payload.sub, impersonatedBy: payload.imp || null };
    } catch {
      res.clearCookie(COOKIE_NAME, { path: '/' });
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.auth) return next(new AppError(401, '請先登入'));
  next();
}

/**
 * 管理端權限檢查 (權限由「權限設定」頁維護，見 services/permission-service.js)。
 * 每次請求都重新計算，權限被移除後立即失效；代理學生登入時不具任何管理權限。
 * @param {'manage'|'system'} role
 */
function requirePermission(role) {
  return async (req, res, next) => {
    if (!req.auth) return next(new AppError(401, '請先登入'));
    if (req.auth.impersonatedBy) return next(new AppError(403, '代理登入時無法使用管理功能'));
    const { UserData } = require('../models');
    const { ROLES, getPermissionsFor } = require('../services/permission-service');
    const user = await UserData.findOne({ attributes: ['us_no', 'us_logid'], where: { us_no: req.auth.studentNo } });
    const permissions = getPermissionsFor(user);
    if (!permissions.includes(role)) return next(new AppError(403, `您沒有「${ROLES[role].label}」權限`));
    req.permissions = permissions;
    next();
  };
}

function setAuthCookie(req, res, token) {
  const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: '/',
    maxAge: exp * 1000 - Date.now(),
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = { authenticate, requireAuth, requirePermission, setAuthCookie, clearAuthCookie };
