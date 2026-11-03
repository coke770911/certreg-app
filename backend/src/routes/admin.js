'use strict';

/**
 * 管理端 API (/api/admin/*)，需具備「考試管理」權限；所有異動皆寫入系統日誌
 */

const express = require('express');
const { requirePermission } = require('../middleware/auth');
const { audit } = require('../services/audit-log');
const { Registration } = require('../models');
const {
  listAllExams,
  getAdminExam,
  createExam,
  updateExam,
  listLicenseGroups,
  createLicenseGroup,
  updateLicenseGroup,
  setLicenseGroupHidden,
  moveLicenseGroup,
  createLicense,
  updateLicense,
  setLicenseHidden,
} = require('../services/admin-exam-service');
const {
  listApplicants,
  updatePayStatus,
  updateScores,
  exportApplicants,
  getAdminDepositSlip,
} = require('../services/admin-application-service');
const { resolvePaymentConfig } = require('../config/payment');
const { parseId } = require('./params');

const router = express.Router();

router.use(requirePermission('manage'));

const examId = (req) => parseId(req.params.id, '考試編號');

/** 日誌用的考試名稱 */
async function examTarget(id) {
  const rg = await Registration.findByPk(id, { attributes: ['rg_name'] });
  return `#${id} ${rg?.rg_name ?? ''}`.trim();
}

// 考試列表 (對應 Manage/index)
router.get('/exams', async (req, res) => {
  res.json(await listAllExams());
});

// 新增考試 (對應 Manage/addTheme + ThemeProcess)
router.post('/exams', async (req, res) => {
  const id = await createExam(req.body, req.auth.studentNo);
  const exam = await getAdminExam(id);
  audit(req, 'admin', '新增考試', {
    target: `#${id} ${exam.name}`,
    detail: `項目 ${exam.items.length} 項，名額 ${exam.capacity}，費用 ${exam.fee}`,
  });
  res.status(201).json({ message: '新增成功!', exam });
});

// 考試詳細 (對應 Manage/detailed)
router.get('/exams/:id', async (req, res) => {
  res.json(await getAdminExam(examId(req)));
});

// 修改考試 (對應 Manage/ThemeProcess 修改模式)
router.put('/exams/:id', async (req, res) => {
  const id = examId(req);
  await updateExam(id, req.body);
  const exam = await getAdminExam(id);
  audit(req, 'admin', '修改考試', {
    target: `#${id} ${exam.name}`,
    detail: `${exam.isPublished ? '上架' : '下架'}，名額 ${exam.capacity}，費用 ${exam.fee}`,
  });
  res.json({ message: '修改成功!', exam });
});

// 考生名單 (繳費處理、成績處理共用；對應 Manage/checkPay、inpScore)
router.get('/exams/:id/applicants', async (req, res) => {
  res.json(await listApplicants(examId(req)));
});

// 批次更新繳費狀態 (對應 Manage/payProcess)
router.post('/exams/:id/payments', async (req, res) => {
  const id = examId(req);
  const { count, label, ids } = await updatePayStatus(id, req.body);
  audit(req, 'admin', `繳費處理：${label}`, {
    target: await examTarget(id),
    detail: `${count} 筆，報名編號 ${ids.slice(0, 50).join(', ')}${ids.length > 50 ? ' …' : ''}`,
  });
  res.json({ message: `已將 ${count} 筆設為「${label}」` });
});

// 批次更新成績 (對應 Manage/scoreProcess)
router.put('/exams/:id/scores', async (req, res) => {
  const id = examId(req);
  const count = await updateScores(id, req.body);
  audit(req, 'admin', '成績處理', { target: await examTarget(id), detail: `更新 ${count} 筆` });
  res.json({ message: `已更新 ${count} 筆成績` });
});

// 名單匯出 Excel (對應 Manage/exportList)
router.get('/exams/:id/export', async (req, res) => {
  const id = examId(req);
  const { buffer, filename } = await exportApplicants(id);
  // 名單含個資，匯出動作留下紀錄
  audit(req, 'admin', '匯出報名名單', { target: await examTarget(id), detail: filename });
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'no-store',
  });
  res.send(Buffer.from(buffer));
});

// 代印繳費單 (對應 Apply/ManagePrintPay)
router.get('/applications/:id/slip', async (req, res) => {
  res.json(await getAdminDepositSlip(parseId(req.params.id, '報名編號'), resolvePaymentConfig()));
});

// 證照分類與項目 (對應 Manage/addItem、selItem)
router.get('/license-groups', async (req, res) => {
  res.json(await listLicenseGroups());
});

// 新增證照分類 (舊系統無此功能，分類寫死在畫面上)
router.post('/license-groups', async (req, res) => {
  const group = await createLicenseGroup(req.body);
  audit(req, 'admin', '新增證照分類', { target: `#${group.id} ${group.name}` });
  res.status(201).json({ message: '新增成功！', group });
});

// 新增證照項目 (對應 Manage/addItemProcess)
router.post('/licenses', async (req, res) => {
  const license = await createLicense(req.body);
  audit(req, 'admin', '新增證照項目', { target: `#${license.id} ${license.name}`, detail: `分類 #${license.groupId}` });
  res.status(201).json({ message: '新增成功！', license });
});

const groupId = (req) => parseId(req.params.id, '分類編號');
const licenseId = (req) => parseId(req.params.id, '證照項目編號');

// 修改證照分類名稱
router.put('/license-groups/:id', async (req, res) => {
  const group = await updateLicenseGroup(groupId(req), req.body);
  if (group.before !== group.name) {
    audit(req, 'admin', '修改證照分類', { target: `#${group.id} ${group.name}`, detail: `原名稱「${group.before}」` });
  }
  res.json({ message: '修改成功！', group: { id: group.id, name: group.name } });
});

// 隱藏／取消隱藏證照分類 (分類不可刪除，避免舊資料無法對照)
router.put('/license-groups/:id/hidden', async (req, res) => {
  const hidden = req.body?.hidden;
  const group = await setLicenseGroupHidden(groupId(req), hidden);
  audit(req, 'admin', hidden ? '隱藏證照分類' : '取消隱藏證照分類', { target: `#${group.id} ${group.name}` });
  res.json({ message: hidden ? `已隱藏分類「${group.name}」` : `已取消隱藏分類「${group.name}」` });
});

// 調整證照分類順序
router.post('/license-groups/:id/move', async (req, res) => {
  const { name } = await moveLicenseGroup(groupId(req), req.body?.direction);
  audit(req, 'admin', '調整證照分類順序', {
    target: `#${groupId(req)} ${name}`,
    detail: req.body.direction === 'up' ? '上移' : '下移',
  });
  res.json({ message: '已調整順序' });
});

// 修改證照項目 (名稱、所屬分類)
router.put('/licenses/:id', async (req, res) => {
  const license = await updateLicense(licenseId(req), req.body);
  const changes = [];
  if (license.before.name !== license.name) changes.push(`原名稱「${license.before.name}」`);
  if (license.before.groupId !== license.groupId) changes.push(`分類 #${license.before.groupId} → #${license.groupId}`);
  if (changes.length) {
    audit(req, 'admin', '修改證照項目', { target: `#${license.id} ${license.name}`, detail: changes.join('，') });
  }
  res.json({ message: '修改成功！', license: { id: license.id, name: license.name, groupId: license.groupId } });
});

// 隱藏／取消隱藏證照項目 (項目不可刪除，避免舊資料無法對照；已建立的考試與報名不受影響)
router.put('/licenses/:id/hidden', async (req, res) => {
  const hidden = req.body?.hidden;
  const license = await setLicenseHidden(licenseId(req), hidden);
  audit(req, 'admin', hidden ? '隱藏證照項目' : '取消隱藏證照項目', {
    target: `#${license.id} ${license.name}`,
    detail: `分類 #${license.groupId}`,
  });
  res.json({ message: hidden ? `已隱藏「${license.name}」` : `已取消隱藏「${license.name}」` });
});

module.exports = router;
