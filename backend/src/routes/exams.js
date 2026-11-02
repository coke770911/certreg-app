'use strict';

const express = require('express');
const { listOpenExams, getExam } = require('../services/exam-service');

const router = express.Router();

// 開放報名中的考試列表 (對應舊系統 Registration/index)
router.get('/', async (req, res) => {
  res.json(await listOpenExams());
});

// 考試詳細資料 (對應舊系統 Apply/applyData 的考試資訊區塊)
router.get('/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0 || String(id) !== req.params.id) {
    return res.status(400).json({ message: '考試編號格式錯誤' });
  }
  const exam = await getExam(id);
  if (!exam) return res.status(404).json({ message: '找不到此考試' });
  res.json(exam);
});

module.exports = router;
