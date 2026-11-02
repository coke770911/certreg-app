'use strict';

/**
 * 測試資料庫建置腳本 (僅限 development / test)
 *
 * 用法：
 *   npm run db:setup            資料表不存在時建立結構並寫入假資料
 *   npm run db:setup -- --reset 刪除既有測試資料表後重建 (測試資料會全部清除)
 *
 * APP_ENV=production 時直接拒絕執行。所有資料皆為虛構，不含真實個人資料。
 * 若 v_UserData 已是檢視表 (VIEW，例如連到校務系統)，一律保留不刪除，虛構帳號改直接寫入 UserData。
 */

const fs = require('node:fs');
const path = require('node:path');
const { QueryTypes } = require('sequelize');
const { resolveDbConfig } = require('../src/config/database');

const TABLES = ['Apply', 'LinkRgLe', 'License', 'LicenseGroup', 'Registration', 'UserData', 'v_UserData'];

// 舊系統畫面中寫死的證照分類 (value 即 lg_id)
const LICENSE_GROUPS = [
  [1, 'PMA (Project Management Association)'],
  [2, 'ERP (Enterprise Resource Planning)'],
  [3, 'ACA (Adobe Certified Associate)'],
  [4, 'SSE (Silicon Stone Edcation)'],
  [5, 'IC3 (Internet and Computing Core Certifications)'],
  [6, 'MTA (Microsoft Technology Associate)'],
  [7, 'TQC企業人才技能認證'],
  [8, 'TQC+專業設計人才認證'],
  [9, 'TQC/EEC企業電子化人才能力鑑定'],
  [10, 'ITE資訊專業人員鑑定'],
  [11, '其他'],
  [12, 'ITS 國際認證考試'],
  [13, 'ACP (Adobe Certified Professional)'],
  [14, '物流運籌人才'],
  [15, 'CCS (Critical Career Skills)'],
  [16, 'MCF (Microsoft Certified Fundamentals)'],
];

const LICENSES = [
  ['Word 2019 實用級', 7],
  ['Excel 2019 實用級', 7],
  ['PowerPoint 2019 實用級', 7],
  ['Photoshop', 3],
  ['Illustrator', 3],
  ['IC3 GS6 Level 1', 5],
  ['Azure Fundamentals (AZ-900)', 16],
  ['ITS Python', 12],
];

const daysFromNow = (days, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function main() {
  const config = resolveDbConfig();
  if (config.isProduction) {
    console.error('✖ 拒絕執行：APP_ENV=production，本腳本僅限測試資料庫使用。');
    process.exitCode = 1;
    return;
  }

  const models = require('../src/models');
  const { sequelize } = models;
  const reset = process.argv.includes('--reset');

  try {
    console.log(`目標測試資料庫：${config.host}:${config.port} / ${config.database}`);
    const existing = await sequelize.query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN (:tables)`,
      { type: QueryTypes.SELECT, replacements: { tables: TABLES } }
    );
    // 檢視表 (VIEW) 不是本腳本建立的，不刪除也不重建
    const userSourceIsView = existing.some((t) => t.name === 'v_UserData' && t.type === 'VIEW');
    const tables = existing.filter((t) => t.type === 'BASE TABLE');

    if (tables.length > 0 && !reset) {
      console.log(`測試資料表已存在 (${tables.map((t) => t.name).join(', ')})，略過。如需重建請加上 --reset`);
      return;
    }

    for (const { name } of tables) {
      await sequelize.query(`DROP TABLE [dbo].[${name}]`);
    }

    const schema = fs.readFileSync(path.resolve(__dirname, '../database/test-schema.sql'), 'utf8');
    for (const statement of schema.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter((s) => /CREATE\s+TABLE/i.test(s))) {
      if (userSourceIsView && /\[v_UserData\]/i.test(statement)) continue;
      await sequelize.query(statement);
    }
    console.log(`✔ 資料表結構建立完成${userSourceIsView ? ' (v_UserData 為檢視表，保留不動)' : ''}`);

    await seed(models, userSourceIsView);
    console.log('✔ 假資料寫入完成');
  } catch (err) {
    console.error(`✖ 建置失敗：${err.message}`);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

async function seed({ Registration, License, LicenseGroup, LinkRgLe, Apply, UserData, UserDataSource }, userSourceIsView) {
  // LicenseGroup 無主鍵，lg_id 依序產生即與舊系統編號一致
  for (const [lgId, name] of LICENSE_GROUPS.sort((a, b) => a[0] - b[0])) {
    await LicenseGroup.create({ lg_name: name, lg_order: lgId });
  }

  const licenses = [];
  for (const [name, group] of LICENSES) {
    licenses.push(await License.create({ le_name: name, le_group: group }));
  }

  const exams = [
    { rg_name: 'TQC 辦公軟體認證 (報名中)', start: 30, apply: 14, money: 1500, number: 40, items: [0, 1, 2] },
    { rg_name: 'Adobe ACA 國際認證 (報名中)', start: 21, apply: 7, money: 2200, number: 2, items: [3, 4], regi: true },
    { rg_name: 'ITS Python 國際認證 (已截止)', start: 5, apply: -2, money: 1800, number: 30, items: [7] },
    { rg_name: 'Microsoft Azure 基礎認證 (已結束)', start: -60, apply: -75, money: 2500, number: 30, items: [6] },
  ];

  const created = [];
  for (const e of exams) {
    const rg = await Registration.create({
      rg_name: e.rg_name,
      rg_startDate: daysFromNow(e.start, 9),
      rg_endDate: daysFromNow(e.start, 12),
      rg_applyEndDate: daysFromNow(e.apply, 17),
      rg_memo: '1. 請於考試當日攜帶學生證及身分證件。\n2. 報名後請於期限內完成繳費。\n3. 本資料為測試用虛構資料。',
      rg_money: e.money,
      rg_creator: 'demo_staff',
      rg_number: e.number,
      rg_is_regi: Boolean(e.regi),
    });
    for (const idx of e.items) {
      await LinkRgLe.create({ lk_rg_id: rg.rg_id, lk_le_id: licenses[idx].le_id });
    }
    created.push(rg);
  }

  // 虛構的師生資料：v_UserData 為資料表時寫入其中 (登入時同步至 UserData)；
  // v_UserData 為檢視表時無法寫入，改直接寫入 UserData (登入時檢視表查無此帳號，沿用 UserData)
  const fakeUsers = [
    { us_no: 'demo_staff', us_name: '測試管理員', us_logid: 'STAFF', us_title: '職員', us_ename: 'TEST,STAFF', us_id: 'A000000001', us_sex: 'F' },
    { us_no: 'd11000001', us_name: '王小明', us_logid: 'STD', us_title: '學生', us_ename: 'WANG,SIAO-MING', us_id: 'A000000002', us_sex: 'M', us_yy: '93', us_mm: '05', us_dd: '12', us_dept: '資管系', us_grade: '2', us_class: 'A' },
    { us_no: 'd11000002', us_name: '陳小華', us_logid: 'STD', us_title: '學生', us_ename: 'CHEN,SIAO-HUA', us_id: 'A000000003', us_sex: 'F', us_yy: '94', us_mm: '01', us_dd: '30', us_dept: '多媒系', us_grade: '1', us_class: 'B' },
    { us_no: 'd11000003', us_name: '林小美', us_logid: 'STD', us_title: '學生', us_ename: 'LIN,SIAO-MEI', us_id: 'A000000004', us_sex: 'F', us_yy: '92', us_mm: '11', us_dd: '08', us_dept: '企管系', us_grade: '3', us_class: 'A' },
  ];
  if (userSourceIsView) {
    await UserData.bulkCreate(fakeUsers.map((u) => ({ ...u, us_grade: u.us_grade ? Number(u.us_grade) : null })));
  } else {
    await UserDataSource.bulkCreate(fakeUsers);
  }

  // 讓「Adobe ACA」接近額滿，方便測試人數上限
  await Apply.create({
    ap_rg_id: created[1].rg_id,
    ap_rg_name: created[1].rg_name,
    ap_le_name: licenses[3].le_name,
    ap_rg_money: created[1].rg_money,
    ap_us_no: 'd11000002',
    ap_us_name: '陳小華',
    ap_us_ename: 'CHEN,SIAO-HUA',
    ap_us_id: 'A000000003',
    ap_us_sex: 'F',
    ap_us_cdept: '多媒系1B',
    ap_us_phone: '0900000000',
    ap_us_email: 'test@example.com',
    ap_us_memo: '',
    ap_score: '未輸入',
  });
}

main();
