'use strict';

/**
 * 系統資訊與權限設定 (/api/system/*)，需具備「系統管理」權限
 */

const express = require('express');
const { Op } = require('sequelize');
const { requirePermission } = require('../middleware/auth');
const { resolveDbConfig } = require('../config/database');
const { sequelize, UserData } = require('../models');
const { audit, queryLogs, summarizeRecent, CATEGORIES, RETENTION_DAYS } = require('../services/audit-log');
const { ROLES, loadPermissions, isBootstrap, savePermissions } = require('../services/permission-service');
const { findMissingColumns } = require('../services/schema-check');
const { version } = require('../../package.json');

const router = express.Router();

router.use(requirePermission('system'));

const startedAt = new Date();

// 伺服器狀態摘要
router.get('/status', async (req, res) => {
  const dbConfig = resolveDbConfig();
  let database;
  const t0 = Date.now();
  try {
    await sequelize.query('SELECT 1');
    database = { ok: true, latencyMs: Date.now() - t0, missingColumns: await findMissingColumns() };
  } catch (err) {
    database = { ok: false, message: '資料庫連線失敗' };
    console.error('[system] 資料庫檢查失敗：', err.message);
  }
  const permissions = loadPermissions();
  res.json({
    app: {
      version,
      appEnv: dbConfig.appEnv,
      node: process.version,
      startedAt,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    database,
    logs: { ...(await summarizeRecent()), retentionDays: RETENTION_DAYS, categories: CATEGORIES },
    permissions: { bootstrap: isBootstrap(permissions), accountCount: permissions.accounts.length },
  });
});

// 系統日誌查詢
router.get('/logs', async (req, res) => {
  res.json({ ...(await queryLogs(req.query)), categories: CATEGORIES });
});

async function permissionView() {
  const data = loadPermissions();
  const users = data.accounts.length
    ? await UserData.findAll({
        attributes: ['us_no', 'us_name', 'us_title'],
        where: { us_no: { [Op.in]: data.accounts.map((a) => a.account) } },
      })
    : [];
  const byNo = new Map(users.map((u) => [String(u.us_no).trim().toLowerCase(), u]));
  return {
    roles: ROLES,
    bootstrap: isBootstrap(data),
    corrupted: Boolean(data.corrupted),
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
    accounts: data.accounts.map((a) => ({
      account: a.account,
      roles: a.roles,
      note: a.note ?? '',
      updatedAt: a.updatedAt ?? null,
      updatedBy: a.updatedBy ?? null,
      name: byNo.get(a.account)?.us_name ?? null,
      title: byNo.get(a.account)?.us_title ?? null,
    })),
  };
}

// 權限設定
router.get('/permissions', async (req, res) => {
  res.json(await permissionView());
});

router.put('/permissions', async (req, res) => {
  const changes = savePermissions(req.body, req.auth.studentNo);
  if (changes.length) audit(req, 'system', '權限設定變更', { detail: changes.join('；') });
  res.json({
    message: changes.length ? `已儲存 ${changes.length} 項異動` : '設定沒有變更',
    ...(await permissionView()),
  });
});

module.exports = router;
