import unittest
from pathlib import Path

from streamlit.testing.v1 import AppTest


class AppTests(unittest.TestCase):
    def test_welcome_and_demo(self):
        app = AppTest.from_file(str(Path(__file__).resolve().parents[1] / 'app.py')).run(timeout=30)
        self.assertFalse(app.exception)
        app.checkbox[0].check().run(timeout=30)
        self.assertFalse(app.exception)
        self.assertGreaterEqual(len(app.dataframe), 2)
        self.assertEqual(len(app.dataframe[0].value), 20)
        app.slider[0].set_value(3).run(timeout=30)
        self.assertFalse(app.exception)
        self.assertEqual(len(app.dataframe[0].value), 6)


if __name__ == '__main__':
    unittest.main()
