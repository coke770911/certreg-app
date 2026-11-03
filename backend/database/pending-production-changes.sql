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
