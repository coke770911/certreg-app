-- ==============================================================================
-- 測試資料庫結構 (僅供 development / test 使用，嚴禁於正式資料庫執行)
-- 依 docs/legacy-schema.json 盤點結果，完整複製舊系統資料表的欄位、型別與預設值。
-- v_UserData 在正式環境為跨 Linked Server 的檢視表，測試環境以同名資料表模擬。
-- ==============================================================================

CREATE TABLE [dbo].[Registration] (
  [rg_id]           INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_Registration] PRIMARY KEY,
  [rg_name]         NVARCHAR(255)  NOT NULL,
  [rg_startDate]    DATETIME       NOT NULL,
  [rg_endDate]      DATETIME       NOT NULL,
  [rg_memo]         NVARCHAR(3000) NOT NULL,
  [rg_applyEndDate] DATETIME       NOT NULL,
  [rg_money]        INT            NOT NULL DEFAULT ((0)),
  [rg_creator]      NVARCHAR(20)   NOT NULL,
  [rg_creatDate]    DATETIME       NOT NULL DEFAULT (getdate()),
  [rg_number]       INT            NOT NULL DEFAULT ((40)),
  [rg_is_regi]      BIT            NULL,
  [rg_is_del]       BIT            NOT NULL DEFAULT ((0))
);

CREATE TABLE [dbo].[License] (
  [le_id]        INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_License] PRIMARY KEY,
  [le_name]      NVARCHAR(50) NOT NULL,
  [le_creatDate] DATETIME     NOT NULL DEFAULT (getdate()),
  [le_order]     INT          NOT NULL DEFAULT ((0)),
  [le_group]     INT          NULL,
  [le_is_del]    BIT          NOT NULL DEFAULT ((0))
);

CREATE TABLE [dbo].[LicenseGroup] (
  [lg_id]    INT IDENTITY(1,1) NOT NULL,
  [lg_name]  NVARCHAR(255) NOT NULL,
  [lg_order] TINYINT       NOT NULL DEFAULT ((0)),
  -- 新增欄位 (正式資料庫待補，見 pending-production-changes.sql)：1 = 已隱藏
  [lg_is_hidden] BIT       NOT NULL CONSTRAINT [DF_LicenseGroup_lg_is_hidden] DEFAULT ((0))
);

CREATE TABLE [dbo].[LinkRgLe] (
  [lk_id]    INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_LinkRgLe] PRIMARY KEY,
  [lk_rg_id] INT NOT NULL,
  [lk_le_id] INT NOT NULL
);

CREATE TABLE [dbo].[Apply] (
  [ap_id]         INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_Apply] PRIMARY KEY,
  [ap_rg_id]      INT           NOT NULL,
  [ap_rg_name]    NVARCHAR(255) NOT NULL,
  [ap_le_name]    NVARCHAR(50)  NOT NULL,
  [ap_rg_money]   INT           NOT NULL,
  [ap_us_no]      VARCHAR(20)   NOT NULL,
  [ap_us_name]    NVARCHAR(50)  NOT NULL,
  [ap_us_ename]   VARCHAR(50)   NOT NULL,
  [ap_us_id]      VARCHAR(20)   NOT NULL,
  [ap_us_sex]     NVARCHAR(2)   NOT NULL,
  [ap_us_cdept]   NVARCHAR(50)  NOT NULL,
  [ap_us_phone]   VARCHAR(30)   NOT NULL,
  [ap_us_email]   NVARCHAR(80)  NOT NULL,
  [ap_us_memo]    NVARCHAR(255) NOT NULL,
  [ap_is_regi]    BIT           NULL DEFAULT ((0)),
  [ap_is_del]     BIT           NOT NULL DEFAULT ((0)),
  [ap_score]      NVARCHAR(10)  NULL DEFAULT ((-1)),
  [ap_is_pay]     NCHAR(1)      NULL DEFAULT ((0)),
  [ap_scorePass]  BIT           NULL DEFAULT ((0)),
  [ap_createDate] DATETIME      NULL DEFAULT (getdate()),
  [ap_modifyDate] DATETIME      NULL DEFAULT (getdate()),
  -- 新增欄位 (正式資料庫待補，見 pending-production-changes.sql)：報名的證照項目編號 (License.le_id)
  [ap_le_id]      INT           NULL
);

CREATE TABLE [dbo].[UserData] (
  [us_uid]        INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_UserData] PRIMARY KEY,
  [us_no]         VARCHAR(20)  NOT NULL,
  [us_name]       NVARCHAR(50) NOT NULL,
  [us_logid]      VARCHAR(10)  NOT NULL,
  [us_title]      NVARCHAR(10) NOT NULL,
  [us_ename]      NVARCHAR(50) NULL,
  [us_id]         VARCHAR(20)  NULL,
  [us_sex]        NVARCHAR(2)  NULL,
  [us_yy]         VARCHAR(4)   NULL,
  [us_mm]         VARCHAR(2)   NULL,
  [us_dd]         VARCHAR(2)   NULL,
  [us_dept]       NVARCHAR(50) NULL,
  [us_grade]      TINYINT      NULL,
  [us_class]      NCHAR(1)     NULL,
  [us_phone]      VARCHAR(30)  NULL,
  [us_email]      NVARCHAR(80) NULL,
  [us_createDate] DATETIME     NOT NULL DEFAULT (getdate())
);

CREATE TABLE [dbo].[v_UserData] (
  [us_no]    VARCHAR(120) NULL,
  [us_name]  NVARCHAR(50) NULL,
  [us_logid] VARCHAR(5)   NOT NULL,
  [us_title] NVARCHAR(5)  NULL,
  [us_ename] NVARCHAR(64) NULL,
  [us_id]    VARCHAR(20)  NULL,
  [us_sex]   CHAR(1)      NULL,
  [us_yy]    CHAR(3)      NULL,
  [us_mm]    CHAR(2)      NULL,
  [us_dd]    CHAR(2)      NULL,
  [us_dept]  NVARCHAR(60) NULL,
  [us_grade] CHAR(1)      NULL,
  [us_class] CHAR(1)      NULL
);
