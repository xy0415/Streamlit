import unittest
from unittest.mock import patch, MagicMock

import pandas as pd

from providers import yahoo_research, normalize_symbol


class ProviderTests(unittest.TestCase):
    def test_symbol_and_incomplete_week(self):
        self.assertEqual(normalize_symbol('2330'), '2330.TW')
        dates = pd.date_range('2024-12-02', '2025-01-08', freq='B', tz='Asia/Taipei')
        raw = pd.DataFrame({'Open': 100., 'High': 110., 'Low': 90., 'Close': 105., 'Volume': 1000}, index=dates)
        raw.index.name = 'Date'
        ticker = MagicMock(); ticker.history.return_value = raw
        with patch('yfinance.Ticker', return_value=ticker):
            weekly, _, quote_time, quote = yahoo_research('2330', '1W', now='2025-01-08T14:00:00+08:00')
            daily, _, _, _ = yahoo_research('2330', '1D', now='2025-01-08T14:00:00+08:00')
        self.assertEqual(weekly.confirmed.iloc[-1], 0)
        self.assertEqual(weekly.confirmed.iloc[-2], 1)
        self.assertEqual(weekly.time.iloc[-1].tz_convert('Asia/Taipei').day, 6)
        self.assertEqual(quote_time.day, 7)
        self.assertEqual(quote, 105)
        self.assertEqual(daily.time.iloc[-1].tz_convert('Asia/Taipei').day, 7)


if __name__ == '__main__':
    unittest.main()
