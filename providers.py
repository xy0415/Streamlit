from __future__ import annotations

import pandas as pd

from engine import price_research


def normalize_symbol(symbol):
    symbol = symbol.strip().upper()
    if not symbol or len(symbol) > 45 or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.^=-_' for c in symbol):
        raise ValueError('請輸入有效代號，例如 2330.TW、AAPL、BTC-USD。')
    return symbol + '.TW' if symbol.isdigit() else symbol


def yahoo_research(symbol, timeframe, now=None):
    """下載完整日資料；保留未完成週/月的已知開盤價，但不確認其訊號。"""
    import yfinance as yf

    symbol = normalize_symbol(symbol)
    ticker = yf.Ticker(symbol)
    raw = ticker.history(period='max', interval='1d', auto_adjust=False, actions=False, timeout=20)
    if raw.empty:
        raise ValueError('資料來源未回傳價格。請檢查代號，或稍後重試。')
    local_tz = str(raw.index.tz or 'UTC')
    today = pd.Timestamp(now or pd.Timestamp.now(tz=local_tz))
    today = today.tz_localize(local_tz) if today.tzinfo is None else today.tz_convert(local_tz)
    df = raw.rename(columns=str.lower)[['open', 'high', 'low', 'close', 'volume']].dropna()
    # 保守排除來源當日，最新估值為已下載的最近完成交易日收盤。
    df = df[df.index.date < today.date()]
    if df.empty:
        raise ValueError('尚無已完成交易日資料。')
    quote_time, quote_price = df.index[-1], float(df['close'].iloc[-1])
    local_index = df.index.tz_localize(None) if df.index.tz else df.index
    periods = local_index.to_period('W-SUN' if timeframe == '1W' else 'M')
    if timeframe in ['1W', '1M']:
        df = df.assign(_period=periods)
        current_period = today.tz_localize(None).to_period('W-SUN' if timeframe == '1W' else 'M')
        df = df.groupby('_period', sort=True).agg(
            time=('open', lambda x: x.index[0]), open=('open', 'first'), high=('high', 'max'),
            low=('low', 'min'), close=('close', 'last'), volume=('volume', 'sum'))
        df['confirmed'] = (df.index < current_period).astype(int)
        df = df.reset_index(drop=True)
    elif timeframe == '1D':
        df = df.reset_index().rename(columns={df.index.name or 'index': 'time'})
        df['confirmed'] = 1
    else:
        raise ValueError('自動研究模式支援日線、週線、月線。')
    return price_research(df), symbol, quote_time, quote_price
