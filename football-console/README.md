# 足球分析控制台｜免費自動同步

網站：https://football-fixture-console.onrender.com

## 已部署功能
- 首頁：台灣日期、免費公開 ESPN 賽程、正式預測、賽後核對、歷史統計
- /index.html：保留原本賽程資料驗證控制台
- 歷史預測來源：本人正式已寄 Gmail 全文，不使用模擬資料
- 來源失敗記錄；沒有取得資料不等於沒有比賽
- 真正可核實的 90 分鐘終場結果才計入正式命中率

## 一次性 Google Apps Script 授權

Google Drive ChatGPT 連線不會替你授權外部 Apps Script。必須由 Google 帳號持有人在 Google 的授權頁面完成。

1. 使用足球排程所屬 Gmail 登入 https://script.google.com/home/projects/create
2. 將 google-apps-script/Code.gs 的完整內容貼到預設 Code.gs，儲存。
3. 從上方函式選單選擇 setup，按「執行」。
4. 依 Google 畫面核准授權：讀取 Gmail 已寄件、建立和更新 Google 試算表、網路請求及排程觸發器。
5. setup 會建立 Google 試算表並同步近 45 天正式預測（最多 80 個搜尋對話）。可在執行紀錄取得試算表連結。
6. 「部署」→「新增部署」→ 類型「網頁應用程式」，執行身分「我」，存取權「任何人」，完成部署。
7. 複製網址 https://script.google.com/macros/s/.../exec，貼回 ChatGPT。我會替網站設定 Render 的 FOOTBALL_REPORT_FEED_URL，無須交出密碼或 API 金鑰。
8. 部署後可開啟網站 /api/reports 檢視同步狀態，回傳 connected:true 才代表完成串接。

## 隱私與權限
- 公開資料：只有既有正式寄出的足球預測、比賽識別資料、比分與結算參考。部署成「任何人」代表任何人都可讀取公開摘要。
- 腳本不讀取「足球預測復盤紀錄｜YYYY-MM」私人草稿，也不輸出 Gmail 郵件 ID、Email 地址、登入權杖。
- 腳本只對自己的試算表寫入，不會修改、發送或刪除 Gmail 信件。
- Google Apps Script 使用 GmailApp，Google 可能要求較廣 Gmail 權限；程式僅呼叫搜尋和讀取方法。請核對程式與授權提示。
- Google Sheets 不須公開分享；網站只讀取 Apps Script doGet 整理後的 JSON。
- 沒有可由匿名訪客寫入試算表的接口，不含 doPost。

## 排程頻率
- 每 3 小時同步已正式寄出的預測，保留原始選項、機率、分析日。
- 每 6 小時用 ESPN 公開介面核對比分；單一來源只標記「參考結算」，不計入已核實命中率。
- 不覆寫已有手動核實 verified=true 的紀錄，亦不把賽後結果回寫為賽前預測。

## 免費服務限制
- Render 免費服務可能休眠；Google Apps Script、Gmail、Sheets 有配額。
- ESPN 公開端點無可用性保證，可能變更；網站會保留失敗和缺漏。
- 免費來源不保證支援全部聯賽、即時先發、xG、盤口。
- 避免把 OAuth 密碼、Token、Webhook 憑證寫入 GitHub。
- 舊版歷史可能同一賽事有保守／激進兩個方向，保留原始紀錄，不併為同一個單關。

## 主要檔案
- public/analysis.html：網站首頁
- public/analysis.js：每日賽程與預測畫面
- public/data/predictions.json：正式歷史預測快照
- google-apps-script/Code.gs：免費同步程式
- server.js：免費賽程與同步代理

原有 ChatGPT → Gmail → Make → Discord 與 Make 場景 6659029 不修改。
