#!/usr/bin/env python3
"""Build a compact RohBar locality index from the official GeoNames Russia dump."""

from __future__ import annotations

import argparse
import csv
import io
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

RU_URL = "https://download.geonames.org/export/dump/RU.zip"
ADMIN_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt"
MAX_DOWNLOAD = 128 * 1024 * 1024
MAX_UNCOMPRESSED = 512 * 1024 * 1024
USER_AGENT = "RohBar/0.2 (+https://rohbar.vosiev.com)"

FIELDS = [
    "geoname_id",
    "name",
    "ascii_name",
    "alternate_names",
    "search_name",
    "latitude",
    "longitude",
    "feature_code",
    "admin1_code",
    "admin1_name",
    "population",
    "country_code",
]


def official_url(url: str, expected_path: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != "download.geonames.org":
        raise ValueError("GeoNames source must use the official HTTPS host")
    if parsed.path != expected_path or parsed.query or parsed.fragment:
        raise ValueError("Unexpected GeoNames source path")
    return url


def download(url: str, expected_path: str) -> bytes:
    request = urllib.request.Request(
        official_url(url, expected_path),
        headers={"User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        length = response.headers.get("Content-Length")
        if length and int(length) > MAX_DOWNLOAD:
            raise RuntimeError("GeoNames download is unexpectedly large")
        output = bytearray()
        while chunk := response.read(1024 * 1024):
            output.extend(chunk)
            if len(output) > MAX_DOWNLOAD:
                raise RuntimeError("GeoNames download exceeded safety limit")
        return bytes(output)


def admin_names(raw: bytes) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in raw.decode("utf-8").splitlines():
        columns = line.split("\t")
        if len(columns) >= 2 and columns[0].startswith("RU."):
            result[columns[0].removeprefix("RU.")] = columns[1].strip()
    return result


def normalized_search(*parts: str) -> str:
    values: list[str] = []
    seen: set[str] = set()
    for part in parts:
        for value in part.replace(",", " ").split():
            value = value.casefold().strip()
            if value and value not in seen:
                seen.add(value)
                values.append(value)
    return " ".join(values)[:8000]


def parse_population(value: str) -> int:
    try:
        return max(0, int(value or "0"))
    except ValueError:
        return 0


def build_rows(zip_bytes: bytes, regions: dict[str, str]):
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        try:
            info = archive.getinfo("RU.txt")
        except KeyError as exc:
            raise RuntimeError("GeoNames RU.zip does not contain RU.txt") from exc
        if info.file_size > MAX_UNCOMPRESSED:
            raise RuntimeError("GeoNames RU.txt exceeded safety limit")
        with archive.open(info) as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8", newline="")
            for line_number, line in enumerate(text, 1):
                columns = line.rstrip("\r\n").split("\t")
                if len(columns) < 19:
                    raise RuntimeError(f"Malformed GeoNames row {line_number}")
                if columns[6] != "P" or columns[8] != "RU":
                    continue
                try:
                    geoname_id = int(columns[0])
                    latitude = float(columns[4])
                    longitude = float(columns[5])
                except ValueError as exc:
                    raise RuntimeError(f"Invalid GeoNames row {line_number}") from exc
                if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                    raise RuntimeError(f"Invalid coordinates on GeoNames row {line_number}")
                name = columns[1].strip()
                ascii_name = columns[2].strip()
                alternate_names = columns[3].strip()[:12000]
                admin1_code = columns[10].strip()
                yield {
                    "geoname_id": geoname_id,
                    "name": name,
                    "ascii_name": ascii_name,
                    "alternate_names": alternate_names,
                    "search_name": normalized_search(name, ascii_name, alternate_names),
                    "latitude": f"{latitude:.7f}",
                    "longitude": f"{longitude:.7f}",
                    "feature_code": columns[7].strip(),
                    "admin1_code": admin1_code,
                    "admin1_name": regions.get(admin1_code, ""),
                    "population": parse_population(columns[14]),
                    "country_code": "RU",
                }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/tmp/rohbar-geonames-ru.csv")
    parser.add_argument("--ru-url", default=RU_URL)
    parser.add_argument("--admin-url", default=ADMIN_URL)
    args = parser.parse_args()

    regions = admin_names(download(args.admin_url, "/export/dump/admin1CodesASCII.txt"))
    source = download(args.ru_url, "/export/dump/RU.zip")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        for row in build_rows(source, regions):
            writer.writerow(row)
            count += 1
    if count < 1_000:
        output.unlink(missing_ok=True)
        raise RuntimeError("GeoNames Russia index contained unexpectedly few populated places")
    print(f"GeoNames Russia index ready: {count} places -> {output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"GeoNames import failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
