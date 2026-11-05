# Extrema Lab｜年度訊號研究

Python + Streamlit 網站。選擇標的、比較多個 K 線週期，查看近 1～10 年買點次數、均價、至估值日報酬及成交明細。深色介面，金色 `RGB(255,224,178)`。

## 執行

建議 Python 3.12。在本專案根目錄執行：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

Windows 啟用環境改用 `.venv\Scripts\activate`。

## 放到 GitHub 並部署

1. 在自己的 GitHub 建立一個 repository，把本目錄內檔案（包含 `.streamlit` 與 `.github`）上傳到倉庫根目錄。不要只上傳 ZIP 本身。
2. 開啟 https://share.streamlit.io/ ，連接自己的 GitHub，選 Create app。
3. 選取 repository、branch（通常是 main），入口檔案填 `app.py`，Python 選 3.12，部署。
4. GitHub 儲存程式；Streamlit 執行 Python 網站。GitHub Pages 只適合靜態網站，不能直接執行此 Python 程式。

不需要 OpenAI API。線上價格可能有來源限制，失敗時會顯示錯誤，不會改用假資料。

## 兩種明確不同的資料模式

### 1. TradingView 原版訊號（預設）

這個模式忠實統計原版已匯出的訊號。Python 不重算買賣條件，因此保留原指標 Volume Delta、顏色開關及各週期的實際訊號。

1. 將 `Extrema_Export.pine` 全文貼到 TradingView Pine 編輯器，儲存並加入圖表。
2. 選定標的及 K 線週期。設定 BUY 及要啟用的顏色。
3. 使用 TradingView 的「匯出圖表資料」並包含指標數值。匯出功能及歷史資料範圍取決於自己的帳號與行情來源。
4. CSV 須含 time/open/high/low/close 與以下指標欄位（名稱大小寫不拘）：

| 欄位 | 意義 |
| --- | --- |
| EX Buy | Pine `buy_plot_signal` 實際繪製的買點圓點：0 或 1 |
| EX Type | 0 無、1 淺藍、2 藍、3 金 |
| EX Closed | 訊號 K 棒是否已收盤：0 或 1 |
| EX Sell | 原版紅色賣點，選填 |
| EX SellGold | 原版金色賣點，選填 |

5. 檔名改成 `標的__週期.csv`，如 `2330.TW__1D.csv`、`AAPL__1W.csv`、`BTC-USD__4H.csv`。週期支援 `15m`、`1H`、`4H`、`1D`、`1W`、`1M` 等命名。分鐘 m、月份 M 大小寫不同。
6. 在網站上傳，可一次上傳多份。若要每次開站都能選取，把檔案放進倉庫 `data/` 目錄。

**每個週期必須分別匯出。不能把日線買點加總冒充週線買點。** 圖表訊號依原指標當時實際能取得的資料而定；CSV 模式無法補回 TradingView 自己沒有的低週期歷史。

CSV 的價格必須使用一致的拆股、股息調整與交易時段。同一標的多份 CSV 預設使用最近一份 K 棒資料的 close 作為共同估值價格；若同時包含日、週、月線，建議一併匯入最新日線。也可以勾選「使用 Yahoo 最近完成日線更新估值價格」，只更新估值，不更動匯入訊號。請確認代號、幣別及價格調整基礎一致。CSV 訊號不會持續更新，匯出之後的新訊號須重新匯入。

原始程式另有一個 `buy_signal` 變數，但實際圓點及統計是以 `buy_plot_signal` 為準。匯出版只接受 Pine `EX Buy` 輸出或明確命名為 `buy_plot_signal` 的欄位；單獨提供 `buy_signal` 會被拒絕，避免把未繪製的原始條件誤當正式買點。程式保留 ta/8 版本，不自行升級。

### 2. 自動抓價・價格條件研究版（需主動勾選接受差異）

可輸入 `2330.TW`、`6488.TWO`、`AAPL`、`SOXL`、`BTC-USD`，支援日、週、月線，以 Yahoo Finance/yfinance 下載資料。

**這不是完整 Extrema，也不能宣稱與原版訊號一致。**

- 僅計算 close < BB(20,2) 下軌、RSI(14) < 27、CCI(25) ≤ -200；符合兩項為淺藍、三項為藍。
- 移除原版第四項 Volume Delta 條件，不產生金點，不重建賣點。
- RSI 使用 Wilder 初始平均及遞迴平滑；CCI 使用 hlc3 與平均絕對偏差；標準差為母體標準差。
- 原版的 Volume Delta 來自更低週期資料，免費日資料無法完整重現其近十年歷史。不能用整根 K 棒漲跌直接取代後再聲稱相同。
- 從全歷史日線重採樣週/月 OHLCV，先計算訊號才篩選顯示年份；不先截成十年才計算。
- `auto_adjust=False`，不使用股息再投入價格。Yahoo 對拆股的處理與 TradingView 的行情設定仍需對齊。
- 排除來源當日資料；尚未結束週/月標成未確認，仍保留已知開盤供前一根訊號成交。最新估值使用最近已完成日資料收盤，非即時報價。
- 來源無資料、上市期間不足、下載失敗時明確顯示，不填補虛構年份。

## 統計口徑

| 項目 | 計算 |
| --- | --- |
| 年份 | 預設 Asia/Taipei 的訊號年，沿用 Pine；可改實際成交年 |
| 次數 | 每根已收盤且顏色符合的買點各計一次，連續買點不合併 |
| 成交價 | 訊號後下一根 K 棒的 open，不一定是隔天 |
| 年度均價 | 所有已成交價的算術平均，等同每次買相同股數 |
| 報酬率 | `(共同估值價格 / 年度均價 - 1) * 100%` |
| 待成交 | 沒有下一根 K 棒，不納入均價與報酬 |
| 缺資料年份 | 空白並標示未涵蓋，不寫成 0 次 |
| 賣點根數 | EX Sell 或 EX SellGold 任一成立，同根只計一次；獨立按訊號年統計 |

例如某年成交價 100、120，均價為 110；估值價 150，報酬約 36.36%。不同年份是獨立的買入批次。

若每次投入相同金額，成本均價需改成 `n / sum(1 / price)`；本版刻意沿用 Pine 的相同股數口徑。

報酬不是當年度漲跌幅，也不是年化報酬。不做 SELL 平倉、不計稅費、匯率及現金股息，屬買點研究，不是完整策略回測。當年度歸屬選成交年，未成交訊號僅保留於明細；年度表次數表示該年已歸屬的成交訊號。

## 驗證

```bash
python -m unittest discover -s tests -v
```

涵蓋下一根開盤、跨年歸屬、未成交、未確認訊號、缺資料年份、顏色篩選、共同估值、CSV 欄位與時間戳、輸入檢查及 Streamlit 互動冒煙測試。GitHub Actions 會執行相同檢查。

`examples/` 完全是合成資料，只有主動勾選「合成示範」才載入，不代表任何標的真實績效。

## 官方參考

- Streamlit 部署：https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy
- yfinance 下載與資料參數：https://ranaroussi.github.io/yfinance/reference/yfinance.price_history.html
- TradingView ta 函式庫與 Volume Delta：https://www.tradingview.com/script/BICzyhq0-ta/
