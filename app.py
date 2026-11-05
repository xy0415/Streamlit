from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from engine import COLORS, analyze, file_identity, parse_export
from providers import yahoo_research

ROOT = Path(__file__).parent
st.set_page_config(page_title='Extrema Lab｜年度訊號研究', page_icon='📊', layout='wide')
st.markdown('''<style>
.block-container{padding-top:2rem;max-width:1450px}
[data-testid="stMetric"]{background:#151e2d;padding:18px;border-radius:12px;border:1px solid #263348}
h1{letter-spacing:-1px} .caption{color:#9caabd}
</style>''', unsafe_allow_html=True)
st.caption('EXTREMA LAB  /  SIGNAL RESEARCH')
st.title('把每年的買點，放在同一張表裡。')
st.write('選擇標的與 K 線週期，比較年度訊號次數、買入均價與持有至估值日的價格報酬。')


@st.cache_data(ttl=1800, show_spinner=False)
def fetch_research(symbol, timeframe):
    return yahoo_research(symbol, timeframe)


with st.sidebar:
    st.subheader('研究設定')
    mode = st.radio('訊號來源', ['TradingView 原版訊號', '自動抓價・價格條件研究版'])
    years = st.slider('近幾年（含估值資料當年）', 1, 10, 10)
    colors = st.multiselect('買點顏色', list(COLORS.values()), default=list(COLORS.values()))
    basis_label = st.selectbox('年度歸屬', ['訊號年份（沿用原指標）', '實際成交年份'])
    basis = 'signal' if basis_label.startswith('訊號') else 'entry'
    st.caption('每次買入相同股數；用下一根 K 棒開盤價成交。週線訊號會在下一週第一根 K 棒開盤成交。')
    if st.button('重新整理線上價格'):
        fetch_research.clear()
    st.divider()
    st.caption('估值為資料內的價格，可能延遲。報酬不含手續費、稅、股息現金與匯率。')

datasets = {}
demo_mode = False
online_quote = None
if mode == 'TradingView 原版訊號':
    st.info('保留原版訊號：每個標的、每個週期各匯出一份 TradingView CSV；可一次上傳多份。')
    uploads = st.file_uploader('上傳行情與 EX 訊號欄位', type=['csv'], accept_multiple_files=True,
                               help='範例檔名：AAPL__1D.csv、AAPL__1W.csv、2330.TW__1D.csv。')
    example = st.checkbox('載入合成示範資料（非真實行情，僅供操作展示）')
    sources = [(p.name, p.read_bytes()) for p in sorted((ROOT / 'data').glob('*.csv'))]
    sources += [(u.name, u.getvalue()) for u in uploads]
    if example:
        sources = [(p.name, p.read_bytes()) for p in sorted((ROOT / 'examples').glob('*.csv'))] + sources
    for name, payload in sources:
        try:
            symbol_key, tf = file_identity(name)
            key = (symbol_key, tf)
            if key in datasets:
                st.warning(f'{name} 覆蓋同標的與週期的舊檔。')
            datasets[key] = parse_export(payload)
        except (ValueError, TypeError, KeyError, OverflowError) as exc:
            st.error(f'{name}：{exc}')
    if not datasets:
        st.subheader('先準備一份原版訊號匯出檔')
        st.write('1. 將專案中的 Extrema_Export.pine 全文貼到 TradingView，加入圖表。')
        st.write('2. 選擇標的、週期，使用「匯出圖表資料」，包含指標數值。')
        st.write('3. 檔名改為「標的__週期.csv」後上傳，例如 AAPL__1D.csv。')
        st.caption('週期用 1D（日）、1W（週）、1M（月）、4H、1H、15m。不可把日線訊號加總當成週線訊號。')
        st.download_button('下載完整 TradingView 匯出版指標',
                           (ROOT / 'Extrema_Export.pine').read_bytes(), 'Extrema_Export.pine')
        with st.expander('統計怎麼算？'):
            st.write('年度均價＝該年度已成交開盤價的算術平均。價格報酬率＝（估值價格 ÷ 年度均價 − 1）× 100%。')
            st.write('尚未出現下一根 K 棒的訊號列為待成交，不納入均價。各年份是獨立買入批次，持有至估值日。')
        st.stop()
    symbols = sorted(set(s for s, _ in datasets))
    symbol = st.selectbox('分析標的', symbols)
    available = [tf for s, tf in datasets if s == symbol]
    periods = st.multiselect('比較 K 線週期', available, default=available)
    demo_mode = symbol.startswith('DEMO')
    selected_data = {tf: datasets[(symbol, tf)] for tf in periods}
    refresh_quote = st.checkbox('使用 Yahoo 最近完成日線更新估值價格', disabled=demo_mode,
                                help='只更新估值價格，不改動匯入訊號。請確認代號、幣別、拆股及股息調整基礎一致。')
    if refresh_quote:
        try:
            with st.spinner('更新估值價格…'):
                _, _, quote_time, quote_price = fetch_research(symbol, '1D')
                online_quote = (quote_time, quote_price)
            st.caption('訊號仍來自原版 CSV；估值改用 Yahoo 最近完成日線。匯出之後的新訊號需更新 CSV 才會納入。')
        except Exception as exc:
            st.error(f'無法更新估值價格：{exc}')
            st.stop()
else:
    st.warning('此模式不是完整 Extrema：僅使用布林下軌、RSI(14)<27、CCI(25)≤−200；移除 Volume Delta，不產生金點，也不重建賣點。結果不能拿來宣稱與 TradingView 原版一致。')
    allow = st.checkbox('我接受使用價格條件研究版；需要原版結果時改用 CSV 匯入')
    c1, c2 = st.columns([2, 3])
    with c1:
        symbol = st.text_input('代號', '2330.TW', help='台股 2330.TW、上櫃 6488.TWO、美股 AAPL、加密 BTC-USD。')
    with c2:
        periods = st.multiselect('比較 K 線週期', ['1D', '1W', '1M'], default=['1D', '1W'])
    if not allow:
        st.stop()
    selected_data = {}
    with st.spinner('取得價格並計算各週期訊號…'):
        for tf in periods:
            try:
                df, normalized, quote_time, quote_price = fetch_research(symbol, tf)
                selected_data[tf] = df
                symbol = normalized
                online_quote = (quote_time, quote_price)
            except Exception as exc:
                st.error(f'{tf} 無法取得資料：{exc}')
    st.caption('線上研究模式保守排除來源當日資料；未結束週/月不產生確認訊號，但保留已知開盤價供上一根訊號成交。估值使用最近已完成日資料。')

if not selected_data:
    st.info('請至少選擇一個有資料的週期。')
    st.stop()
if demo_mode:
    st.warning('目前是合成示範，所有價格與訊號均非市場資料。')
if not colors:
    st.info('請至少選擇一種買點顏色。')
    st.stop()
selected = tuple(k for k, v in COLORS.items() if v in colors)
# 使用同一估值價格比較所有週期；優先採最新日期，日期相同採較多 K 棒的檔案。
quote_tf = max(selected_data, key=lambda t: (selected_data[t]['time'].iloc[-1], len(selected_data[t])))
quote_df = selected_data[quote_tf]
as_of = quote_df['time'].iloc[-1]
quote = float(quote_df['close'].iloc[-1])
if online_quote is not None:
    as_of, quote = online_quote
    quote_tf = '最近完成日線'
st.subheader(f'{symbol}｜年度研究')
m1, m2, m3 = st.columns(3)
m1.metric('估值價格', f'{quote:,.4f}')
m2.metric('比較週期', len(selected_data))
m3.metric('統計年數', f'{years} 年')
st.caption(f'估值來自 {quote_tf} 收盤欄位；K 棒起始時間 {as_of.tz_convert("Asia/Taipei"):%Y-%m-%d %H:%M %Z}。所有週期共用此價格。CSV 不會自動更新，請留意匯出時間。')

annuals, ledgers, combined = {}, {}, []
for tf, df in selected_data.items():
    annual, ledger, _ = analyze(df, years, selected, basis, valuation_price=quote, as_of=as_of)
    annuals[tf], ledgers[tf] = annual, ledger
    combined.append(annual.assign(週期=tf))
all_years = pd.concat(combined, ignore_index=True)
tabs = st.tabs(['年度總覽', '價格與訊號', '成交明細', '口徑與資料'])
with tabs[0]:
    count_tab, return_tab = st.tabs(['買點次數', '年度均價至估值日報酬'])
    with count_tab:
        fig = px.bar(all_years.sort_values('年份'), x='年份', y='買點次數', color='週期', barmode='group',
                     color_discrete_sequence=['#FFE0B2', '#8CD2FF', '#0078FF'])
        fig.update_xaxes(type='category')
        st.plotly_chart(fig, width='stretch')
    with return_tab:
        pivot = all_years.pivot(index='週期', columns='年份', values='至估值日報酬率 %')
        st.plotly_chart(px.imshow(pivot, text_auto='.1f', aspect='auto', color_continuous_scale='RdYlGn',
                                 color_continuous_midpoint=0, labels={'color': '報酬率 %'}), width='stretch')
    st.dataframe(all_years, hide_index=True, width='stretch',
                 column_config={'買入均價': st.column_config.NumberColumn(format='%.4f'),
                                '至估值日報酬率 %': st.column_config.NumberColumn(format='%.2f%%')})
    st.download_button('下載年度統計 CSV', all_years.to_csv(index=False).encode('utf-8-sig'),
                       'extrema_annual.csv', 'text/csv')
with tabs[1]:
    tf = st.selectbox('圖表週期', list(selected_data), key='chart_tf')
    df, entries = selected_data[tf], ledgers[tf]
    start_year = as_of.tz_convert('Asia/Taipei').year - years + 1
    view = df[df['time'].dt.tz_convert('Asia/Taipei').dt.year >= start_year]
    fig = go.Figure(go.Candlestick(x=view['time'], open=view['open'], high=view['high'], low=view['low'],
                                   close=view['close'], name='價格'))
    for code, color in [(1, '#8CD2FF'), (2, '#0078FF'), (3, '#FFE0B2')]:
        marks = entries[(entries['buy_type'] == code) & entries['entry_price'].notna()]
        fig.add_scatter(x=marks['entry_time'], y=marks['entry_price'], mode='markers',
                        marker={'color': color, 'size': 9, 'symbol': 'triangle-up'}, name=COLORS[code] + '成交')
    fig.update_layout(xaxis_rangeslider_visible=False, height=520, margin=dict(t=15, b=20))
    st.plotly_chart(fig, width='stretch')
    st.caption('標記在實際成交 K 棒的開盤位置；訊號出現在前一根 K 棒。')
with tabs[2]:
    tf = st.selectbox('成交明細週期', list(ledgers), key='ledger_tf')
    ledger = ledgers[tf].rename(columns={'time': '訊號時間', 'entry_time': '成交時間', 'entry_price': '成交價',
                                         'color': '買點顏色', 'status': '狀態', 'return_pct': '個別報酬率 %',
                                         'year': '歸屬年份'})
    st.dataframe(ledger, hide_index=True, width='stretch')
    st.download_button('下載成交明細 CSV', ledger.to_csv(index=False).encode('utf-8-sig'),
                       f'extrema_{tf}_entries.csv', 'text/csv')
    st.caption('選「實際成交年份」時，尚未成交訊號的歸屬年份空白，保留在明細；年度表以實際成交批次統計。')
with tabs[3]:
    st.write('年度買入均價＝各筆已成交價格的算術平均，等同每次買入相同股數。')
    st.latex(r'R_y=\left(\frac{P_{asof}}{\frac{1}{n_y}\sum_{i=1}^{n_y}P_{entry,i}}-1\right)\times100\%')
    st.write('這是該年買入批次持有至估值日的價格報酬，不是當年度漲跌幅，也不是年化報酬或完整買賣策略績效。')
    st.write('每根符合條件且已收盤的 K 棒各算一次。原版只以實際繪製的 buy_plot_signal 決定買點，不使用另一個 buy_signal 變數。')
    st.write('賣點根數獨立按訊號年份計算，紅點與金點同根只算一次；買點顏色篩選不影響賣點根數。')
    st.write('近 10 年包含估值資料當年。未涵蓋的年份留空；首年可能不完整。CSV 原版模式只保證忠實統計匯入的訊號，無法補出 TradingView 本身缺失的歷史資料。')
    for tf, df in selected_data.items():
        st.caption(f'{tf}：{df.time.iloc[0]:%Y-%m-%d} ～ {df.time.iloc[-1]:%Y-%m-%d}，共 {len(df):,} 根 K 棒。')
    st.write('不同來源的價格、交易時段、拆股或股息調整、暖機歷史、K 棒年度時區均可能影響結果；比較時需保持一致。')
