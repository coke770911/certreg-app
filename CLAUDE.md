# 代理規則

- 一律以繁體中文回覆。
- **每次 push 到 GitHub 前，依序做這三件事，再一起提交後 push**：
  1. **更新版本號**：執行 `npm run version:bump`。版本格式 `x.y.z`：`z` 每次 +1；`z` 超過 30 時歸零、`y` +1；`y` 超過 20 時歸零、`x` +1（例：`0.1.30` → `0.2.0`、`0.20.30` → `1.0.0`）。腳本會同步更新三份 `package.json`、`package-lock.json` 與 README 開頭的「目前版本」。
  2. **更新 `README.md`**：讓 README 跟上這次的變更，包括功能對照表、API、設定項目、目錄結構與操作說明。
  3. **檢查機密**（見最後一條），並提醒使用者正式庫還缺的欄位。
  - 一次 push 只遞增一次版本號，即使包含多個提交；提交訊息標題後註明新版本（例：`… (v0.1.1)`）。
- **舊正式資料庫（`LEGACY_DB_*`，舊 PHP 系統上線中的資料庫）不可修改**：不可執行任何寫入（INSERT / UPDATE / DELETE）或 DDL，只能查詢（SELECT），並把資料同步到新正式資料庫（`PROD_DB_*`）或測試資料庫（`TEST_DB_*`）。一律透過 `createLegacySequelize()`（唯讀鎖定）連線，網站程式本身不連舊正式資料庫；同步用 `npm run db:sync-legacy`（一次同步新正式與測試資料庫，並自動回填新欄位）。
- 新正式資料庫（`APP_ENV=production`）嚴禁任何 DDL，也不可執行 `sequelize.sync()`。程式不可自行建表；一般新資料存在本機檔案（`backend/data/`），確實需要新資料表時須經使用者同意，寫進待補 SQL 由使用者手動建立（見下一條）。
- 使用者同意時，測試資料庫可以新增欄位或資料表：寫進 `backend/database/pending-production-changes.sql`（可重複執行）、`test-schema.sql` 與 `src/services/schema-check.js` 的 `REQUIRED_COLUMNS`，由使用者自己到正式庫執行。**每次回報、push 前或談到上線時，都要提醒使用者正式庫還缺哪些欄位**（目前：無。2026-11-23 經使用者同意，已將新正式庫 `CertregApp` 補成與測試庫相同結構；之後新增的欄位、資料表仍須照此流程提醒）。
- 所有設定都放在單一 `.env`，每個項目都要附繁體中文註解。
- **`backend/.env.example` 與 `backend/.env` 的參數要同步**：新增、改名或移除設定時，兩個檔案的參數鍵與註解都要一起更新，缺的補上。**不可洗掉或改動 `.env` 既有的值**，只能補上新的鍵；新增的機密鍵（金鑰、密碼）在 `.env` 留空，由使用者自行填入。`.env.example` 只放空值或範例值。
- 提交前確認沒有機密進入版控：`.env`、`backend/data/`、匯出檔，以及真實帳號、IP、密碼、銀行帳號和學生資料。
