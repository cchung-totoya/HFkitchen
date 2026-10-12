# V1.7 正式 CSV 更新流程

`data/players.csv` 與 `data/questions.csv` 是唯一正式資料來源。管理者編輯專案中的兩個檔案；本機版儲存後重新啟動或整理頁面，GitHub Pages 版則須將 CSV 與新增圖片推送至 GitHub `main`，待 Pages 發布完成後整理頁面。玩家與題庫管理頁只檢視、下載正式 CSV；不會寫回檔案。

1. `data/players.csv` 使用 `PlayerID,Name,Department,Position`。每位玩家編號唯一，不加班別。
2. `data/questions.csv` 保留既有 20 欄標題；每題 `QuestionID` 唯一，`Category` 使用 `配膳`，`Type` 使用 `文字選擇` 或 `圖文選擇`。
3. 圖片另存 `images/questions/`。CSV 的 `Source`、`QuestionImage` 或選項圖片欄填 `questions/檔名.jpg` 等相對路徑；檔名與副檔名須完全一致。不要填電腦絕對路徑。`assets/` 是遊戲介面美術，不放正式考題照片。
4. CSV 請存為 UTF-8。若在 Excel 編輯，選「另存新檔 → CSV UTF-8（逗號分隔）」，不要把 `.xlsx` 直接改副檔名。含逗號、換行或雙引號的儲存格須符合標準 CSV 引號格式。
5. 重新啟動或整理，進入「正式玩家名單」與「正式配膳題庫」核對筆數和內容。更新不需清除快取、localStorage 或重新建立玩家。若 CSV 有誤，畫面會指出原因；修正後按「重新讀取 CSV」。

固定網址 `http://127.0.0.1:8765/` 可讓同一瀏覽器保留既有學習歷程；若通訊埠由另一份專案佔用，先停止該伺服器再啟動本版。已開啟的遊戲不會在檔案儲存瞬間自動改變當前畫面，需重新啟動或整理。進行中遊戲恢復時依新版 CSV 重建抽題清單，既有場次與已完成作答仍保留當時快照。

GitHub Pages 網址為 `https://cchung-totoya.github.io/HFkitchen/#home`。頁面每次啟動都以 `no-store` 重新取得正式 CSV；其他電腦重新開啟頁面後會看到已發布的新玩家與題庫。學習歷程依瀏覽器與網址分別儲存，不會因更新 CSV 而清除，也不會因推送 GitHub 而跨電腦同步。
