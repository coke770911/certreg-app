'use strict';

/**
 * 正式環境鎖定保護測試
 *
 * 全程使用假的環境變數 (指向無法連線的 127.0.0.1:1)，不會讀取 .env 的連線目標，
 * 也不會連上任何真實資料庫；即使防護失效，SQL 也送不出去。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { DataTypes } = require('sequelize');
const {
  ProductionGuardError,
  ReadOnlyGuardError,
  containsDdl,
  isReadOnlySql,
  resolveDbConfig,
  resolveLegacyDbConfig,
  createSequelize,
  createLegacySequelize,
  safeSync,
} = require('../src/config/database');

const fakeEnv = (overrides = {}) => ({
  APP_ENV: 'production',
  PROD_DB_HOST: '127.0.0.1',
  PROD_DB_PORT: '1',
  PROD_DB_NAME: 'guard_prod',
  PROD_DB_USER: 'u',
  PROD_DB_PASSWORD: 'p',
  TEST_DB_HOST: '127.0.0.1',
  TEST_DB_PORT: '1',
  TEST_DB_NAME: 'guard_test',
  TEST_DB_USER: 'u',
  TEST_DB_PASSWORD: 'p',
  LEGACY_DB_HOST: '127.0.0.1',
  LEGACY_DB_PORT: '1',
  LEGACY_DB_NAME: 'guard_legacy',
  LEGACY_DB_USER: 'u',
  LEGACY_DB_PASSWORD: 'p',
  ...overrides,
});

const isGuardError = (err) => err instanceof ProductionGuardError;

test('containsDdl 能辨識 DDL，並忽略字串常值與註解中的關鍵字', () => {
  assert.equal(containsDdl('CREATE TABLE a (id INT)'), true);
  assert.equal(containsDdl('alter table a add b int'), true);
  assert.equal(containsDdl('SELECT 1; DROP TABLE a'), true);
  assert.equal(containsDdl('TRUNCATE TABLE a'), true);
  assert.equal(containsDdl("EXEC sp_rename 'a', 'b'"), true);
  assert.equal(containsDdl("SELECT '--' AS x; DROP TABLE a"), true);
  assert.equal(containsDdl("SELECT * FROM a WHERE note = N'請勿 DROP TABLE'"), false);
  assert.equal(containsDdl('SELECT [Create], [Drop] FROM a -- alter later'), false);
  assert.equal(containsDdl('SELECT CreatedAt FROM a'), false);
});

test('APP_ENV 未設定或不合法時拒絕啟動', () => {
  assert.throws(() => resolveDbConfig(fakeEnv({ APP_ENV: '' })), /APP_ENV/);
  assert.throws(() => resolveDbConfig(fakeEnv({ APP_ENV: 'prod' })), /APP_ENV/);
});

test('測試設定指向正式資料庫時拒絕啟動', () => {
  assert.throws(
    () => resolveDbConfig(fakeEnv({ APP_ENV: 'development', TEST_DB_NAME: 'GUARD_PROD' })),
    /指向同一個資料庫/
  );
});

test('依 APP_ENV 選擇對應的資料庫設定', () => {
  assert.equal(resolveDbConfig(fakeEnv()).database, 'guard_prod');
  assert.equal(resolveDbConfig(fakeEnv({ APP_ENV: 'test' })).database, 'guard_test');
  assert.equal(resolveDbConfig(fakeEnv()).logging, false);
});

test('正式環境：sync / drop / Model.sync / queryInterface DDL / 原生 DDL 全部攔截', async () => {
  const sequelize = createSequelize(fakeEnv());
  const Demo = sequelize.define('GuardDemo', { name: DataTypes.STRING });
  try {
    await assert.rejects(sequelize.sync(), isGuardError);
    await assert.rejects(sequelize.sync({ force: true }), isGuardError);
    await assert.rejects(sequelize.drop(), isGuardError);
    await assert.rejects(Demo.sync(), isGuardError);
    await assert.rejects(Demo.drop(), isGuardError);
    await assert.rejects(
      sequelize.getQueryInterface().createTable('x', { id: DataTypes.INTEGER }),
      isGuardError
    );
    await assert.rejects(
      sequelize.getQueryInterface().addColumn('x', 'y', DataTypes.INTEGER),
      isGuardError
    );
    await assert.rejects(sequelize.query('ALTER TABLE x ADD y INT'), isGuardError);
    await assert.rejects(safeSync(sequelize), isGuardError);
  } finally {
    await sequelize.close();
  }
});

test('正式環境：一般查詢不被攔截 (會因假連線失敗，但不是鎖定錯誤)', async () => {
  const sequelize = createSequelize(fakeEnv());
  try {
    await assert.rejects(sequelize.query('SELECT 1'), (err) => !isGuardError(err));
  } finally {
    await sequelize.close();
  }
});

test('開發/測試環境：不套用鎖定，允許 sync', async () => {
  for (const appEnv of ['development', 'test']) {
    const sequelize = createSequelize(fakeEnv({ APP_ENV: appEnv }));
    try {
      assert.equal(sequelize.lrsConfig.allowSchemaChanges, true);
      // 會因假連線失敗，但不應是鎖定錯誤
      await assert.rejects(safeSync(sequelize), (err) => !isGuardError(err));
    } finally {
      await sequelize.close();
    }
  }
});

test('isReadOnlySql：只允許 SELECT / WITH，字串與識別字中的關鍵字不影響判斷', () => {
  for (const sql of [
    'SELECT 1',
    '  with x as (select 1 a) select * from x',
    "SELECT * FROM t WHERE n = N'DELETE; DROP TABLE x'",
    'SELECT [update], [set] FROM [dbo].[Apply]',
  ]) {
    assert.equal(isReadOnlySql(sql), true, sql);
  }
  for (const sql of [
    'INSERT INTO t VALUES (1)',
    'UPDATE t SET a = 1',
    'DELETE FROM t',
    'SELECT * INTO t2 FROM t',
    'SELECT 1; DELETE FROM t',
    '/* SELECT */ DELETE FROM t',
    'EXEC sp_who',
    'SET IDENTITY_INSERT t ON',
    'MERGE t USING s ON 1 = 1 WHEN MATCHED THEN DELETE;',
    'TRUNCATE TABLE t',
    undefined,
  ]) {
    assert.equal(isReadOnlySql(sql), false, String(sql));
  }
});

test('舊正式資料庫：與同步目標或網站使用的資料庫相同時拒絕', () => {
  assert.equal(resolveLegacyDbConfig(fakeEnv()).database, 'guard_legacy');
  assert.throws(() => resolveLegacyDbConfig(fakeEnv({ LEGACY_DB_NAME: 'GUARD_TEST' })), /TEST_DB_/);
  assert.throws(() => resolveLegacyDbConfig(fakeEnv({ LEGACY_DB_NAME: 'guard_prod' })), /PROD_DB_/);
  // 只同步到測試資料庫時，舊正式與新正式設定相同不影響
  assert.equal(resolveLegacyDbConfig(fakeEnv({ LEGACY_DB_NAME: 'guard_prod' }), ['TEST_DB_']).database, 'guard_prod');
  assert.throws(() => resolveLegacyDbConfig(fakeEnv({ LEGACY_DB_PASSWORD: '' })), /LEGACY_DB_PASSWORD/);

  assert.throws(() => resolveDbConfig(fakeEnv({ LEGACY_DB_NAME: 'guard_prod' })), /LEGACY_DB_/);
  assert.throws(() => resolveDbConfig(fakeEnv({ APP_ENV: 'development', LEGACY_DB_NAME: 'guard_test' })), /LEGACY_DB_/);
  // 未設定舊正式資料庫不影響網站啟動
  assert.equal(resolveDbConfig(fakeEnv({ LEGACY_DB_HOST: '', LEGACY_DB_NAME: '' })).database, 'guard_prod');
});

test('舊正式資料庫：寫入、DDL、交易、sync 全部在送出前攔截', async () => {
  const db = createLegacySequelize(fakeEnv());
  const isReadOnlyError = (err) => err instanceof ReadOnlyGuardError;
  try {
    assert.equal(db.lrsConfig.readOnly, true);
    // 預先指定版本，避免連線時送出含 DECLARE / SET 的版本查詢而被鎖定攔下 (會導致連線卡住)
    assert.notEqual(db.options.databaseVersion, 0);
    for (const sql of ['DELETE FROM Apply', 'UPDATE Apply SET ap_is_del = 1', 'INSERT INTO License (le_name) VALUES (1)', 'DROP TABLE Apply']) {
      await assert.rejects(db.query(sql), isReadOnlyError, sql);
    }
    await assert.rejects(db.transaction(async () => {}), isReadOnlyError);
    await assert.rejects(db.sync(), isReadOnlyError);
    await assert.rejects(db.drop(), isReadOnlyError);
    const Model = db.define('GuardLegacy', { name: DataTypes.STRING });
    await assert.rejects(Model.create({ name: 'x' }), isReadOnlyError);
    // SELECT 不被攔截 (會因假連線失敗，但不是鎖定錯誤)
    await assert.rejects(db.query('SELECT 1'), (err) => !isReadOnlyError(err));
  } finally {
    await db.close();
  }
});
