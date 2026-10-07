# 營養科廚房大挑戰 V1.4

20 格配膳教育大富翁，支援 2–4 人及單人對電腦、文字與圖文選擇題、30 秒圖片題、作答紀錄及四張工作表的 Excel 成果匯出。介面為繁體中文及投影用大字版。

## 啟動

- **Windows 下載版：**解壓縮後雙擊 `kitchen-monopoly/start.cmd`。它會從同一資料夾啟動僅供本機使用的網站，並在瀏覽器開啟 `http://127.0.0.1:8765/`。使用期間保留命令視窗；按 Ctrl+C 停止。固定網址讓同一台電腦下次啟動仍能讀取原有學習紀錄。
- **GitHub Pages：**將專案根目錄的檔案發布在同一網站路徑，直接以 HTTPS 開啟。每次重新開啟或重新整理時讀取該次已發布的 CSV。
- 不要直接雙擊 `index.html` 以 `file://` 開啟。瀏覽器不允許這種頁面穩定讀取旁邊的 CSV；畫面會顯示啟動指引，而不會使用舊題庫代替。

## 唯一正式資料來源

遊戲每次啟動會以不使用快取的請求，重新讀取 `data/players.csv` 與 `data/questions.csv`。這兩個檔案是唯一正式玩家與題庫來源；遊戲畫面只供檢視，沒有會改變正式資料的匯入、增刪或編輯操作。本次保留 GitHub 主分支既有的兩份 CSV 資料列，未擅自刪改管理者資料；題目與玩家內容請由管理者核定。

1. 管理者以 UTF-8 CSV 編輯 `data/players.csv`，欄位為 `PlayerID,Name,Department,Position`。不要加入班別。
2. 編輯 `data/questions.csv`。保留原有 20 個欄位；必填欄位為 `QuestionID,Category,Type,Question,OptionA,OptionB,OptionC,OptionD,Answer,Explanation,Score`，其中選項文字可按題型留白，但至少需要兩個文字或圖片選項。第一版 `Category` 為 `配膳`，`Type` 為 `文字選擇` 或 `圖文選擇`。
3. 圖文題的 `Source`、`QuestionImage` 或 `OptionImageA`–`OptionImageD` 填入 `questions/檔名.jpg` 等相對路徑；實際圖片放在 `images/questions/`，檔名與副檔名須一致。CSV 不會自動包含圖片檔。
4. 將更新的 CSV 和圖片一併 Push 至 GitHub。其他電腦下載最新版或執行 `git pull`，下次啟動即使用新檔。GitHub Pages 須等待新版本部署完成，再重新開啟或整理網頁。

詳細操作及更新驗證見 [DATA-UPDATE.md](DATA-UPDATE.md)。若 CSV 缺檔、欄位錯誤或資料無效，遊戲會停止並指出原因，不會載入舊 localStorage 或示範資料。

## 學習歷程與匯出

`localStorage` 僅保存此瀏覽器的答題紀錄、遊戲場次及進行中遊戲狀態。舊版留下的正式玩家與整份題庫會在首次啟動時從儲存內容剔除；舊作答與場次保留。進行中遊戲重新開啟時，其抽題清單及待答題目均從本次 CSV 重建，儲存內容只保留待答題目的編號。歷史答題內容及場次中的玩家資訊屬當時的學習紀錄，不會被新版 CSV 覆蓋。

「學習成效」可匯出玩家總表、答題明細、題目分析、遊戲場次四張 Excel 工作表，也可匯出答題明細 CSV 或僅含學習紀錄的 JSON 備份。清除遊戲紀錄不會修改兩份正式 CSV。金幣欄位若未來加入，亦應只作為遊戲紀錄保存。

## 版本與既有檔案

V1.3 曾提出 Supabase 共用資料庫方案；V1.4 依本次需求改以 CSV 為唯一正式來源。`index.html` 不再載入 Supabase 或 sample-data.js。先前的 Supabase 檔案暫留專案，但不參與 V1.4 執行；[SETUP-SYNC.md](SETUP-SYNC.md) 為 V1.3 歷史說明，不適用於本版。變更詳見 [CHANGELOG.md](CHANGELOG.md)，測試見 [TEST-REPORT.md](TEST-REPORT.md)。

此 GitHub 儲存庫目前是公開儲存庫；發布正式員工名單與圖片前，請先確認院內允許公開這些內容。
