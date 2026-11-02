'use strict';

/**
 * 可直接回傳給前端的業務錯誤。message 會原樣顯示給使用者，field 標示出錯的表單欄位。
 */
class AppError extends Error {
  constructor(status, message, field) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.field = field;
    this.expose = true;
  }
}

module.exports = { AppError };
