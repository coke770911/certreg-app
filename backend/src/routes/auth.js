'use strict';

const express = require('express');
const { resolveAuthConfig } = require('../config/auth');
const { login, toSessionUser, signToken } = require('../services/auth-service');
const { UserData } = require('../models');
const { setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { isBlocked, recordFailure, clearFailures } = require('../middleware/login-limiter');
const { AppError } = require('../errors');
const { writeLog, audit } = require('../services/audit-log');

/** 登入失敗時記錄輸入的帳號 (只取前 50 字，不記錄密碼) */
const typedAccount = (username) => String(username ?? '').trim().toLowerCase().slice(0, 50) || null;

const router = express.Router();

// 登入 (對應舊系統 User/login)
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (isBlocked(req.ip, username)) {
    writeLog({ category: 'auth', level: 'warn', action: '登入封鎖', actor: typedAccount(username), ip: req.ip, detail: '失敗次數過多' });
    throw new AppError(429, '登入失敗次數過多，請 15 分鐘後再試');
  }

  const config = resolveAuthConfig();
  let result;
  try {
    result = await login(username, password, config);
  } catch (err) {
    if (err instanceof AppError && [401, 403, 404].includes(err.status)) recordFailure(req.ip, username);
    if (err instanceof AppError) {
      writeLog({ category: 'auth', level: 'warn', action: '登入失敗', actor: typedAccount(username), ip: req.ip, detail: err.message });
    }
    throw err;
  }

  clearFailures(req.ip, username);
  const sessionUser = toSessionUser(result.user, result.impersonatedBy);
  setAuthCookie(req, res, signToken(sessionUser, config));
  writeLog({
    category: 'auth',
    action: sessionUser.impersonatedBy ? '代理登入' : '登入',
    actor: sessionUser.studentNo,
    impersonatedBy: sessionUser.impersonatedBy,
    ip: req.ip,
    detail: sessionUser.name,
  });
  res.json({ message: '登入成功!', user: sessionUser });
});

// 登出 (對應舊系統 User/logout)
router.post('/logout', (req, res) => {
  if (req.auth) audit(req, 'auth', '登出');
  clearAuthCookie(res);
  res.json({ message: '登出成功!' });
});

// 目前登入者；未登入時 user 為 null。devLogin 供登入頁提示開發模式
router.get('/me', async (req, res) => {
  const devLogin = resolveAuthConfig().provider === 'dev';
  if (!req.auth) return res.json({ user: null, devLogin });

  const user = await UserData.findOne({ where: { us_no: req.auth.studentNo } });
  if (!user) {
    clearAuthCookie(res);
    return res.json({ user: null, devLogin });
  }
  res.json({ user: toSessionUser(user, req.auth.impersonatedBy), devLogin });
});

module.exports = router;
