'use strict';

/**
 * 登入與報名規則測試 (純邏輯，不連線資料庫與 AD 服務)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAuthConfig } = require('../src/config/auth');
const { INVALID_LOGIN, parseLoginName } = require('../src/services/auth-service');
const captcha = require('../src/services/captcha');
const { validateApplyInput } = require('../src/services/application-service');
const limiter = require('../src/middleware/login-limiter');

const SECRET = 'x'.repeat(40);
const authEnv = (overrides = {}) => ({ APP_ENV: 'development', JWT_SECRET: SECRET, ...overrides });

test('登入設定：開發環境預設 dev，正式環境預設 ad 且禁止 dev', () => {
  assert.equal(resolveAuthConfig(authEnv()).provider, 'dev');
  assert.throws(() => resolveAuthConfig(authEnv({ APP_ENV: 'production' })), /AUTH_API_URL/);
  const api = { AUTH_API_URL: 'https://auth.example/api.php', AUTH_API_KEY: 'k' };
  assert.throws(() => resolveAuthConfig(authEnv({ APP_ENV: 'production', AUTH_API_URL: api.AUTH_API_URL })), /AUTH_API_KEY/);
  assert.throws(() => resolveAuthConfig(authEnv({ APP_ENV: 'production', ...api, AUTH_API_URL: 'http://auth.example' })), /https/);
  assert.equal(resolveAuthConfig(authEnv({ APP_ENV: 'production', ...api })).authApiKey, 'k');
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

test('登入帳號解析：一般帳號、代理登入格式、非法格式 (錯誤訊息與密碼錯誤相同)', () => {
  assert.deepEqual(parseLoginName(' D11000001 '), {
    studentNo: 'd11000001',
    account: 'd11000001',
    impersonatedBy: null,
  });
  // 是否有代理登入權限在密碼驗證後才檢查，解析時不透露
  assert.deepEqual(parseLoginName('d11000001/SOMEONE'), {
    studentNo: 'd11000001',
    account: 'someone',
    impersonatedBy: 'someone',
  });
  for (const bad of ['a/b/admin1', '/admin1', 'd11000001/']) {
    assert.throws(() => parseLoginName(bad), (err) => err.status === 401 && err.message === INVALID_LOGIN);
  }
  assert.throws(() => parseLoginName(''), /請輸入學號/);
});

test('登入設定：驗證碼預設開啟，只有非正式環境可關閉', () => {
  assert.equal(resolveAuthConfig(authEnv()).captcha, true);
  assert.equal(resolveAuthConfig(authEnv({ LOGIN_CAPTCHA: 'false' })).captcha, false);
  const prodEnv = { APP_ENV: 'production', AUTH_API_URL: 'https://auth.example', AUTH_API_KEY: 'k', LOGIN_CAPTCHA: 'false' };
  assert.equal(resolveAuthConfig(authEnv(prodEnv)).captcha, true);
});

test('驗證碼：四碼數字、只能驗證一次、過期失效', () => {
  const now = Date.now();
  const a = captcha.createCaptcha(now);
  const code = captcha.peekCaptcha(a.id);
  assert.match(code, /^\d{4}$/);
  assert.match(a.image, /^data:image\/svg\+xml;base64,/);
  // 圖片中不含答案文字
  assert.ok(!Buffer.from(a.image.split(',')[1], 'base64').toString().includes(code));
  assert.equal(captcha.verifyCaptcha(a.id, code, now), true);
  assert.equal(captcha.verifyCaptcha(a.id, code, now), false);

  const b = captcha.createCaptcha(now);
  const wrong = String((Number(captcha.peekCaptcha(b.id)) + 1) % 10000).padStart(4, '0');
  assert.equal(captcha.verifyCaptcha(b.id, wrong, now), false);
  assert.equal(captcha.verifyCaptcha(b.id, captcha.peekCaptcha(b.id), now), false);

  const c = captcha.createCaptcha(now);
  assert.equal(captcha.verifyCaptcha(c.id, captcha.peekCaptcha(c.id), now + captcha.TTL_MS + 1), false);
  assert.equal(captcha.verifyCaptcha(undefined, '1234', now), false);
  assert.equal(captcha.verifyCaptcha({}, '1234', now), false);
});

test('登入失敗次數限制：達上限封鎖，成功後清除', () => {
  const ip = '10.0.0.1';
  for (let i = 0; i < limiter.MAX_FAILURES; i += 1) limiter.recordFailure(ip, 'User');
  assert.equal(limiter.isBlocked(ip, 'user'), true);
  assert.equal(limiter.isBlocked('10.0.0.2', 'user'), false);
  limiter.clearFailures(ip, 'USER');
  assert.equal(limiter.isBlocked(ip, 'user'), false);
});

// 項目的 plans 第一個固定為原價 (見 services/exam-price.js 的 priceOf)
const item = (id, name, price, discounts = []) => ({
  id,
  name,
  price,
  plans: [{ name: '原價', price, discount: false }, ...discounts.map(([n, p]) => ({ name: n, price: p, discount: true }))],
});
const exam = {
  items: [item(1, 'Photoshop', 2300, [['本校生優惠', 1800]]), item(2, 'Illustrator', 2300)],
  requiresRegistration: false,
};
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
  const padded = { ...exam, items: [item(48, 'Photoshop ', 2300)] };
  const data = validateApplyInput({ ...validInput, itemId: 48 }, padded);
  assert.deepEqual([data.itemId, data.item], [48, 'Photoshop']);
});

test('報名表單驗證：收費方案決定應繳金額，原價的方案名稱為 null', () => {
  const base = validateApplyInput(validInput, exam);
  assert.deepEqual([base.price, base.discount], [2300, null]);
  assert.deepEqual([validateApplyInput({ ...validInput, discount: '原價' }, exam).discount], [null]);
  const discounted = validateApplyInput({ ...validInput, discount: ' 本校生優惠 ' }, exam);
  assert.deepEqual([discounted.price, discounted.discount], [1800, '本校生優惠']);
});

test('報名表單驗證：各欄位錯誤時回報對應欄位', () => {
  const cases = [
    [{ itemId: '' }, 'itemId'],
    [{ itemId: 99 }, 'itemId'],
    [{ itemId: 1.5 }, 'itemId'],
    [{ itemId: undefined, item: 'Photoshop' }, 'itemId'],
    [{ discount: '不存在的方案' }, 'discount'],
    [{ itemId: 2, discount: '本校生優惠' }, 'discount'],
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
