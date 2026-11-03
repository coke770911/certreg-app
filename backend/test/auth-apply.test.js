'use strict';

/**
 * 登入與報名規則測試 (純邏輯，不連線資料庫與 AD 服務)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAuthConfig } = require('../src/config/auth');
const { parseLoginName } = require('../src/services/auth-service');
const { validateApplyInput } = require('../src/services/application-service');
const limiter = require('../src/middleware/login-limiter');

const SECRET = 'x'.repeat(40);
const authEnv = (overrides = {}) => ({ APP_ENV: 'development', JWT_SECRET: SECRET, ...overrides });

test('登入設定：開發環境預設 dev，正式環境預設 ad 且禁止 dev', () => {
  assert.equal(resolveAuthConfig(authEnv()).provider, 'dev');
  assert.throws(() => resolveAuthConfig(authEnv({ APP_ENV: 'production' })), /AD_AUTH_URL/);
  assert.equal(
    resolveAuthConfig(authEnv({ APP_ENV: 'production', AD_AUTH_URL: 'https://ad', AD_AUTH_NAMESPACE: 'ns/' })).adNamespace,
    'ns'
  );
  assert.throws(() => resolveAuthConfig(authEnv({ APP_ENV: 'production', AUTH_PROVIDER: 'dev' })), /禁止/);
  assert.throws(() => resolveAuthConfig(authEnv({ AUTH_PROVIDER: 'ldap' })), /AUTH_PROVIDER/);
});

test('登入設定：JWT_SECRET 未設定、過短或為範本值時拒絕', () => {
  assert.throws(() => resolveAuthConfig(authEnv({ JWT_SECRET: '' })), /JWT_SECRET/);
  assert.throws(() => resolveAuthConfig(authEnv({ JWT_SECRET: 'short' })), /JWT_SECRET/);
  assert.throws(
    () => resolveAuthConfig(authEnv({ JWT_SECRET: 'your_jwt_secret_key_change_me_in_production' })),
    /JWT_SECRET/
  );
});

test('登入帳號解析：一般帳號、管理員代理登入、非法格式', () => {
  const admins = ['admin1'];
  assert.deepEqual(parseLoginName(' D11000001 ', admins), {
    studentNo: 'd11000001',
    account: 'd11000001',
    impersonatedBy: null,
  });
  assert.deepEqual(parseLoginName('d11000001/ADMIN1', admins), {
    studentNo: 'd11000001',
    account: 'admin1',
    impersonatedBy: 'admin1',
  });
  assert.throws(() => parseLoginName('d11000001/someone', admins), /不合法/);
  assert.throws(() => parseLoginName('a/b/admin1', admins), /不合法/);
  assert.throws(() => parseLoginName('/admin1', admins), /不合法/);
  assert.throws(() => parseLoginName('', admins), /請輸入學號/);
});

test('登入失敗次數限制：達上限封鎖，成功後清除', () => {
  const ip = '10.0.0.1';
  for (let i = 0; i < limiter.MAX_FAILURES; i += 1) limiter.recordFailure(ip, 'User');
  assert.equal(limiter.isBlocked(ip, 'user'), true);
  assert.equal(limiter.isBlocked('10.0.0.2', 'user'), false);
  limiter.clearFailures(ip, 'USER');
  assert.equal(limiter.isBlocked(ip, 'user'), false);
});

const exam = { items: [{ id: 1, name: 'Photoshop' }, { id: 2, name: 'Illustrator' }], requiresRegistration: false };
const validInput = {
  itemId: 1,
  name: '王小明',
  englishName: 'wang,siao-ming',
  sex: 'M',
  idNumber: 'a000000002',
  dept: '資管系2A',
  phone: '0910123456',
  email: 'test@example.com',
  memo: '',
  isRegistered: true,
};

test('報名表單驗證：正常資料轉大寫、未要求官網註冊時忽略註冊欄位', () => {
  const data = validateApplyInput(validInput, exam);
  assert.equal(data.englishName, 'WANG,SIAO-MING');
  assert.equal(data.idNumber, 'A000000002');
  assert.equal(data.isRegistered, false);
  assert.equal(validateApplyInput(validInput, { ...exam, requiresRegistration: true }).isRegistered, true);
});

test('報名表單驗證：以項目編號 (le_id) 選擇，名稱快照去除舊資料的前後空白', () => {
  assert.equal(validateApplyInput({ ...validInput, itemId: 2 }, exam).itemId, 2);
  assert.equal(validateApplyInput({ ...validInput, itemId: '2' }, exam).item, 'Illustrator');
  const padded = { ...exam, items: [{ id: 48, name: 'Photoshop ' }] };
  const data = validateApplyInput({ ...validInput, itemId: 48 }, padded);
  assert.deepEqual([data.itemId, data.item], [48, 'Photoshop']);
});

test('報名表單驗證：各欄位錯誤時回報對應欄位', () => {
  const cases = [
    [{ itemId: '' }, 'itemId'],
    [{ itemId: 99 }, 'itemId'],
    [{ itemId: 1.5 }, 'itemId'],
    [{ itemId: undefined, item: 'Photoshop' }, 'itemId'],
    [{ name: ' ' }, 'name'],
    [{ englishName: '王小明' }, 'englishName'],
    [{ sex: 'X' }, 'sex'],
    [{ idNumber: 'A1' }, 'idNumber'],
    [{ dept: '' }, 'dept'],
    [{ phone: '0910-123-456' }, 'phone'],
    [{ email: 'not-an-email' }, 'email'],
    [{ memo: '字'.repeat(121) }, 'memo'],
  ];
  for (const [override, field] of cases) {
    assert.throws(
      () => validateApplyInput({ ...validInput, ...override }, exam),
      (err) => err.status === 400 && err.field === field,
      `欄位 ${field} 應驗證失敗`
    );
  }
});
