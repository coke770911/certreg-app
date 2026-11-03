# 證照報名系統 (certreg-app)

將舊有 PHP 證照報名系統（`D:\project\lrs`，CodeIgniter 3）重構為 Node.js + Vue 3 架構。

## 技術架構

| 層級 | 技術 |
| --- | --- |
| 後端 | Node.js、Express 5 |
| ORM | Sequelize 6 + tedious（SQL Server） |
| 前端 | Vue 3、Vite、Tailwind CSS 4、Vue Router |
| 資料庫 | 正式：SQL Server 2014（上線中）／測試：SQL Server |

**單一通訊埠**：前端一律編譯為靜態檔案輸出至 `backend/public`，由後端 Express 同時提供網站與 API，只需開啟 `.env` 的 `PORT`，不另外啟動前端伺服器，也不需要 CORS 設定。

## 目錄結構

```
certreg-app/
├─ package.json            根目錄指令（安裝、編譯、啟動）
├─ frontend/               Vue 3 原始碼（只負責編譯）
│  ├─ vite.config.js       編譯輸出至 ../backend/public
│  └─ src/
│     ├─ views/            頁面（admin/ 為管理端）
│     ├─ router.js         前端路由（history 模式）
│     └─ api.js            API 呼叫（相對路徑 /api）
└─ backend/
   ├─ .env                 環境變數（不提交版控）
   ├─ .env.example         環境變數範本
   ├─ public/              前端編譯產物（自動產生，不提交版控）
   ├─ data/                系統日誌與權限設定（執行時產生，不提交版控）
   ├─ database/            測試資料庫結構 (完整複製舊資料表)
   ├─ docs/                舊系統資料表結構盤點結果 (不提交版控)
   ├─ scripts/             連線驗證、結構盤點、測試資料庫建置等工具腳本
   ├─ test/                自動化測試
   └─ src/
      ├─ server.js         啟動入口
      ├─ app.js            Express 主體（API、靜態檔、SPA fallback）
      ├─ config/database.js  資料庫設定與正式環境鎖定
      ├─ config/auth.js    登入驗證設定
      ├─ config/storage.js 本機資料目錄（DATA_DIR）
      ├─ middleware/       登入狀態、登入失敗次數限制
      ├─ models/           Sequelize 模型（對應舊資料表）
      ├─ services/         商業邏輯與查詢
      └─ routes/           API 路由（掛載於 /api）
```

## 環境需求

- Node.js 18.17 以上（開發環境使用 Node.js 24）
- 可連線的 SQL Server（測試資料庫）

## 快速開始

1. 安裝套件：

   ```bash
   npm run setup
   ```

2. 複製 `backend/.env.example` 為 `backend/.env`，填入資料庫連線資訊與 `JWT_SECRET`。

3. 驗證資料庫連線：

   ```bash
   npm --prefix backend run db:check
   ```

4. 編譯前端並啟動：

   ```bash
   npm run deploy
   ```

   瀏覽 `http://localhost:<PORT>`。

## 常用指令（於專案根目錄執行）

| 指令 | 說明 |
| --- | --- |
| `npm run setup` | 安裝前後端所有套件 |
| `npm run build` | 編譯前端至 `backend/public` |
| `npm start` | 啟動後端（網站 + API） |
| `npm run deploy` | 編譯前端後啟動後端 |
| `npm run dev` | 開發模式：前端變更自動重新編譯、後端變更自動重啟，仍只使用單一 PORT |
| `npm --prefix backend test` | 執行後端測試（含正式環境鎖定測試） |
| `npm --prefix backend run db:check` | 唯讀驗證資料庫連線與帳號權限 |
| `npm --prefix backend run db:setup` | 建立測試資料庫結構與虛構資料（加 `-- --reset` 重建；正式環境拒絕執行） |
| `npm --prefix backend run db:inspect` | 以唯讀方式盤點正式資料庫的資料表結構 |
| `npm --prefix backend run db:migrate-test` | 將 `backend/database/pending-production-changes.sql` 套用到測試資料庫（以 `GO` 分段、可重複執行，含舊資料回填；正式環境拒絕執行）。`db:copy-prod` 之後需再執行一次 |
| `npm --prefix backend run db:copy-prod` | 預覽正式／測試資料庫各表筆數；加 `-- --yes` 會清空測試資料表，改寫入正式資料（正式庫只 SELECT；單一交易、保留原編號、寫入後逐筆比對；不複製 v_UserData）。複製後測試庫含真實個資，請勿外流 |

## 環境變數

所有設定集中於單一檔案 `backend/.env`，以 `APP_ENV` 單一開關切換，詳細說明見檔案內註解。

| 變數 | 說明 |
| --- | --- |
| `APP_ENV` | `development` / `test` / `production`，未設定或不合法時拒絕啟動 |
| `PORT` | 網站與 API 共用的通訊埠 |
| `PROD_DB_*` | 正式資料庫連線（僅 `production` 使用） |
| `TEST_DB_*` | 測試資料庫連線（`development` / `test` 使用） |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | 登入憑證簽章金鑰與有效期限 |
| `DB_ENCRYPT` / `DB_TRUST_SERVER_CERTIFICATE` / `DB_LOGGING` | 資料庫連線進階選項 |
| `AUTH_PROVIDER` | `ad`（學校 AD 驗證）/ `dev`（開發用，任意密碼）；留空時正式環境為 `ad`、其餘為 `dev`，正式環境禁止 `dev` |
| `AD_AUTH_URL` / `AD_AUTH_NAMESPACE` | 學校 AD 驗證服務 (SOAP) 網址與命名空間 |
| `TRUST_PROXY` | 部署於 IIS / Nginx 反向代理之後時設定（例如 `loopback`） |
| `DATA_DIR` | 系統日誌與權限設定的存放目錄，留空為 `backend/data` |
| `PAY_ACCOUNT_NAME` / `PAY_BANK_ACCOUNT` / `PAY_BANK_NAME` / `PAY_BANK_BRANCH` | 繳費單收款戶名、14 碼帳號、銀行與分行（不寫在程式碼中） |

## 登入與報名

- **登入方式**：開發模式（`AUTH_PROVIDER=dev`）下，測試資料庫中的帳號可用任意密碼登入，虛構測試帳號：`d11000001`、`d11000002`、`d11000003`（學生）、`demo_staff`（職員）。正式環境一律呼叫學校 AD 驗證。
- **使用者資料同步**：每次登入都會將 `v_UserData`（校務系統檢視表）差異更新至 `UserData`：
  - `UserData` 沒有此帳號 → 新增；已有 → 只更新有差異的欄位
  - `v_UserData` 的值為 NULL／空白時不覆蓋既有資料；`us_phone`、`us_email` 不在檢視表中，保留原值
  - 超過 `UserData` 欄位長度的值會截斷並記錄警告
  - `v_UserData` 讀取失敗（例如 Linked Server 斷線）時沿用既有 `UserData`，不阻擋登入；兩邊都沒有資料才顯示「找不到您的資料」
  - 同一帳號同時登入以資料列鎖定依序處理，不會重複新增
- **測試資料庫的 v_UserData**：可自行建立為連到校務系統的檢視表（VIEW）；`db:setup -- --reset` 偵測到檢視表時會保留不動，虛構帳號改直接寫入 `UserData`。
- **開發環境以真實帳號測試 AD 登入**：`backend/.env` 設定 `AUTH_PROVIDER=ad` 後執行 `npm start`，以學校帳號密碼登入；失敗時伺服器主控台會顯示 `[auth]` 開頭的原因（不含密碼）。
- **代理登入**：帳號輸入「學號/管理員帳號」並輸入管理員自己的密碼，即可代替學生報名。管理員帳號須在「權限設定」具備「代理學生登入」權限（原 `.env` 的 `ADMIN_ACCOUNTS` 已停用，首次啟動時會自動匯入）；代理登入會寫入系統日誌。
- **登入憑證**：JWT 存於 `httpOnly`、`SameSite=Strict` Cookie，前端程式無法讀取；同一 IP + 帳號 15 分鐘內失敗 10 次即暫時封鎖。
- **報名規則**（與舊系統相同）：報名截止前、未額滿、未重複報名才可報名；費用與考試名稱以報名當下的資料存入。
- **相較舊系統的安全修正**：
  - 學號一律取自登入身分，無法替他人報名
  - 考試項目以證照項目編號（`le_id`）選擇，必須屬於該場考試；已刪除的考試不可報名
  - 報名紀錄寫入項目編號 `ap_le_id`（新增欄位），並同時寫入當下的項目名稱 `ap_le_name` 作為快照（去除舊資料的前後空白，例如「Photoshop 」），供舊紀錄、名單匯出與舊系統顯示
  - 截止／額滿／重複檢查與寫入在同一交易並鎖定考試列，同時送出也不會超額
  - 欄位格式驗證（英文姓名、身分證字號、電話、電子郵件、長度）
  - 報名紀錄的查看、修改、取消、繳費單皆限本人（舊系統取消報名可取消他人報名）
  - 修改與取消在伺服器端檢查報名截止時間（舊系統只隱藏按鈕）；修改時姓名、性別、身分證字號不可變更
- **報名紀錄**：截止前可修改（考試項目、英文姓名、系年班、電話、電子郵件、官網註冊、備註）與取消報名（標記取消，不刪除資料）；尚未繳費者可列印繳費單。
- **繳費單**：版面依舊系統 `V_depositSlip.php` 重現（寬度、框線、虛線、直書備註皆相同；不含舊版表格外框在右側留下的括號狀線條），繳款期限為報名截止日（民國年），金額自動轉中文大寫；直接以瀏覽器列印（A4 直式，左右邊界 8mm 不需縮放）。樣式 class 一律加 `slip-` 前綴，避免與 Tailwind 工具類別衝突。

## 管理端

- **進入方式**：具備管理權限的帳號登入後，頁首會出現「管理」（`/admin`）。權限由「權限設定」頁維護（見下節），每次呼叫管理 API 都會重新檢查，權限移除後立即失效。代理學生登入時不具管理權限。
- **考試**：新增時選擇證照分類與項目（可多選）；建立後名稱與考試項目不可修改（與舊系統相同），其餘欄位與上下架可在考試結束前修改。費用可輸入千分位（如 `1,500`）。
- **證照分類與項目**（分類：新增、修改、隱藏、排序；項目：新增、修改、刪除）：分類清單由資料庫 `LicenseGroup` 讀取，「其他」固定排在最後。舊系統的分類寫死在畫面上，只能新增項目。
  - 分類：名稱不可重複；可上移／下移調整順序（重新編號 `lg_order`）；分類**不可刪除**，不再使用時改為「隱藏」（`lg_is_hidden`），以免舊考試與報名紀錄無法對照分類；隱藏的分類不出現在新增考試、新增或移動證照項目的選單，可隨時取消隱藏，分類內的項目仍可改名。
  - 項目：可修改名稱或移到其他分類，同分類不可重複名稱。刪除只標記 `le_is_del`，已建立的考試與報名紀錄不受影響。
  - 用在尚未結束考試（含下架）的項目，不能改名也不能刪除，避免影響正在報名的考生；移到其他分類不受限制。
  - 所有異動都會寫入系統日誌。
- **繳費處理**：勾選考生後批次設定繳費狀態；「取消報名」會標記取消並將繳費狀態設回未繳費。批次中任一筆不屬於該場考試或已取消，整批不更新。
- **成績處理**：成績最多 10 個字（資料庫欄位 `nvarchar(10)`），可勾選是否合格；頁面可直接列印。
- **名單匯出**：欄位與舊系統相同（日期、場次、考試項目、系別班級、姓名、英文姓名、學號、身分證字號、出生年月日、性別、行動電話、電子郵件、官網註冊、是否繳費、意見、成績、是否合格），出生年月日取自 `UserData`。匯出檔含身分證字號等個資，請妥善保管、勿提交版控。
- **代印繳費單**：管理端可為任何有效報名列印繳費單，不限繳費狀態。

## 系統資訊與權限設定

需要「系統管理」權限，頁面位於 `/admin/system` 與 `/admin/permissions`。正式資料庫禁止建表，因此日誌與權限設定**不存資料庫**，而是存放在伺服器本機的 `DATA_DIR`（預設 `backend/data`）。請定期備份這個目錄。

- **權限**：共三種，可以分別勾選。
  | 權限 | 可使用的功能 |
  | --- | --- |
  | 考試管理 | 考試、證照項目、繳費、成績處理、名單匯出、代印繳費單 |
  | 代理學生登入 | 以「學號/本人帳號」及本人密碼代替學生登入報名 |
  | 系統管理 | 系統資訊、系統日誌、權限設定 |
- **初始狀態**：還沒有指定任何「系統管理」帳號時，沿用舊系統規則：所有 `us_logid = 'STAFF'` 的教職員都有考試管理與系統管理權限，方便第一位承辦人員進入設定。儲存設定時必須保留自己的系統管理權限，以免把自己鎖在外面。儲存後就只看 `permissions.json` 的設定。
- **設定檔損毀**：`permissions.json` 無法解析時，所有管理權限都會暫停，不會退回初始狀態。
- **系統資訊**：顯示運行模式、資料庫連線、運行時間與近 7 天各類紀錄數。
- **系統日誌**：以 JSON Lines 依日期存於 `DATA_DIR/logs/YYYY-MM-DD.jsonl`，保留 365 天，可依日期、類別、層級與關鍵字查詢。
  | 類別 | 記錄內容 |
  | --- | --- |
  | 登入 | 登入、代理登入、登入失敗（原因）、封鎖、登出 |
  | 報名 | 學生報名、修改報名、取消報名 |
  | 管理 | 新增／修改考試、繳費處理（含報名編號）、成績處理、匯出名單、證照分類的新增／修改／隱藏／排序、證照項目的新增／修改／刪除 |
  | 系統 | 權限設定變更（逐項異動）、伺服器啟動／關閉 |
  | 錯誤 | 伺服器 500 錯誤與未攔截的例外，含堆疊（只有系統管理員看得到） |

  日誌不記錄密碼、身分證字號等個資，只記錄帳號、來源 IP、對象與操作摘要。

## 資料庫安全規則（重要）

1. **正式資料庫結構絕不更動**：`APP_ENV=production` 時，系統在 SQL 送出前攔截所有 `sync()`、`drop()`、`CREATE` / `ALTER` / `DROP` / `TRUNCATE` / `sp_rename`，並拋出 `ProductionGuardError`。
2. **僅測試資料庫允許建表**：建表一律透過 `safeSync()`，正式環境會直接拒絕。
3. **防止誤連**：若 `TEST_DB_*` 與 `PROD_DB_*` 指向同一個資料庫，系統拒絕啟動。
4. **帳號權限**：程式層鎖定只能約束本應用程式，正式環境建議改用僅具 `db_datareader`（必要時加 `db_datawriter`）權限的帳號，避免使用 `sa` 或 `db_owner`。
5. **時區**：舊資料表的 `datetime` 欄位為台灣當地時間，系統統一以 `Asia/Taipei` 讀寫。

## 舊系統功能對照

| 功能 | 舊系統位置 | 重構狀態 |
| --- | --- | --- |
| 證照考試列表（開放報名中）、考試詳細資訊 | `Registration/index`、`Apply/applyData` 考試資訊區塊 | ✅ 完成（`GET /api/exams`、`GET /api/exams/:id`） |
| 登入（學校 AD 驗證）／登出、管理員代理登入 | `User/login`、`User/logout` | ✅ 完成（`/api/auth/login`、`logout`、`me`） |
| 線上報名 | `Apply/applyData`、`Apply/addProcess` | ✅ 完成（`GET /api/applications/form/:examId`、`POST /api/applications`） |
| 報名紀錄、修改、取消報名 | `Apply/historyList`、`detailed`、`editProcess`、`cancel` | ✅ 完成（`GET /api/applications/mine`、`GET/PUT /api/applications/:id`、`POST /api/applications/:id/cancel`） |
| 列印繳費單 | `Apply/PrintPay` | ✅ 完成（`GET /api/applications/:id/slip`，頁面 `/my/applications/:id/slip`） |
| 管理：考試列表、考試場次新增／編輯（上下架） | `Manage/index`、`addTheme`、`ThemeProcess`、`detailed` | ✅ 完成（`GET/POST /api/admin/exams`、`GET/PUT /api/admin/exams/:id`，頁面 `/admin`） |
| 管理：證照項目維護 | `Manage/addItem`、`addItemProcess`、`selItem` | ✅ 完成（`GET /api/admin/license-groups`、`POST /api/admin/licenses`） |
| 管理：證照分類修改、隱藏、排序與項目修改、刪除（新增） | —（舊系統寫死在畫面上） | ✅ 完成（`POST /api/admin/license-groups`、`PUT /api/admin/license-groups/:id`、`PUT /api/admin/license-groups/:id/hidden`、`POST /api/admin/license-groups/:id/move`、`PUT/DELETE /api/admin/licenses/:id`） |
| 管理：繳費處理（已繳費／未繳費／免繳費／退費／取消報名） | `Manage/checkPay`、`payProcess` | ✅ 完成（`GET /api/admin/exams/:id/applicants`、`POST /api/admin/exams/:id/payments`） |
| 管理：成績處理 | `Manage/inpScore`、`scoreProcess` | ✅ 完成（`PUT /api/admin/exams/:id/scores`） |
| 管理：報名名單匯出 Excel | `Manage/exportList` | ✅ 完成（`GET /api/admin/exams/:id/export`，改為 .xlsx） |
| 管理：代印繳費單 | `Apply/ManagePrintPay` | ✅ 完成（`GET /api/admin/applications/:id/slip`） |
| 系統資訊、系統日誌（新增） | — | ✅ 完成（`GET /api/system/status`、`GET /api/system/logs`，頁面 `/admin/system`） |
| 管理端權限設定（新增，取代 `ADMIN_ACCOUNTS`） | — | ✅ 完成（`GET/PUT /api/system/permissions`，頁面 `/admin/permissions`） |

## 舊資料表

| 資料表 | 用途 |
| --- | --- |
| `Registration` | 考試場次（名稱、考試時間、報名截止、費用、人數上限） |
| `License` | 證照項目 |
| `LicenseGroup` | 證照分類（新增欄位 `lg_is_hidden`，正式資料庫待補，見下方） |
| `LinkRgLe` | 考試場次與證照項目的關聯 |
| `Apply` | 報名紀錄（繳費、成績、合格狀態；新增欄位 `ap_le_id`，正式資料庫待補） |
| `UserData` | 使用者資料（首次登入時由 `v_UserData` 複製） |
| `v_UserData`（檢視） | 透過 Linked Server 讀取校務系統的師生資料 |

### ⚠ 正式資料庫待補的欄位

新功能需要的欄位已加在測試資料庫，正式資料庫要由資料庫管理者**手動執行** `backend/database/pending-production-changes.sql`（程式禁止對正式庫執行 DDL）。執行前請先備份；SQL 可重複執行。

| 資料表.欄位 | 型別 | 用途 | 正式庫 |
| --- | --- | --- | --- |
| `LicenseGroup.lg_is_hidden` | `BIT NOT NULL DEFAULT 0` | 證照分類隱藏（取代刪除） | ❌ 尚未補上 |
| `Apply.ap_le_id` | `INT NULL` | 報名紀錄的證照項目編號（`License.le_id`）；SQL 會回填舊紀錄：同一場考試中名稱唯一相符者才填入，對應不到的維持 NULL | ❌ 尚未補上 |

尚未補上時，伺服器啟動會顯示「資料庫缺少欄位」警告並寫入系統日誌，「系統資訊」頁也會顯示紅色提醒；此時證照分類（新增考試、證照項目頁）與所有報名相關功能（報名、我的報名、繳費、成績、匯出）都會出錯，**上線前必須先補上**。

完整欄位定義見 `backend/docs/legacy-schema.json`（以 `node backend/scripts/inspect-legacy-schema.js` 唯讀產生）。此檔含內網主機資訊，已列入 `.gitignore`，僅保存在本機。

## 機密資訊與版本控制

以下檔案已列入 `.gitignore`，**不會**上傳至 GitHub：

| 檔案 | 原因 |
| --- | --- |
| `backend/.env`、`.env.*` | 資料庫主機、帳號、密碼、JWT 金鑰（僅保留 `.env.example` 佔位範本） |
| `backend/docs/legacy-schema.json` | 含內網 Linked Server IP、資料庫名稱與資料筆數 |
| `backend/public/` | 前端編譯產物 |
| `backend/data/` | 系統日誌與權限設定（含帳號、來源 IP 與操作紀錄） |
| `*.xls`、`*.xlsx`、`*.csv`、`exports/` | 匯出的報名資料可能含學生個人資料 |
| `*.pem`、`*.key`、`*.pfx` 等 | 憑證與私鑰 |

提交前可執行 `git status --ignored` 確認上述檔案出現在 Ignored 清單中。**請勿在 `.env.example`、程式碼或 README 中填入真實主機、帳號或密碼。**
