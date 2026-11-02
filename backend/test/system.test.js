'use strict';

/**
 * 權限設定與系統日誌測試 (使用暫存資料目錄，不連線資料庫)
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lrs-test-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_ACCOUNTS = '';

const perm = require('../src/services/permission-service');
const log = require('../src/services/audit-log');

const staff = { us_no: 'staff1', us_logid: 'STAFF' };
const student = { us_no: 'd11000001', us_logid: 'STUDENT' };
const permFile = path.join(dataDir, 'permissions.json');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('權限：初始狀態沿用 STAFF 規則，學生與代理登入沒有權限', () => {
  assert.equal(perm.isBootstrap(), true);
  assert.deepEqual(perm.getPermissionsFor(staff), ['manage', 'system']);
  assert.deepEqual(perm.getPermissionsFor(student), []);
  assert.deepEqual(perm.getPermissionsFor(staff, 'admin1'), []);
  assert.deepEqual(perm.listImpersonators(), []);
});

test('權限：儲存時必須保留自己的系統管理權限，且檢查帳號格式', () => {
  const save = (accounts) => () => perm.savePermissions({ accounts }, 'staff1');
  assert.throws(save([{ account: 'other', roles: ['system'] }]), /保留您自己/);
  assert.throws(save([{ account: 'staff1', roles: ['system'] }, { account: 'STAFF1', roles: ['manage'] }]), /重複/);
  assert.throws(save([{ account: 'staff1', roles: ['system'] }, { account: 'a b', roles: ['manage'] }]), /格式錯誤/);
  assert.throws(save([{ account: 'staff1', roles: ['system'] }, { account: 'x1', roles: [] }]), /至少一項/);
  assert.equal(fs.existsSync(permFile), false);
});

test('權限：設定系統管理員後結束初始狀態，其他 STAFF 失去權限', () => {
  const changes = perm.savePermissions(
    {
      accounts: [
        { account: ' Staff1 ', roles: ['system', 'manage', 'bogus'], note: '承辦人' },
        { account: 'admin1', roles: ['impersonate'] },
      ],
    },
    'staff1'
  );
  assert.equal(changes.length, 2);
  assert.equal(perm.isBootstrap(), false);
  assert.deepEqual(perm.getPermissionsFor(staff), ['manage', 'system']);
  assert.deepEqual(perm.getPermissionsFor({ us_no: 'staff2', us_logid: 'STAFF' }), []);
  assert.deepEqual(perm.listImpersonators(), ['admin1']);
  // 沒有變更時不寫檔
  const again = perm.savePermissions(
    { accounts: [{ account: 'staff1', roles: ['manage', 'system'], note: '承辦人' }, { account: 'admin1', roles: ['impersonate'] }] },
    'staff1'
  );
  assert.deepEqual(again, []);
});

test('權限：設定檔損毀時拒絕所有權限，不退回初始狀態', () => {
  fs.writeFileSync(permFile, '{ broken');
  assert.deepEqual(perm.getPermissionsFor(staff), []);
  assert.equal(perm.isBootstrap(), false);
  fs.rmSync(permFile);
});

test('日誌：寫入後可依類別、關鍵字查詢，由新到舊', async () => {
  log.writeLog({ category: 'apply', action: '報名', actor: 'd11000001', target: '#1 MOS' });
  log.writeLog({ category: 'admin', action: '新增考試', actor: 'staff1', target: '#2 TQC' });
  log.logError(new Error('boom'), { method: 'GET', path: '/api/x', originalUrl: '/api/x?a=1', ip: '::1' });
  await log.flushLogs();

  const all = await log.queryLogs();
  assert.equal(all.total, 3);
  assert.equal(all.items[0].category, 'error');
  assert.equal(all.items[0].target, '/api/x');
  assert.match(all.items[0].error.stack, /boom/);

  assert.equal((await log.queryLogs({ category: 'apply' })).total, 1);
  assert.equal((await log.queryLogs({ q: 'tqc' })).items[0].actor, 'staff1');
  assert.equal((await log.queryLogs({ level: 'error' })).total, 1);
  assert.equal((await log.summarizeRecent()).counts.admin, 1);
});

test('日誌：日期格式與區間檢查', async () => {
  await assert.rejects(log.queryLogs({ from: '2026-02-30' }), /日期格式/);
  await assert.rejects(log.queryLogs({ from: '2026-05-02', to: '2026-05-01' }), /不可晚於/);
  await assert.rejects(log.queryLogs({ from: '2025-01-01', to: '2026-01-01' }), /最多/);
});
