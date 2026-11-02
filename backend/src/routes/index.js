'use strict';

/**
 * API 路由總表，所有路由皆掛載於 /api 之下。
 * 後續功能模組 (報名、證照、會員等) 於此註冊。
 */

const express = require('express');
const { resolveDbConfig } = require('../config/database');

const router = express.Router();

// 服務健康檢查 (不連線資料庫，僅回報服務狀態與運行模式)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', appEnv: resolveDbConfig().appEnv, time: new Date().toISOString() });
});

router.use('/exams', require('./exams'));
router.use('/auth', require('./auth'));
router.use('/applications', require('./applications'));
router.use('/admin', require('./admin'));
router.use('/system', require('./system'));

module.exports = router;
