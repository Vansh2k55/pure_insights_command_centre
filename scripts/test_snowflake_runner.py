"""Focused standard-library tests for the local Snowflake fixture runner."""

import importlib.util
import unittest
from pathlib import Path


RUNNER = Path(__file__).with_name("run_snowflake_fixture.py")
SPEC = importlib.util.spec_from_file_location("run_snowflake_fixture", RUNNER)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class SplitSqlTests(unittest.TestCase):
    def test_ignores_comment_only_fragments(self):
        source = "SELECT 1; -- only a trailing comment\n/* and a block comment */"
        self.assertEqual(MODULE.split_sql(source), ["SELECT 1"])
        self.assertFalse(MODULE.has_executable_sql(" -- comment\n /* block */ \n"))


if __name__ == "__main__":
    unittest.main()
