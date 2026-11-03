# 代理規則

- 一律以繁體中文回覆。
- **每次 push 到 GitHub 前，依序做這三件事，再一起提交後 push**：
  1. **更新版本號**：執行 `npm run version:bump`。版本格式 `x.y.z`：`z` 每次 +1；`z` 超過 30 時歸零、`y` +1；`y` 超過 20 時歸零、`x` +1（例：`0.1.30` → `0.2.0`、`0.20.30` → `1.0.0`）。腳本會同步更新三份 `package.json`、`package-lock.json` 與 README 開頭的「目前版本」。
  2. **更新 `README.md`**：讓 README 跟上這次的變更，包括功能對照表、API、設定項目、目錄結構與操作說明。
  3. **檢查機密**（見最後一條），並提醒使用者正式庫還缺的欄位。
  - 一次 push 只遞增一次版本號，即使包含多個提交；提交訊息標題後註明新版本（例：`… (v0.1.1)`）。
- 正式資料庫（`APP_ENV=production`）嚴禁任何 DDL，也不可執行 `sequelize.sync()`。新的資料要存在本機檔案（`backend/data/`），不建資料表。
- 使用者同意時，測試資料庫可以新增欄位：寫進 `backend/database/pending-production-changes.sql`（可重複執行）、`test-schema.sql` 與 `src/services/schema-check.js` 的 `REQUIRED_COLUMNS`，由使用者自己到正式庫執行。**每次回報、push 前或談到上線時，都要提醒使用者正式庫還缺哪些欄位**（目前：`LicenseGroup.lg_is_hidden`、`Apply.ap_le_id`）。
- 所有設定都放在單一 `.env`，每個項目都要附繁體中文註解；新增設定時同步更新 `backend/.env.example`。
- 提交前確認沒有機密進入版控：`.env`、`backend/data/`、匯出檔，以及真實帳號、IP、密碼、銀行帳號和學生資料。
