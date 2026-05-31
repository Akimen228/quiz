"""
Модуль для парсинга txt файлов с вопросами викторины.
"""

import re
from typing import Dict, List


class ParserError(Exception):
    """Исключение для ошибок парсинга."""


def _decode_content(file_content: bytes) -> str:
    if not file_content:
        raise ParserError("Файл пустой")

    try:
        if file_content.startswith(b"\xef\xbb\xbf"):
            return file_content.decode("utf-8-sig")
        if file_content.startswith((b"\xff\xfe", b"\xfe\xff")):
            return file_content.decode("utf-16")
        try:
            return file_content.decode("utf-8")
        except UnicodeDecodeError:
            return file_content.decode("cp1251")
    except Exception as e:
        raise ParserError(f"Не удалось прочитать файл: {str(e)}")


def parse_txt(file_content: bytes) -> List[Dict]:
    """
    Парсит txt файл и возвращает список вопросов.

    Args:
        file_content: Содержимое txt файла в байтах

    Returns:
        Список словарей с вопросами:
        [
            {
                "question": "Текст вопроса",
                "answers": [
                    "Вариант 1",
                    "Вариант 2",
                    "Вариант 3",
                    "Вариант 4",
                    "Вариант 5"
                ],
                "correct_index": 0
            }
        ]

    Raises:
        ParserError: Если формат файла неверный
    """
    full_text = _decode_content(file_content).lstrip("\ufeff")

    # Разбиваем на блоки вопросов по строкам из 4 и более плюсов.
    question_blocks = re.split(r"\s*\+{4,}\s*", full_text)

    questions = []

    question_number = 0
    for block in question_blocks:
        block = block.strip()

        # Пропускаем пустые блоки
        if not block:
            continue
        question_number += 1

        # Разбиваем блок по ==== или ===== (4+ знаков равенства)
        parts = re.split(r"\s*={4,}\s*", block)

        # Первая часть — текст вопроса
        question_text = parts[0].strip()
        if not question_text:
            raise ParserError(f"Вопрос {question_number}: отсутствует текст вопроса")

        # Остальные части — варианты ответов
        answer_parts = [p.strip() for p in parts[1:]]
        if len(answer_parts) not in (4, 5):
            raise ParserError(
                f"Вопрос {question_number}: должно быть 4 или 5 вариантов ответа, найдено {len(answer_parts)}"
            )

        # Ищем правильный ответ (начинается с #)
        answers = []
        correct_index = None

        for j, answer in enumerate(answer_parts):
            is_correct = answer.startswith("#")
            cleaned_answer = answer[1:].strip() if is_correct else answer

            if not cleaned_answer:
                raise ParserError(f"Вопрос {question_number}: пустой текст ответа")

            if is_correct:
                if correct_index is not None:
                    raise ParserError(
                        f"Вопрос {question_number}: отмечено несколько правильных ответов"
                    )
                correct_index = j

            answers.append(cleaned_answer)

        if correct_index is None:
            raise ParserError(
                f"Вопрос {question_number}: не отмечен правильный ответ (символ #)"
            )

        questions.append(
            {
                "question": question_text,
                "answers": answers,
                "correct_index": correct_index,
            }
        )

    if not questions:
        raise ParserError("Файл не содержит вопросов")

    return questions
