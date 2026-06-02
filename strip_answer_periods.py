"""
Strip giveaway final periods from answer lines in docs/tests/*.txt.
"""

from pathlib import Path
import re

from parser import ParserError, parse_txt


ROOT = Path(__file__).resolve().parent
DEFAULT_TESTS_DIR = ROOT / "docs" / "tests"

ANSWER_SEPARATOR_RE = re.compile(r"^\s*={4,}\s*$")
QUESTION_SEPARATOR_RE = re.compile(r"^\s*\+{4,}\s*$")


class StripError(Exception):
    """Raised when a file cannot be safely transformed."""


def split_line_ending(line: str) -> tuple[str, str]:
    if line.endswith("\r\n"):
        return line[:-2], "\r\n"
    if line.endswith("\n"):
        return line[:-1], "\n"
    if line.endswith("\r"):
        return line[:-1], "\r"
    return line, ""


def strip_answer_period(answer_line: str) -> tuple[str, bool]:
    stripped = answer_line.rstrip()
    if not stripped.endswith(".") or stripped.endswith(".."):
        return answer_line, False

    updated = stripped[:-1].rstrip()
    return updated, updated != answer_line


def transform_text(text: str) -> tuple[str, int]:
    output_lines = []
    saw_question = False
    changed_count = 0

    for line in text.splitlines(keepends=True):
        body, line_ending = split_line_ending(line)

        if QUESTION_SEPARATOR_RE.match(body):
            saw_question = False
            output_lines.append(line)
            continue

        if ANSWER_SEPARATOR_RE.match(body) or not body.strip():
            output_lines.append(line)
            continue

        if not saw_question:
            saw_question = True
            output_lines.append(line)
            continue

        updated_body, changed = strip_answer_period(body)
        if changed:
            changed_count += 1
        output_lines.append(updated_body + line_ending)

    return "".join(output_lines), changed_count


def validate_transformation(
    path: Path,
    original_bytes: bytes,
    transformed_text: str,
) -> None:
    try:
        before_questions = parse_txt(original_bytes)
        after_questions = parse_txt(transformed_text.encode("utf-8"))
    except ParserError as exc:
        raise StripError(f"{path}: parser validation failed: {exc}") from exc

    if len(before_questions) != len(after_questions):
        raise StripError(
            f"{path}: question count changed "
            f"({len(before_questions)} -> {len(after_questions)})"
        )

    for question_number, (before, after) in enumerate(
        zip(before_questions, after_questions), start=1
    ):
        if before["question"] != after["question"]:
            raise StripError(f"{path}: question {question_number} text changed")

        if before["correct_index"] != after["correct_index"]:
            raise StripError(f"{path}: question {question_number} correct index changed")

        before_answers = before["answers"]
        after_answers = after["answers"]
        if len(before_answers) != len(after_answers):
            raise StripError(f"{path}: question {question_number} answer count changed")

        for answer_number, (before_answer, after_answer) in enumerate(
            zip(before_answers, after_answers), start=1
        ):
            expected_answer, _ = strip_answer_period(before_answer)
            if after_answer != expected_answer:
                raise StripError(
                    f"{path}: question {question_number} answer {answer_number} "
                    "changed in an unexpected way"
                )
            if not after_answer:
                raise StripError(
                    f"{path}: question {question_number} answer {answer_number} "
                    "became empty"
                )


def process_file(path: Path, check: bool = False) -> int:
    original_bytes = path.read_bytes()
    try:
        text = original_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise StripError(f"{path}: expected UTF-8 input") from exc

    transformed_text, changed_count = transform_text(text)
    validate_transformation(path, original_bytes, transformed_text)

    if changed_count and not check:
        path.write_bytes(transformed_text.encode("utf-8"))

    return changed_count


def default_paths() -> list[Path]:
    return sorted(DEFAULT_TESTS_DIR.glob("*.txt"), key=lambda path: path.name.casefold())


def main() -> int:
    import argparse

    arg_parser = argparse.ArgumentParser(
        description="Strip final periods from quiz answer lines."
    )
    arg_parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="Files to process. Defaults to docs/tests/*.txt.",
    )
    arg_parser.add_argument(
        "--check",
        action="store_true",
        help="Validate and report changes without writing files.",
    )
    args = arg_parser.parse_args()

    paths = args.paths or default_paths()
    total_changed = 0

    for path in paths:
        changed_count = process_file(path, check=args.check)
        total_changed += changed_count
        action = "would change" if args.check else "changed"
        print(f"{path}: {action} {changed_count} answer line(s)")

    return 1 if args.check and total_changed else 0


if __name__ == "__main__":
    raise SystemExit(main())
