'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePort } = require('../src/config/port');

test('PORT：.env 優先於外部環境變數', () => {
  assert.deepEqual(resolvePort({ PORT: '8100' }, { PORT: '3000' }), { port: 8100, source: '.env', ignored: '3000' });
  assert.deepEqual(resolvePort({ PORT: '8100' }, { PORT: '8100' }), { port: 8100, source: '.env', ignored: null });
  assert.deepEqual(resolvePort({}, { PORT: '3000' }), { port: 3000, source: '環境變數', ignored: null });
});

test('PORT：未設定或格式錯誤時拒絕啟動', () => {
  assert.throws(() => resolvePort({}, {}), /未設定 PORT/);
  for (const bad of ['abc', '0', '70000', '80.5', '-1']) {
    assert.throws(() => resolvePort({ PORT: bad }, {}), /PORT 格式錯誤/);
  }
});
