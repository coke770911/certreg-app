-- ==============================================================================
-- 正式資料庫待補的結構變更 (由承辦人員於正式資料庫手動執行；程式不會自動執行)
--
-- 測試資料庫：npm run db:migrate-test 會套用本檔 (僅限 development / test)。
-- 正式資料庫：程式禁止任何 DDL，請由資料庫管理者確認後手動執行 (SSMS 可直接執行，以 GO 分段)，
--             執行前請先備份。每段皆可重複執行 (已套用時略過)。
-- 尚未套用時，伺服器啟動會發出警告，「系統資訊」頁也會顯示待補欄位。
-- ==============================================================================

-- 2026-11-02 證照分類改為「隱藏」而非刪除 (刪除後舊考試、報名紀錄無法對照分類)
-- 1 = 已隱藏：不出現在新增考試、新增或移動證照項目的分類選單；既有資料不受影響
IF COL_LENGTH('dbo.LicenseGroup', 'lg_is_hidden') IS NULL
  ALTER TABLE [dbo].[LicenseGroup] ADD [lg_is_hidden] BIT NOT NULL
    CONSTRAINT [DF_LicenseGroup_lg_is_hidden] DEFAULT ((0));
GO

-- 2026-11-03 報名紀錄改以證照項目編號 (License.le_id) 寫入
-- ap_le_name 仍保留報名當下的項目名稱 (快照)，供舊紀錄、名單匯出與舊系統顯示
IF COL_LENGTH('dbo.Apply', 'ap_le_id') IS NULL
  ALTER TABLE [dbo].[Apply] ADD [ap_le_id] INT NULL;
GO

-- 回填舊報名紀錄的項目編號：在同一場考試的項目中，名稱 (忽略前後空白) 唯一相符者才回填；
-- 項目已改名或對應不到的紀錄維持 NULL，仍以 ap_le_name 顯示。可重複執行，只處理尚未回填的紀錄。
UPDATE a SET a.[ap_le_id] = m.[le_id]
FROM [dbo].[Apply] a
JOIN (
  SELECT a2.[ap_id], MIN(l.[le_id]) AS [le_id]
  FROM [dbo].[Apply] a2
  JOIN [dbo].[LinkRgLe] k ON k.[lk_rg_id] = a2.[ap_rg_id]
  JOIN [dbo].[License] l ON l.[le_id] = k.[lk_le_id]
   AND LTRIM(RTRIM(l.[le_name])) = LTRIM(RTRIM(a2.[ap_le_name]))
  WHERE a2.[ap_le_id] IS NULL
  GROUP BY a2.[ap_id]
  HAVING COUNT(DISTINCT l.[le_id]) = 1
) m ON m.[ap_id] = a.[ap_id];
GO

-- 2026-11-03 考試項目價格表：同一場考試的各項目可設定原價，並可有多個優惠方案
-- 學生報名時自選方案，承辦人員核對優惠資格後收費
-- 某考試某項目沒有資料時，原價即為考試費用 (Registration.rg_money)，沒有優惠方案；
-- 由正式資料庫複製過來的舊考試皆為此情形
--   rp_is_base = 1：原價 (每個考試項目最多一筆)；0：優惠方案
--   rp_name：方案名稱 (原價固定為「原價」)，同一考試項目內不可重複
IF OBJECT_ID('dbo.RegPrice', 'U') IS NULL
  CREATE TABLE [dbo].[RegPrice] (
    [rp_id]      INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_RegPrice] PRIMARY KEY,
    [rp_rg_id]   INT           NOT NULL,
    [rp_le_id]   INT           NOT NULL,
    [rp_name]    NVARCHAR(50)  NOT NULL,
    [rp_money]   INT           NOT NULL,
    [rp_is_base] BIT           NOT NULL CONSTRAINT [DF_RegPrice_rp_is_base] DEFAULT ((0)),
    [rp_order]   INT           NOT NULL CONSTRAINT [DF_RegPrice_rp_order] DEFAULT ((0))
  );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RegPrice_rg_le' AND object_id = OBJECT_ID('dbo.RegPrice'))
  CREATE INDEX [IX_RegPrice_rg_le] ON [dbo].[RegPrice] ([rp_rg_id], [rp_le_id]);
GO

-- 報名時選擇的優惠方案名稱 (快照，供承辦人員核對資格)；NULL 表示原價
IF COL_LENGTH('dbo.Apply', 'ap_discount') IS NULL
  ALTER TABLE [dbo].[Apply] ADD [ap_discount] NVARCHAR(50) NULL;
GO
