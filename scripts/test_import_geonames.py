import csv
import importlib.util
import io
import unittest
import zipfile
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("import-geonames-ru.py")
SPEC = importlib.util.spec_from_file_location("import_geonames_ru", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class GeoNamesImportTests(unittest.TestCase):
    def test_official_url_rejects_other_hosts_and_paths(self):
        self.assertEqual(
            MODULE.official_url(MODULE.RU_URL, "/export/dump/RU.zip"),
            MODULE.RU_URL,
        )
        with self.assertRaises(ValueError):
            MODULE.official_url("https://example.com/RU.zip", "/export/dump/RU.zip")
        with self.assertRaises(ValueError):
            MODULE.official_url(
                "https://download.geonames.org/export/dump/US.zip",
                "/export/dump/RU.zip",
            )

    def test_admin_names_keep_only_russia(self):
        raw = "RU.48\tMoscow\tMoscow\t524901\nDE.16\tBerlin\tBerlin\t2950157\n".encode()
        self.assertEqual(MODULE.admin_names(raw), {"48": "Moscow"})

    def test_build_rows_keeps_populated_places_and_builds_search_text(self):
        populated = [
            "524901", "Moscow", "Moscow", "Москва,Moskva", "55.7522", "37.6156",
            "P", "PPLC", "RU", "", "48", "", "", "", "13010112", "", "",
            "Europe/Moscow", "2026-01-01",
        ]
        mountain = [
            "1", "Peak", "Peak", "", "55", "37", "T", "PK", "RU", "", "48",
            "", "", "", "0", "", "", "Europe/Moscow", "2026-01-01",
        ]
        payload = "\n".join(["\t".join(populated), "\t".join(mountain)]) + "\n"
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("RU.txt", payload)

        rows = list(MODULE.build_rows(stream.getvalue(), {"48": "Moscow"}))
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["geoname_id"], 524901)
        self.assertEqual(row["admin1_name"], "Moscow")
        self.assertEqual(row["population"], 13010112)
        self.assertIn("moscow", row["search_name"])
        self.assertIn("москва", row["search_name"])

    def test_csv_schema_matches_database_loader(self):
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=MODULE.FIELDS)
        writer.writeheader()
        self.assertEqual(output.getvalue().splitlines()[0].split(","), MODULE.FIELDS)


if __name__ == "__main__":
    unittest.main()
