import unittest

from parser import ParserError, parse_txt


def build_question(question_text, answers, separator="+++++"):
    answers_block = "\n=====\n".join(answers)
    return f"{question_text}\n=====\n{answers_block}\n{separator}\n"


class ParseTxtTests(unittest.TestCase):
    def test_parses_four_answers_with_five_plus_separator(self):
        content = build_question(
            "Вопрос 1?",
            ["#Ответ 1", "Ответ 2", "Ответ 3", "Ответ 4"],
            separator="+++++",
        ).encode("utf-8")

        result = parse_txt(content)

        self.assertEqual(len(result), 1)
        self.assertEqual(
            result[0]["answers"], ["Ответ 1", "Ответ 2", "Ответ 3", "Ответ 4"]
        )
        self.assertEqual(result[0]["correct_index"], 0)

    def test_parses_five_answers_with_four_plus_separator(self):
        content = build_question(
            "Вопрос 2?",
            ["Ответ 1", "Ответ 2", "#Ответ 3", "Ответ 4", "Ответ 5"],
            separator="++++",
        ).encode("utf-8")

        result = parse_txt(content)

        self.assertEqual(len(result), 1)
        self.assertEqual(
            result[0]["answers"],
            ["Ответ 1", "Ответ 2", "Ответ 3", "Ответ 4", "Ответ 5"],
        )
        self.assertEqual(result[0]["correct_index"], 2)

    def test_accepts_correct_answer_in_any_position_from_one_to_five(self):
        questions = []
        for position in range(5):
            answers = [f"Ответ {index + 1}" for index in range(5)]
            answers[position] = f"#{answers[position]}"
            questions.append(build_question(f"Вопрос {position + 1}?", answers, "++++"))

        result = parse_txt("".join(questions).encode("utf-8"))

        self.assertEqual(len(result), 5)
        self.assertEqual(
            [question["correct_index"] for question in result], [0, 1, 2, 3, 4]
        )

    def test_parses_mixed_file_with_four_and_five_answers(self):
        content = (
            build_question("Вопрос 1?", ["#А", "Б", "В", "Г"], separator="+++++")
            + build_question("Вопрос 2?", ["А", "#Б", "В", "Г", "Д"], separator="++++")
        ).encode("utf-8")

        result = parse_txt(content)

        self.assertEqual(len(result), 2)
        self.assertEqual(len(result[0]["answers"]), 4)
        self.assertEqual(len(result[1]["answers"]), 5)
        self.assertEqual(result[0]["correct_index"], 0)
        self.assertEqual(result[1]["correct_index"], 1)

    def test_rejects_question_with_three_answers(self):
        content = build_question("Вопрос?", ["#А", "Б", "В"], separator="++++").encode(
            "utf-8"
        )

        with self.assertRaisesRegex(ParserError, "4 или 5"):
            parse_txt(content)

    def test_rejects_question_with_more_than_five_answers(self):
        content = build_question(
            "Вопрос?",
            ["#А", "Б", "В", "Г", "Д", "Е"],
            separator="++++",
        ).encode("utf-8")

        with self.assertRaisesRegex(ParserError, "4 или 5"):
            parse_txt(content)

    def test_rejects_question_without_correct_answer_marker(self):
        content = build_question("Вопрос?", ["А", "Б", "В", "Г"], separator="++++").encode(
            "utf-8"
        )

        with self.assertRaisesRegex(ParserError, "не отмечен правильный ответ"):
            parse_txt(content)

    def test_rejects_question_with_multiple_correct_answer_markers(self):
        content = build_question("Вопрос?", ["#А", "#Б", "В", "Г"], separator="++++").encode(
            "utf-8"
        )

        with self.assertRaisesRegex(ParserError, "несколько правильных ответов"):
            parse_txt(content)


if __name__ == "__main__":
    unittest.main()
