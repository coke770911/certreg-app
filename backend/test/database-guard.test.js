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
  containsDdl,
  resolveDbConfig,
  createSequelize,
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
