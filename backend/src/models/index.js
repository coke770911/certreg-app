'use strict';

/**
 * Sequelize 模型：一對一對應舊系統資料表 (欄位名稱、型別皆沿用，不新增欄位)。
 * 舊資料表沒有 createdAt / updatedAt，建立與修改時間由資料庫預設值 getdate() 填入。
 */

const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/database');
const { DATETIME } = require('./types');

const sequelize = getSequelize();
const legacy = { freezeTableName: true, timestamps: false };
// 每次呼叫回傳新物件：Sequelize 會改寫屬性定義，不可多個模型共用同一物件
const pk = () => ({ type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true });

// 考試場次
const Registration = sequelize.define(
  'Registration',
  {
    rg_id: pk(),
    rg_name: { type: DataTypes.STRING(255), allowNull: false },
    rg_startDate: { type: DATETIME, allowNull: false },
    rg_endDate: { type: DATETIME, allowNull: false },
    rg_memo: { type: DataTypes.STRING(3000), allowNull: false },
    rg_applyEndDate: { type: DATETIME, allowNull: false },
    rg_money: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    rg_creator: { type: DataTypes.STRING(20), allowNull: false },
    rg_creatDate: { type: DATETIME },
    rg_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 40 },
    rg_is_regi: { type: DataTypes.BOOLEAN },
    rg_is_del: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { ...legacy, tableName: 'Registration' }
);

// 證照項目
const License = sequelize.define(
  'License',
  {
    le_id: pk(),
    le_name: { type: DataTypes.STRING(50), allowNull: false },
    le_creatDate: { type: DATETIME },
    le_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    le_group: { type: DataTypes.INTEGER },
    le_is_del: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { ...legacy, tableName: 'License' }
);

// 證照分類
const LicenseGroup = sequelize.define(
  'LicenseGroup',
  {
    lg_id: pk(),
    lg_name: { type: DataTypes.STRING(255), allowNull: false },
    lg_order: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    // 新增欄位 (正式資料庫需手動補上，見 database/pending-production-changes.sql)；分類不刪除，只隱藏
    lg_is_hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { ...legacy, tableName: 'LicenseGroup' }
);

// 考試場次 ↔ 證照項目 關聯
const LinkRgLe = sequelize.define(
  'LinkRgLe',
  {
    lk_id: pk(),
    lk_rg_id: { type: DataTypes.INTEGER, allowNull: false },
    lk_le_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  { ...legacy, tableName: 'LinkRgLe' }
);

// 考試項目價格 (新增資料表，正式資料庫需手動建立，見 database/pending-production-changes.sql)
// 某考試某項目沒有資料時，原價為考試費用 rg_money、沒有優惠方案
const RegPrice = sequelize.define(
  'RegPrice',
  {
    rp_id: pk(),
    rp_rg_id: { type: DataTypes.INTEGER, allowNull: false },
    rp_le_id: { type: DataTypes.INTEGER, allowNull: false },
    rp_name: { type: DataTypes.STRING(50), allowNull: false },
    rp_money: { type: DataTypes.INTEGER, allowNull: false },
    // 1 = 原價 (每個考試項目最多一筆)；0 = 優惠方案
    rp_is_base: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    rp_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { ...legacy, tableName: 'RegPrice' }
);

// 報名紀錄 (報名當下的考試名稱、費用、個人資料皆以快照方式存入)
const Apply = sequelize.define(
  'Apply',
  {
    ap_id: pk(),
    ap_rg_id: { type: DataTypes.INTEGER, allowNull: false },
    ap_rg_name: { type: DataTypes.STRING(255), allowNull: false },
    ap_le_name: { type: DataTypes.STRING(50), allowNull: false },
    // 新增欄位 (正式資料庫需手動補上，見 database/pending-production-changes.sql)：報名的證照項目編號 (License.le_id)
    ap_le_id: { type: DataTypes.INTEGER, allowNull: true },
    // 新增欄位：報名時選擇的優惠方案名稱 (快照)，NULL 表示原價
    ap_discount: { type: DataTypes.STRING(50), allowNull: true },
    ap_rg_money: { type: DataTypes.INTEGER, allowNull: false },
    ap_us_no: { type: DataTypes.STRING(20), allowNull: false },
    ap_us_name: { type: DataTypes.STRING(50), allowNull: false },
    ap_us_ename: { type: DataTypes.STRING(50), allowNull: false },
    ap_us_id: { type: DataTypes.STRING(20), allowNull: false },
    ap_us_sex: { type: DataTypes.STRING(2), allowNull: false },
    ap_us_cdept: { type: DataTypes.STRING(50), allowNull: false },
    ap_us_phone: { type: DataTypes.STRING(30), allowNull: false },
    ap_us_email: { type: DataTypes.STRING(80), allowNull: false },
    ap_us_memo: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    ap_is_regi: { type: DataTypes.BOOLEAN, defaultValue: false },
    ap_is_del: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // 舊系統新增時寫入「未輸入」
    ap_score: { type: DataTypes.STRING(10) },
    // '0' 尚未繳費、'1' 已繳費、'2' 退費、'3' 免繳費
    ap_is_pay: { type: DataTypes.STRING(1), defaultValue: '0' },
    ap_scorePass: { type: DataTypes.BOOLEAN, defaultValue: false },
    ap_createDate: { type: DATETIME },
    ap_modifyDate: { type: DATETIME },
  },
  { ...legacy, tableName: 'Apply' }
);

// 使用者資料 (首次登入時由 v_UserData 複製一份)
const UserData = sequelize.define(
  'UserData',
  {
    us_uid: pk(),
    us_no: { type: DataTypes.STRING(20), allowNull: false },
    us_name: { type: DataTypes.STRING(50), allowNull: false },
    // 'STAFF' 為教職員，可進入管理功能
    us_logid: { type: DataTypes.STRING(10), allowNull: false },
    us_title: { type: DataTypes.STRING(10), allowNull: false },
    us_ename: { type: DataTypes.STRING(50) },
    us_id: { type: DataTypes.STRING(20) },
    us_sex: { type: DataTypes.STRING(2) },
    us_yy: { type: DataTypes.STRING(4) },
    us_mm: { type: DataTypes.STRING(2) },
    us_dd: { type: DataTypes.STRING(2) },
    us_dept: { type: DataTypes.STRING(50) },
    us_grade: { type: DataTypes.TINYINT },
    us_class: { type: DataTypes.STRING(1) },
    us_phone: { type: DataTypes.STRING(30) },
    us_email: { type: DataTypes.STRING(80) },
    us_createDate: { type: DATETIME },
  },
  { ...legacy, tableName: 'UserData' }
);

// 校務系統師生資料檢視表 (唯讀；測試資料庫以同名資料表模擬)
const UserDataSource = sequelize.define(
  'UserDataSource',
  {
    us_no: { type: DataTypes.STRING(120), primaryKey: true },
    us_name: { type: DataTypes.STRING(50) },
    us_logid: { type: DataTypes.STRING(5) },
    us_title: { type: DataTypes.STRING(5) },
    us_ename: { type: DataTypes.STRING(64) },
    us_id: { type: DataTypes.STRING(20) },
    us_sex: { type: DataTypes.STRING(1) },
    us_yy: { type: DataTypes.STRING(3) },
    us_mm: { type: DataTypes.STRING(2) },
    us_dd: { type: DataTypes.STRING(2) },
    us_dept: { type: DataTypes.STRING(60) },
    us_grade: { type: DataTypes.STRING(1) },
    us_class: { type: DataTypes.STRING(1) },
  },
  { ...legacy, tableName: 'v_UserData' }
);

// 關聯 (僅供查詢 JOIN 使用，舊資料表本身無外鍵約束)
const noFk = { constraints: false };
Registration.belongsToMany(License, { through: LinkRgLe, foreignKey: 'lk_rg_id', otherKey: 'lk_le_id', as: 'items', ...noFk });
License.belongsTo(LicenseGroup, { foreignKey: 'le_group', as: 'group', ...noFk });
Registration.hasMany(Apply, { foreignKey: 'ap_rg_id', as: 'applies', ...noFk });
Apply.belongsTo(Registration, { foreignKey: 'ap_rg_id', as: 'registration', ...noFk });

module.exports = { sequelize, Registration, License, LicenseGroup, LinkRgLe, RegPrice, Apply, UserData, UserDataSource };
