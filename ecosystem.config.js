'use strict';

/**
 * PM2 執行設定 (正式機常駐用)
 *
 * 使用前：
 *   1. 安裝 PM2：npm install -g pm2
 *   2. 安裝套件並編譯前端：npm run setup && npm run build
 *   3. 確認 backend/.env 設定完成 (APP_ENV、PORT、資料庫、AD、繳費帳號)
 *
 * 常用指令 (於專案根目錄執行)：
 *   pm2 start ecosystem.config.js     啟動
 *   pm2 restart certreg-app           更新程式後重新啟動 (前端有改要先 npm run build)
 *   pm2 stop certreg-app              停止
 *   pm2 logs certreg-app              查看即時輸出
 *   pm2 save                          儲存目前清單，搭配開機自動啟動
 *
 * 所有設定 (含 APP_ENV、PORT) 一律讀取 backend/.env，這裡不另外指定環境變數，
 * 避免與 .env 不一致。
 */

const fs = require('node:fs');
const path = require('node:path');

// PM2 輸出檔目錄 (已列入 .gitignore)；系統日誌仍由程式寫入 backend/data/logs
const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

module.exports = {
  apps: [
    {
      name: 'certreg-app',
      cwd: path.join(__dirname, 'backend'),
      script: 'src/server.js',

      // 單一程序：系統日誌、權限設定寫入本機檔案，登入失敗次數記在記憶體，
      // 多程序 (cluster) 會造成檔案同時寫入與計數不一致，因此不可增加 instances
      exec_mode: 'fork',
      instances: 1,

      autorestart: true,
      // 啟動後 10 秒內結束視為啟動失敗 (例如 .env 設定錯誤)，連續 10 次即停止重試
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '512M',

      // 不監看檔案變更：正式機更新程式後手動 pm2 restart
      watch: false,

      // 關閉時讓程式寫完日誌再結束 (程式收到 SIGINT / shutdown 訊息會先寫入「伺服器關閉」)
      // Windows 無法傳送 SIGINT，改由 PM2 傳送 'shutdown' 訊息
      kill_timeout: 10000,
      shutdown_with_message: process.platform === 'win32',

      out_file: path.join(LOG_DIR, 'certreg-app.out.log'),
      error_file: path.join(LOG_DIR, 'certreg-app.error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
