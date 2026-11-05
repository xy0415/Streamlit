"""Extrema 年度訊號統計：所有成交只讀取訊號後下一列的開盤價。"""
from __future__ import annotations

import io
import re

import numpy as np
import pandas as pd

COLORS = {1: '淺藍', 2: '藍', 3: '金'}


def timestamps(values):
    if pd.api.types.is_datetime64_any_dtype(values.dtype):
        return pd.to_datetime(values, utc=True, errors='raise')
    numeric = pd.to_numeric(values, errors='coerce')
    if numeric.notna().all():
        unit = 'ms' if numeric.abs().median() > 1e11 else 's'
        return pd.to_datetime(numeric, unit=unit, utc=True, errors='raise')
    return pd.to_datetime(values, utc=True, errors='raise')


def validate(df):
    out = df.copy()
    if out.empty:
        raise ValueError('沒有可分析的 K 棒。')
    required = ['time', 'open', 'high', 'low', 'close', 'buy_plot_signal', 'buy_type', 'confirmed']
    missing = set(required) - set(out.columns)
    if missing:
        raise ValueError('缺少欄位：' + ', '.join(sorted(missing)))
    out['time'] = timestamps(out['time'])
    for col in required[1:]:
        out[col] = pd.to_numeric(out[col], errors='raise')
    if out[required].isna().any().any():
        raise ValueError('必要欄位包含空值，請確認匯出範圍及 EX 欄位。')
    if not np.isfinite(out[required[1:]].to_numpy(dtype=float)).all():
        raise ValueError('必要欄位包含非有限數值。')
    if out['time'].duplicated().any():
        raise ValueError('有重複 K 棒時間，請先移除重複資料。')
    if (out[['open', 'high', 'low', 'close']] <= 0).any().any():
        raise ValueError('價格必須大於零。')
    if ((out['high'] < out[['open', 'close', 'low']].max(axis=1)) |
            (out['low'] > out[['open', 'close', 'high']].min(axis=1))).any():
        raise ValueError('OHLC 高低價關係不正確。')
    if not out['buy_type'].isin([0, 1, 2, 3]).all():
        raise ValueError('buy_type 必須為 0、1、2、3。')
    if not out[['buy_plot_signal', 'confirmed']].isin([0, 1]).all().all():
        raise ValueError('訊號及收盤欄位必須為 0 或 1。')
    if ((out['buy_plot_signal'] == 1) & (out['buy_type'] == 0)).any():
        raise ValueError('買點必須有對應的買點顏色代碼。')
    for col in ['sell_signal', 'sell_gold']:
        if col not in out:
            out[col] = np.nan
        else:
            out[col] = pd.to_numeric(out[col], errors='raise')
            if not out[col].dropna().isin([0, 1]).all():
                raise ValueError('賣點欄位必須為 0 或 1。')
    return out.sort_values('time').reset_index(drop=True)


def parse_export(content: bytes):
    df = pd.read_csv(io.BytesIO(content))
    aliases = {'ex buy': 'buy_plot_signal', 'ex type': 'buy_type', 'ex closed': 'confirmed',
               'ex sell': 'sell_signal', 'ex sellgold': 'sell_gold'}
    rename = {}
    for col in df.columns:
        clean = str(col).strip().lower()
        if clean in ['time', 'open', 'high', 'low', 'close', 'volume',
                     'buy_plot_signal', 'buy_type', 'confirmed', 'sell_signal', 'sell_gold']:
            rename[col] = clean
        for alias, target in aliases.items():
            if clean == alias or clean.endswith(': ' + alias) or clean.endswith(' ' + alias):
                rename[col] = target
    df = df.rename(columns=rename)
    if df.columns.duplicated().any():
        raise ValueError('匯出檔有重複欄名，圖表請只保留一份 Extrema 指標。')
    return validate(df)


def file_identity(name):
    match = re.fullmatch(r'(.+)__(\d+(?:m|H|D|W|M))\.csv', name)
    if not match:
        raise ValueError('檔名請使用 標的__週期.csv，例如 AAPL__1D.csv、2330.TW__1W.csv。')
    return match.group(1), match.group(2)


def rsi_wilder(close, length=14):
    """以首 length 個非空漲跌的 SMA 初始化，後續使用 Wilder 平滑。"""
    diff = close.diff().to_numpy()
    result = np.full(len(close), np.nan)
    up = down = None
    for i in range(length, len(close)):
        if i == length:
            up = np.maximum(diff[1:length + 1], 0).mean()
            down = np.maximum(-diff[1:length + 1], 0).mean()
        else:
            up = (up * (length - 1) + max(diff[i], 0)) / length
            down = (down * (length - 1) + max(-diff[i], 0)) / length
        result[i] = 100 if down == 0 and up > 0 else (0 if up == 0 and down > 0 else
                       (np.nan if down == 0 else 100 - 100 / (1 + up / down)))
    return pd.Series(result, index=close.index)


def price_research(df):
    """明確不同於原版：移除 Volume Delta，只用三項價格條件，無金點。"""
    out = df.copy()
    close = out['close']
    lower = close.rolling(20).mean() - 2 * close.rolling(20).std(ddof=0)
    rsi = rsi_wilder(close)
    typical = (out['high'] + out['low'] + close) / 3
    mad = typical.rolling(25).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
    cci = (typical - typical.rolling(25).mean()) / (0.015 * mad.replace(0, np.nan))
    score = ((close < lower).astype(int) + (rsi < 27).astype(int) + (cci <= -200).astype(int))
    out['buy_plot_signal'] = (score >= 2).astype(int)
    out['buy_type'] = np.where(score == 3, 2, np.where(score == 2, 1, 0))
    return validate(out)


def analyze(df, years=10, selected=(1, 2, 3), year_basis='signal', timezone='Asia/Taipei',
            valuation_price=None, as_of=None):
    if not 1 <= years <= 10:
        raise ValueError('統計年數請設定為 1～10 年。')
    if year_basis not in ['signal', 'entry']:
        raise ValueError('年度歸屬必須為 signal 或 entry。')
    data = validate(df)
    reference = pd.Timestamp(as_of) if as_of is not None else data['time'].iloc[-1]
    reference = reference.tz_localize(timezone) if reference.tzinfo is None else reference
    reference = reference.tz_convert(timezone)
    latest = float(valuation_price if valuation_price is not None else data['close'].iloc[-1])
    if latest <= 0 or not np.isfinite(latest):
        raise ValueError('估值價格必須為有限正數。')
    # 先位移再篩訊號，避免錯把下一次訊號當成下一根 K 棒。
    data['entry_time'] = data['time'].shift(-1)
    data['entry_price'] = data['open'].shift(-1)
    mask = data['buy_plot_signal'].eq(1) & data['confirmed'].eq(1) & data['buy_type'].isin(selected)
    ledger = data.loc[mask, ['time', 'entry_time', 'entry_price', 'buy_type']].copy()
    ledger['signal_year'] = ledger['time'].dt.tz_convert(timezone).dt.year
    ledger['entry_year'] = ledger['entry_time'].dt.tz_convert(timezone).dt.year
    ledger['year'] = ledger['signal_year'] if year_basis == 'signal' else ledger['entry_year']
    ledger['color'] = ledger['buy_type'].map(COLORS)
    ledger['status'] = np.where(ledger['entry_price'].notna(), '已成交', '待下一根開盤')
    ledger['return_pct'] = (latest / ledger['entry_price'] - 1) * 100
    rows = []
    bar_year = data['time'].dt.tz_convert(timezone).dt.year
    for year in range(reference.year, reference.year - years, -1):
        group = ledger[ledger['year'] == year]
        prices = group['entry_price'].dropna()
        covered = bool((bar_year == year).any())
        avg = float(prices.mean()) if len(prices) else np.nan
        sell = data[(bar_year == year) & data['confirmed'].eq(1)]
        sells_known = sell[['sell_signal', 'sell_gold']].notna().all().all() and len(sell) > 0
        sells = int((sell['sell_signal'].eq(1) | sell['sell_gold'].eq(1)).sum()) if sells_known else np.nan
        rows.append({'年份': year, '買點次數': len(group) if covered else np.nan,
                     '成交次數': len(prices) if covered else np.nan,
                     '待成交': int(group['entry_price'].isna().sum()) if covered else np.nan,
                     '淺藍': int(group['buy_type'].eq(1).sum()) if covered else np.nan,
                     '藍': int(group['buy_type'].eq(2).sum()) if covered else np.nan,
                     '金': int(group['buy_type'].eq(3).sum()) if covered else np.nan,
                     '買入均價': avg, '至估值日報酬率 %': (latest / avg - 1) * 100 if avg > 0 else np.nan,
                     '賣點根數': sells,
                     '資料範圍': '未涵蓋' if not covered else ('首年可能不完整' if year == bar_year.min() else '有資料')})
    annual = pd.DataFrame(rows)
    ledger = ledger[ledger['year'].ge(reference.year - years + 1) | ledger['year'].isna()]
    return annual, ledger, latest
