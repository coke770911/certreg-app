'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { audit } = require('../services/audit-log');
const { getApplyForm, submitApplication } = require('../services/application-service');
const {
  listMyApplications,
  getMyApplication,
  updateMyApplication,
  cancelMyApplication,
  getDepositSlip,
} = require('../services/my-application-service');
const { resolvePaymentConfig } = require('../config/payment');
const { parseId } = require('./params');

const router = express.Router();

router.use(requireAuth);

// 報名表單資料 (對應舊系統 Apply/applyData)
router.get('/form/:examId', async (req, res) => {
  res.json(await getApplyForm(parseId(req.params.examId, '考試編號'), req.auth.studentNo));
});

// 送出報名 (對應舊系統 Apply/addProcess)
router.post('/', async (req, res) => {
  const examId = parseId(req.body?.examId, '考試編號');
  const application = await submitApplication(examId, req.auth.studentNo, req.body);
  audit(req, 'apply', '報名', {
    target: `#${application.examId} ${application.examName}`,
    detail: `報名編號 ${application.id}，項目 ${application.item}，費用 ${application.fee}`,
  });
  res.status(201).json({ message: '報名成功!', application });
});

// 我的報名紀錄 (對應舊系統 Apply/historyList)
router.get('/mine', async (req, res) => {
  res.json(await listMyApplications(req.auth.studentNo));
});

// 報名詳細 (對應舊系統 Apply/detailed)
router.get('/:id', async (req, res) => {
  res.json(await getMyApplication(parseId(req.params.id, '報名編號'), req.auth.studentNo));
});

// 修改報名 (對應舊系統 Apply/editProcess)
router.put('/:id', async (req, res) => {
  const application = await updateMyApplication(parseId(req.params.id, '報名編號'), req.auth.studentNo, req.body);
  audit(req, 'apply', '修改報名', {
    target: `#${application.examId} ${application.examName}`,
    detail: `報名編號 ${application.id}，項目 ${application.item}`,
  });
  res.json({ message: '修改成功!', application });
});

// 取消報名 (對應舊系統 Apply/cancel)
router.post('/:id/cancel', async (req, res) => {
  const ap = await cancelMyApplication(parseId(req.params.id, '報名編號'), req.auth.studentNo);
  audit(req, 'apply', '取消報名', { target: `#${ap.examId} ${ap.examName}`, detail: `報名編號 ${ap.id}，項目 ${ap.item}` });
  res.json({ message: '取消報名成功!' });
});

// 繳費單資料 (對應舊系統 Apply/PrintPay)
router.get('/:id/slip', async (req, res) => {
  const id = parseId(req.params.id, '報名編號');
  res.json(await getDepositSlip(id, req.auth.studentNo, resolvePaymentConfig()));
});

module.exports = router;
