'use strict';

/**
 * Express 應用程式主體
 *
 * 單一通訊埠架構：前端 (Vue 3) 一律編譯為靜態檔案輸出至 backend/public，
 * 由本服務同時提供 API (/api/*) 與網站頁面，不另外啟動前端伺服器。
 * 前後端同源，因此不需要 CORS 設定。
 */

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const apiRouter = require('./routes');
const { authenticate } = require('./middleware/auth');
const { logError } = require('./services/audit-log');

const PUBLIC_DIR = path.resolve(__dirname, '../public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');

const app = express();

app.disable('x-powered-by');
// 部署於 IIS / Nginx 等反向代理之後時，需信任代理才能取得正確的來源 IP 與 HTTPS 狀態
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

// API 只接受 JSON，不解析傳統表單，降低跨站表單送出的風險
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// API 路由
app.use('/api', authenticate, apiRouter);

// 未定義的 API 一律回傳 JSON 404，不落入前端頁面
app.use('/api', (req, res) => {
  res.status(404).json({ message: `找不到 API：${req.method} ${req.originalUrl}` });
});

// Vite 編譯產出的 assets 檔名含雜湊值，可長期快取
app.use(
  '/assets',
  express.static(path.join(PUBLIC_DIR, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false })
);

// 其餘靜態檔案 (favicon 等)；index.html 不快取，確保部署後立即取得新版
app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath === INDEX_HTML) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// SPA fallback：Vue Router history 模式的頁面路徑皆回傳 index.html
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!fs.existsSync(INDEX_HTML)) {
    return res
      .status(503)
      .type('text/plain; charset=utf-8')
      .send('前端尚未編譯，請先執行 npm run build');
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(INDEX_HTML);
});

// 統一錯誤處理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(err);
    logError(err, req);
  }
  if (err.name === 'AppError') {
    return res.status(status).json({ message: err.message, field: err.field });
  }
  let message = err.message;
  if (status >= 500) message = '伺服器發生錯誤';
  else if (status === 404) message = '找不到資源'; // 避免靜態檔錯誤訊息洩漏伺服器路徑
  else if (err.type === 'entity.parse.failed') message = '請求格式錯誤';
  res.status(status).json({ message });
});

module.exports = app;
