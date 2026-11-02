'use strict';

const { AppError } = require('../errors');

/** 路徑參數中的編號：必須為正整數 (拒絕 "1abc"、"01" 等寫法) */
function parseId(value, label = '編號') {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0 || String(id) !== String(value)) {
    throw new AppError(400, `${label}格式錯誤`);
  }
  return id;
}

module.exports = { parseId };
