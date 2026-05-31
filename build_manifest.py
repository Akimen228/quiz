"""
Build docs/manifest.json for the static quiz site.
"""

import json
from pathlib import Path

from parser import ParserError, parse_txt


ROOT = Path(__file__).resolve().parent


def display_name(file_path: Path) -> str:
    return file_path.stem.replace("_", " ")


def build_manifest(root: Path | str = ROOT, strict: bool = False) -> dict:
    root = Path(root)
    docs_dir = root / "docs"
    tests_dir = docs_dir / "tests"
    manifest_path = docs_dir / "manifest.json"

    tests = []
    if not tests_dir.exists():
        print(f"Warning: {tests_dir} does not exist; manifest will be empty")
    else:
        for file_path in sorted(tests_dir.glob("*.txt"), key=lambda path: path.name.casefold()):
            try:
                questions = parse_txt(file_path.read_bytes())
            except (OSError, ParserError) as exc:
                message = f"{file_path.name}: {exc}"
                if strict:
                    raise RuntimeError(
                        f"Тест не прошёл проверку (строгий режим): {message}"
                    ) from exc
                print(f"Warning: skipped {message}")
                continue

            tests.append(
                {
                    "name": display_name(file_path),
                    "file": file_path.relative_to(docs_dir).as_posix(),
                    "count": len(questions),
                }
            )

    manifest = {"tests": tests}
    docs_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {manifest_path} with {len(tests)} test(s)")
    return manifest


if __name__ == "__main__":
    import argparse

    arg_parser = argparse.ArgumentParser(
        description="Сборка docs/manifest.json из docs/tests/*.txt"
    )
    arg_parser.add_argument(
        "--strict",
        action="store_true",
        help="Падать с ошибкой, если хотя бы один тест не парсится (для CI).",
    )
    args = arg_parser.parse_args()
    build_manifest(strict=args.strict)
