#!/usr/bin/env python3
"""
Tests for scripts/generate-price-indices.py.

    /tmp/exio-venv/bin/python scripts/generate-price-indices.test.py

⚠️ WHY THIS EXISTS, AND WHY IT IS THE NULL PATH THAT IS TESTED.
series_with_nulls emits an explicit null plus a stated reason for every missing year. On the real
data at vintage 2024 that branch NEVER RUNS - every one of the 44 named regions has a complete
CPI and FX series across 2019..2024, and the generator prints "NULLS: 0". Russia is the case the
branch was written for: the World Bank publishes no 2025 official exchange rate for it, so the
moment the vintage advances to 2025 the branch fires on live customer-facing data having never once
been exercised. A synthetic series is the only way to run it before then.

The specific failure this guards against is a silent carry-forward: returning the 2024 rate for
2025 because "the series ends there" would invent an observation the publisher did not make, and
nothing downstream could tell the difference between a real rate and a repeated one.

stdlib unittest, no pytest - pytest is not a project dependency and this is not run by the build.
The module imports cleanly because its work lives in main() behind a __name__ guard; importing it
does not read a file or generate anything.
"""

import importlib.util
import pathlib
import sys
import unittest

_SPEC = importlib.util.spec_from_file_location(
    "gen_price_indices", pathlib.Path(__file__).resolve().parent / "generate-price-indices.py"
)
gen = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(gen)


class TestSeriesWithNulls(unittest.TestCase):
    YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025]

    def test_missing_fx_year_emits_null_and_reason(self):
        """The Russia shape: CPI complete, FX absent for the final year only."""
        cpi = {y: 100.0 + y - 2019 for y in self.YEARS}
        fx = {y: 60.0 + y - 2019 for y in self.YEARS if y != 2025}   # 2025 withheld

        series_cpi, series_fx, nulls = gen.series_with_nulls("RU", cpi, fx, self.YEARS)

        # The null is present, explicit, and typed as null rather than absent.
        self.assertIn("2025", series_fx, "the year must be present as a key, not dropped")
        self.assertIsNone(series_fx["2025"])

        # Exactly one null, and it names field, year and reason.
        self.assertEqual(len(nulls), 1, f"expected one null, got {nulls}")
        region, field, year, reason = nulls[0]
        self.assertEqual((region, field, year), ("RU", "fx", 2025))
        self.assertEqual(reason, gen.FX_NULL_REASON)
        self.assertTrue(reason.strip(), "a null must carry a non-empty reason")

        # THE CARRY-FORWARD GUARD. 2024 held 65.0; 2025 must not repeat it.
        self.assertEqual(series_fx["2024"], 65.0)
        self.assertNotEqual(series_fx["2025"], series_fx["2024"])

        # CPI is untouched by an FX gap.
        self.assertEqual(len(series_cpi), len(self.YEARS))
        self.assertTrue(all(v is not None for v in series_cpi.values()))

    def test_complete_series_emits_no_nulls(self):
        """The 2024-vintage shape: nothing missing, so the branch stays silent."""
        cpi = {y: 100.0 for y in self.YEARS}
        fx = {y: 1.0 for y in self.YEARS}
        series_cpi, series_fx, nulls = gen.series_with_nulls("DE", cpi, fx, self.YEARS)
        self.assertEqual(nulls, [])
        self.assertEqual(len(series_cpi), len(self.YEARS))
        self.assertEqual(len(series_fx), len(self.YEARS))

    def test_both_fields_missing_same_year_emit_two_nulls(self):
        cpi = {y: 100.0 for y in self.YEARS if y != 2023}
        fx = {y: 1.0 for y in self.YEARS if y != 2023}
        _, _, nulls = gen.series_with_nulls("XX", cpi, fx, self.YEARS)
        self.assertEqual(len(nulls), 2)
        self.assertEqual({n[1] for n in nulls}, {"cpi", "fx"})
        self.assertEqual({n[2] for n in nulls}, {2023})
        self.assertEqual({n[3] for n in nulls}, {gen.CPI_NULL_REASON, gen.FX_NULL_REASON})

    def test_empty_source_nulls_every_year_both_fields(self):
        """A region the source does not carry at all still yields a full-length series."""
        _, series_fx, nulls = gen.series_with_nulls("ZZ", {}, {}, self.YEARS)
        self.assertEqual(len(series_fx), len(self.YEARS))
        self.assertTrue(all(v is None for v in series_fx.values()))
        self.assertEqual(len(nulls), len(self.YEARS) * 2)

    def test_years_outside_the_span_are_not_emitted(self):
        """A source richer than the span must not widen it."""
        cpi = {y: 100.0 for y in range(2015, 2031)}
        fx = {y: 1.0 for y in range(2015, 2031)}
        series_cpi, _, nulls = gen.series_with_nulls("DE", cpi, fx, [2019, 2020])
        self.assertEqual(sorted(series_cpi), ["2019", "2020"])
        self.assertEqual(nulls, [])

    def test_keys_are_strings_for_json(self):
        """JSON object keys must be strings; an int key would serialise differently."""
        series_cpi, series_fx, _ = gen.series_with_nulls("DE", {2019: 1.0}, {}, [2019])
        self.assertTrue(all(isinstance(k, str) for k in series_cpi))
        self.assertTrue(all(isinstance(k, str) for k in series_fx))


class TestConstants(unittest.TestCase):
    def test_null_reasons_are_distinct_and_descriptive(self):
        self.assertNotEqual(gen.CPI_NULL_REASON, gen.FX_NULL_REASON)
        for r in (gen.CPI_NULL_REASON, gen.FX_NULL_REASON):
            self.assertGreater(len(r), 20, "a reason must say something a reader can act on")

    def test_coverage_note_states_measurable_not_bucket(self):
        """The note is the whole point of splitting the exclusion lists; assert it still says so."""
        self.assertIn("MEASURABLE", gen.GDP_COVERAGE_NOTE)
        self.assertIn("unmeasured_no_gdp", gen.GDP_COVERAGE_NOTE)

    def test_wl_bias_note_is_a_constant_not_computed(self):
        self.assertIn("Argentina", gen.WL_BIAS_NOTE)
        self.assertIn("DOWNWARD", gen.WL_BIAS_NOTE)


if __name__ == "__main__":
    unittest.main(verbosity=2)
