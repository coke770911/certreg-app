'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { nextVersion } = require('../../scripts/bump-version');

test('版本號遞增：z 每次 +1，超過 30 進位 y，y 超過 20 進位 x', () => {
  assert.equal(nextVersion('0.1.0'), '0.1.1');
  assert.equal(nextVersion('0.1.29'), '0.1.30');
  assert.equal(nextVersion('0.1.30'), '0.2.0');
  assert.equal(nextVersion('0.19.30'), '0.20.0');
  assert.equal(nextVersion('0.20.29'), '0.20.30');
  assert.equal(nextVersion('0.20.30'), '1.0.0');
  assert.equal(nextVersion('1.20.30'), '2.0.0');
});

test('版本號遞增：格式錯誤時拒絕', () => {
  for (const bad of ['1.0', 'v1.0.0', '1.0.0-beta', '']) {
    assert.throws(() => nextVersion(bad), /版本號格式錯誤/);
  }
});
