'use strict';

/**
 * 舊資料庫專用欄位型別
 *
 * Sequelize 的 DataTypes.DATE 在 mssql 會對應 DATETIMEOFFSET，寫入時也會附帶 +08:00 時區字串，
 * 但舊資料表使用的是 datetime (不接受時區)。此型別以「台灣當地時間、無時區」格式讀寫。
 */

const { DataTypes } = require('sequelize');

const pad = (n, len = 2) => String(n).padStart(len, '0');

// DataTypes.ABSTRACT 是 Proxy，直接繼承會在 new 時被換回 ABSTRACT，需繼承其原始類別
const AbstractType = DataTypes.ABSTRACT.prototype.constructor;

class DATETIME extends AbstractType {
  toSql() {
    return 'DATETIME';
  }

  validate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`無效的日期時間：${value}`);
    }
    return true;
  }

  _stringify(value) {
    const d = value instanceof Date ? value : new Date(value);
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
    );
  }
}

DATETIME.prototype.key = DATETIME.key = 'LEGACY_DATETIME';

module.exports = { DATETIME };
