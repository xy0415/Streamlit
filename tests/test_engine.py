import unittest

import numpy as np
import pandas as pd

from engine import analyze, parse_export, price_research, file_identity


def fixture():
    return pd.DataFrame({
        'time': ['2024-12-30T09:00:00+08:00', '2024-12-31T09:00:00+08:00',
                 '2025-01-02T09:00:00+08:00', '2025-01-03T09:00:00+08:00'],
        'open': [90, 100, 120, 150], 'high': [100, 110, 130, 160],
        'low': [80, 90, 110, 140], 'close': [95, 105, 125, 160],
        'buy_plot_signal': [1, 1, 0, 1], 'buy_type': [1, 2, 0, 3], 'confirmed': [1, 1, 1, 1]})


class EngineTests(unittest.TestCase):
    def test_next_bar_and_cross_year(self):
        annual, ledger, _ = analyze(fixture(), years=2)
        row = annual.set_index('年份').loc[2024]
        self.assertEqual(row['買點次數'], 2)
        self.assertEqual(row['買入均價'], 110)
        self.assertAlmostEqual(row['至估值日報酬率 %'], (160 / 110 - 1) * 100)
        self.assertEqual(ledger.entry_price.iloc[:2].tolist(), [100, 120])

    def test_pending_does_not_change_average(self):
        annual, ledger, _ = analyze(fixture(), years=2)
        row = annual.set_index('年份').loc[2025]
        self.assertEqual(row['買點次數'], 1)
        self.assertEqual(row['成交次數'], 0)
        self.assertEqual(row['待成交'], 1)
        self.assertTrue(np.isnan(row['買入均價']))

    def test_entry_year(self):
        annual, _, _ = analyze(fixture(), years=2, year_basis='entry')
        self.assertEqual(annual.set_index('年份').loc[2025, '買入均價'], 120)

    def test_unconfirmed_signal_not_counted_but_open_is_fill(self):
        df = fixture(); df.loc[3, 'confirmed'] = 0; df.loc[2, 'buy_plot_signal'] = 1; df.loc[2, 'buy_type'] = 1
        annual, ledger, _ = analyze(df, years=2)
        self.assertEqual(len(ledger), 3)
        self.assertEqual(annual.set_index('年份').loc[2025, '買入均價'], 150)

    def test_missing_year_not_zero(self):
        annual, _, _ = analyze(fixture(), years=10)
        self.assertEqual(len(annual), 10)
        self.assertTrue(np.isnan(annual.set_index('年份').loc[2023, '買點次數']))

    def test_filter_and_valuation(self):
        annual, _, _ = analyze(fixture(), years=2, selected=(2,), valuation_price=240)
        row = annual.set_index('年份').loc[2024]
        self.assertEqual(row['買點次數'], 1)
        self.assertEqual(row['至估值日報酬率 %'], 100)

    def test_parse_export_aliases_and_epoch(self):
        df = fixture().rename(columns={'buy_plot_signal': 'EX Buy', 'buy_type': 'EX Type', 'confirmed': 'EX Closed'})
        df['time'] = pd.to_datetime(df.time, utc=True).astype('int64') // 10**9
        parsed = parse_export(df.to_csv(index=False).encode())
        self.assertEqual(len(parsed), 4)
        self.assertIn('buy_plot_signal', parsed)
        self.assertEqual(file_identity('2330.TW__1M.csv'), ('2330.TW', '1M'))

    def test_reject_raw_buy_signal_without_plotted_export(self):
        df = fixture().rename(columns={'buy_plot_signal': 'buy_signal'})
        with self.assertRaisesRegex(ValueError, 'buy_plot_signal'):
            parse_export(df.to_csv(index=False).encode())

    def test_reject_bad_input(self):
        df = fixture(); df.loc[1, 'time'] = df.loc[0, 'time']
        with self.assertRaises(ValueError):
            analyze(df)
        df = fixture(); df.loc[1, 'close'] = -1
        with self.assertRaises(ValueError):
            analyze(df)

    def test_zero_signal_and_flat_research(self):
        df = fixture(); df['buy_plot_signal'] = 0
        annual, ledger, _ = analyze(df, years=1)
        self.assertEqual(annual.iloc[0]['買點次數'], 0)
        self.assertTrue(ledger.empty)
        flat = pd.DataFrame({'time': pd.date_range('2020-01-01', periods=50, tz='UTC'),
                             'open': 100., 'high': 100., 'low': 100., 'close': 100., 'confirmed': 1})
        self.assertEqual(price_research(flat).buy_plot_signal.sum(), 0)


if __name__ == '__main__':
    unittest.main()
