# V1.3 共用題庫與玩家名單設定

GitHub Pages 繼續提供網站及 `images/` 圖片。Supabase 保存管理者發布的玩家名單與題庫，已登入的電腦透過 Realtime 接收變更；連線中斷時每 15 秒重新查詢。答題紀錄、場次與學習統計目前仍保存在各自瀏覽器。

## 初次設定

1. 建立 Supabase 專案，確認院內允許將員工名單與題庫存放於該服務。到 **SQL Editor** 執行 [schema.sql](supabase/schema.sql)。
2. 在 **Authentication** 的一般設定關閉 **Allow new users to sign up**，並保持匿名登入停用。於 **Authentication > Users** 建立或邀請實際使用者；網站本身沒有註冊功能。
3. 複製每個使用者的 UUID。在 SQL Editor 為管理者執行：

   ```sql
   insert into public.kitchen_members (user_id, is_admin)
   values ('管理者的 UUID', true);
   ```

   為一般使用者執行相同語句，將 `true` 改成 `false`。只加入此表的帳號才能讀取共用資料；只有管理者能發布變更。
4. 從 Supabase 專案的 **Connect / API Keys** 取得 `https://...supabase.co` 專案 URL 和 `sb_publishable_` 開頭的 key。將它們填入 `data/cloud-config.js`。**不要填入或上傳 `sb_secret_`、`service_role`、資料庫密碼。** Publishable key 可以隨公開網站發布；存取權由登入與資料庫 RLS 控制。
5. 將整個 `kitchen-monopoly/` 的網站檔案上傳到 GitHub Pages 發布來源的根目錄，包含 `cloud-sync.js`、`data/cloud-config.js`、`vendor/supabase-js-2.57.0.min.js`、`images/questions/`、`CHANGELOG.md` 及 `AGENTS.md`。等待 Pages 更新後開啟網站。

## 使用與驗證

1. 管理者登入，在「玩家管理」匯入 CSV、在「題庫管理」匯入 CSV／Excel。匯入成功訊息會顯示「已發布並同步」。每次匯入依編號新增或更新，未列於檔案的舊題與玩家仍保留；如需刪除，使用管理者介面。
2. 在另一個瀏覽器或電腦，以已授權的一般使用者帳號登入。管理者發布後，列表會透過 Realtime 更新；網路暫斷時恢復連線後會再次查詢。若兩位管理者同時改動，較晚提交的一方會收到版本衝突提示，重新載入並檢查資料後再匯入。
3. 檢查一個圖文題的圖片能否顯示。Excel 的 `Source` 或 `QuestionImage` 填 `questions/檔名.jpg`；圖片檔仍須另外放在 GitHub Pages 的 `images/questions/`，且檔名完全一致。檔名中的 `%` 在 V1.3 可匯入，瀏覽器會正確編碼路徑。
4. 正在進行的遊戲保留開始時的題庫快照。共用題庫更新會立即顯示在管理列表；新遊戲才使用新題。舊瀏覽器本機資料在首次載入共用題庫前另存到 `kitchen-monopoly-v1-pre-cloud`，原有場次和答題紀錄繼續使用原 localStorage key；正式切換前仍建議下載完整 JSON 備份。

若 `cloud-config.js` 留白，程式會顯示醒目的「本機模式」提示，供離線演示。填入設定後若登入或資料庫無法連線，程式會停止進入遊戲，避免把本機修改誤當成已同步。

Supabase 官方說明：[Publishable key 與 secret key](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)、[關閉新帳號註冊](https://supabase.com/docs/guides/auth/general-configuration)。
