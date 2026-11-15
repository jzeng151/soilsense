import json
import tempfile
import unittest
from pathlib import Path
from summarize import combine, load_rows, score, spearman, threshold


class ValidationTools(unittest.TestCase):
    def test_confusion_matrix_denominators(self):
        rows = [{"d1": 90, "x": 10}, {"d1": 60, "x": 50}, {"d1": 10, "x": 10}, {"d1": 0, "x": 50}]
        result = score(rows, threshold("x", 20))
        self.assertEqual({key: result[key] for key in ("tp", "fp", "fn", "tn", "n")}, {"tp": 1, "fp": 1, "fn": 1, "tn": 1, "n": 4})
        self.assertEqual(result["precision"], .5)
        self.assertEqual(result["false_positive_rate"], .5)

    def test_missing_is_skipped_not_zero_or_negative(self):
        rule = combine(threshold("rain", 20), threshold("soil", 20))
        result = score([{"d1": 80, "rain": None, "soil": 5}, {"d1": 80, "rain": 5, "soil": None}], rule)
        self.assertEqual(result["n"], 0)
        self.assertEqual(result["skipped"], 2)
        self.assertIsNone(result["hit_rate"])
        self.assertIsNone(threshold("rain", 20)({"rain": float("nan")}))

    def test_tied_ranks_and_constant_series(self):
        self.assertEqual(spearman([1, 2, 3], [3, 2, 1]), -1)
        self.assertEqual(spearman([1, 1, 2], [1, 1, 2]), 1)
        self.assertIsNone(spearman([1, 1], [2, 3]))

    def test_wrong_record_association_fails_instead_of_silent_join(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "rows.json").write_text(json.dumps([{"district": "a", "week": "2022-06-01"}]))
            (path / "fixrows.json").write_text(json.dumps([{"district": "b", "week": "2022-06-01"}]))
            with self.assertRaisesRegex(ValueError, "not aligned"):
                load_rows(path)

    def test_duplicate_records_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            row = {"district": "a", "week": "2022-06-01"}
            (path / "rows.json").write_text(json.dumps([row, row]))
            (path / "fixrows.json").write_text(json.dumps([row]))
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                load_rows(path)


if __name__ == "__main__":
    unittest.main()
