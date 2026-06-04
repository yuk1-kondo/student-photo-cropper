#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
import shutil
from pathlib import Path


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}


def natural_key(path: Path) -> list[object]:
    parts = re.split(r"(\d+)", path.stem)
    key: list[object] = []
    for part in parts:
        key.append(int(part) if part.isdigit() else part)
    key.append(path.suffix.lower())
    return key


def sanitize_filename(value: str) -> str:
    value = value.strip()
    value = re.sub(r'[\\/:*?"<>|]', "_", value)
    value = re.sub(r"\s+", "_", value)
    return value


def read_names(csv_path: Path, column: int) -> list[str]:
    names: list[str] = []
    with csv_path.open("r", newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for row_number, row in enumerate(reader, start=1):
            if len(row) <= column or not row[column].strip():
                raise ValueError(f"CSV row {row_number} has no value in column {column + 1}")
            name = sanitize_filename(row[column])
            if not name:
                raise ValueError(f"CSV row {row_number} becomes an empty filename after sanitizing")
            names.append(name)
    return names


def iter_images(input_dir: Path, output_dir: Path) -> list[Path]:
    images = []
    output_dir_resolved = output_dir.resolve(strict=False)
    for path in input_dir.iterdir():
        if path.resolve(strict=False).is_relative_to(output_dir_resolved):
            continue
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            images.append(path)
    return sorted(images, key=natural_key)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rename images by file-name order using names from a CSV column."
    )
    parser.add_argument("--input-dir", default=".", help="Folder containing images and CSV.")
    parser.add_argument("--csv", default="seitono.csv", help="CSV path.")
    parser.add_argument("--output-dir", default="renamed_output", help="Folder for renamed copies.")
    parser.add_argument("--column", type=int, default=1, help="1-based CSV column number to use.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing files in output folder.")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    csv_path = Path(args.csv)
    if not csv_path.is_absolute():
        csv_path = input_dir / csv_path
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = input_dir / output_dir

    column_index = args.column - 1
    if column_index < 0:
        raise ValueError("--column must be 1 or greater")

    images = iter_images(input_dir, output_dir)
    names = read_names(csv_path, column_index)

    if len(images) != len(names):
        raise ValueError(f"Image count and CSV row count differ: images={len(images)}, csv={len(names)}")

    if len(names) != len(set(names)):
        duplicates = sorted({name for name in names if names.count(name) > 1})
        raise ValueError(f"CSV contains duplicate output names: {duplicates[:10]}")

    output_dir.mkdir(parents=True, exist_ok=True)
    mapping_path = output_dir / "rename_mapping.csv"
    planned_targets = []
    for image, name in zip(images, names, strict=True):
        target = output_dir / f"{name}{image.suffix.lower()}"
        if target.exists() and not args.overwrite:
            raise FileExistsError(f"Output already exists: {target}")
        planned_targets.append((image, target))

    with mapping_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["source_file", "output_file"])
        for image, target in planned_targets:
            shutil.copy2(image, target)
            writer.writerow([image.name, target.name])

    print(f"Renamed copies: {len(planned_targets)}")
    print(f"Output: {output_dir}")
    print(f"Mapping: {mapping_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
