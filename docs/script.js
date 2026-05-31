// Глобальные переменные
let questions = [];          // Оригинальные вопросы из файла
let shuffledQuestions = [];  // Перемешанные вопросы
let currentIndex = 0;        // Текущий индекс вопроса
let score = 0;               // Количество правильных ответов
let mistakes = [];           // Список ошибок
let answered = false;        // Флаг: ответил ли пользователь на текущий вопрос

// ===================================================================
//  ПАРСЕР .txt ФАЙЛОВ (выполняется прямо в браузере, без сервера)
//  Логика повторяет parser.py: те же правила формата и сообщения.
// ===================================================================

/**
 * Исключение для ошибок парсинга.
 */
class ParserError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ParserError';
    }
}

/**
 * Декодирует байты файла в строку, определяя кодировку.
 * Поддержка: UTF-8 (в т.ч. с BOM), UTF-16 LE/BE, Windows-1251.
 */
function decodeContent(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.length === 0) {
        throw new ParserError('Файл пустой');
    }

    // UTF-8 с BOM (EF BB BF)
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return new TextDecoder('utf-8').decode(bytes);
    }

    // UTF-16 LE (FF FE) / BE (FE FF)
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        return new TextDecoder('utf-16le').decode(bytes);
    }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        return new TextDecoder('utf-16be').decode(bytes);
    }

    // Пробуем строгий UTF-8, при ошибке откатываемся на Windows-1251
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
        return new TextDecoder('windows-1251').decode(bytes);
    }
}

/**
 * Парсит содержимое txt файла и возвращает список вопросов.
 * Формат:
 *   Текст вопроса
 *   =====
 *   #Правильный ответ
 *   =====
 *   Неправильный ответ
 *   +++++  (разделитель между вопросами)
 */
function parseTxt(arrayBuffer) {
    // Убираем возможный BOM в начале строки
    const fullText = decodeContent(arrayBuffer).replace(/^﻿/, '');

    // Разбиваем на блоки вопросов по строкам из 4 и более плюсов
    const questionBlocks = fullText.split(/\s*\+{4,}\s*/);

    const result = [];
    let questionNumber = 0;

    for (let block of questionBlocks) {
        block = block.trim();

        // Пропускаем пустые блоки
        if (!block) {
            continue;
        }
        questionNumber++;

        // Разбиваем блок по ==== или ===== (4+ знаков равенства)
        const parts = block.split(/\s*={4,}\s*/);

        // Первая часть — текст вопроса
        const questionText = parts[0].trim();
        if (!questionText) {
            throw new ParserError(`Вопрос ${questionNumber}: отсутствует текст вопроса`);
        }

        // Остальные части — варианты ответов
        const answerParts = parts.slice(1).map(p => p.trim());
        if (answerParts.length !== 4 && answerParts.length !== 5) {
            throw new ParserError(
                `Вопрос ${questionNumber}: должно быть 4 или 5 вариантов ответа, найдено ${answerParts.length}`
            );
        }

        // Ищем правильный ответ (начинается с #)
        const answers = [];
        let correctIndex = null;

        for (let j = 0; j < answerParts.length; j++) {
            const answer = answerParts[j];
            const isCorrect = answer.startsWith('#');
            const cleanedAnswer = isCorrect ? answer.slice(1).trim() : answer;

            if (!cleanedAnswer) {
                throw new ParserError(`Вопрос ${questionNumber}: пустой текст ответа`);
            }

            if (isCorrect) {
                if (correctIndex !== null) {
                    throw new ParserError(
                        `Вопрос ${questionNumber}: отмечено несколько правильных ответов`
                    );
                }
                correctIndex = j;
            }

            answers.push(cleanedAnswer);
        }

        if (correctIndex === null) {
            throw new ParserError(
                `Вопрос ${questionNumber}: не отмечен правильный ответ (символ #)`
            );
        }

        result.push({
            question: questionText,
            answers: answers,
            correct_index: correctIndex
        });
    }

    if (result.length === 0) {
        throw new ParserError('Файл не содержит вопросов');
    }

    return result;
}

// ===================================================================
//  ЛОГИКА ТЕСТА
// ===================================================================

/**
 * Алгоритм Fisher-Yates для перемешивания массива
 */
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Перемешивает вопросы и варианты ответов
 */
function shuffleQuestionsAndAnswers(questionsData) {
    // Перемешиваем порядок вопросов
    const shuffled = shuffleArray(questionsData);

    // Для каждого вопроса перемешиваем варианты ответов
    return shuffled.map((q, idx) => {
        // Создаём массив объектов с текстом и флагом "правильный"
        const answersWithFlag = q.answers.map((text, i) => ({
            text: text,
            isCorrect: i === q.correct_index
        }));

        // Перемешиваем
        const shuffledAnswers = shuffleArray(answersWithFlag);

        // Находим новый индекс правильного ответа
        const newCorrectIndex = shuffledAnswers.findIndex(a => a.isCorrect);

        return {
            originalIndex: idx + 1,  // Для отображения номера в ошибках
            question: q.question,
            answers: shuffledAnswers.map(a => a.text),
            correct_index: newCorrectIndex
        };
    });
}

/**
 * Чтение и разбор выбранного файла прямо в браузере
 */
function uploadFile() {
    const fileInput = document.getElementById('file-input');
    const errorDiv = document.getElementById('error-message');

    errorDiv.textContent = '';

    if (!fileInput.files.length) {
        errorDiv.textContent = 'Выберите файл';
        return;
    }

    const file = fileInput.files[0];

    if (!file.name.toLowerCase().endsWith('.txt')) {
        errorDiv.textContent = 'Загрузите файл формата .txt';
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const parsed = parseTxt(e.target.result);

            if (!Array.isArray(parsed) || parsed.length === 0) {
                errorDiv.textContent = 'Файл не содержит вопросов';
                return;
            }

            questions = parsed;
            startTest();
        } catch (err) {
            if (err instanceof ParserError) {
                errorDiv.textContent = err.message;
            } else {
                errorDiv.textContent = 'Ошибка при чтении файла: ' + err.message;
            }
        }
    };

    reader.onerror = function () {
        errorDiv.textContent = 'Не удалось прочитать файл';
    };

    // Читаем как байты, чтобы корректно определить кодировку
    reader.readAsArrayBuffer(file);
}

/**
 * Начало теста
 */
function startTest() {
    if (!Array.isArray(questions) || questions.length === 0) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = 'Файл не содержит вопросов';
        document.getElementById('upload-screen').style.display = 'block';
        document.getElementById('test-screen').style.display = 'none';
        document.getElementById('results-screen').style.display = 'none';
        return;
    }

    // Сбрасываем состояние
    currentIndex = 0;
    score = 0;
    mistakes = [];
    answered = false;

    // Перемешиваем вопросы и ответы
    shuffledQuestions = shuffleQuestionsAndAnswers(questions);

    // Показываем экран теста
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('test-screen').style.display = 'block';
    document.getElementById('results-screen').style.display = 'none';

    // Отображаем первый вопрос
    showQuestion();
}

/**
 * Отображение текущего вопроса
 */
function showQuestion() {
    const q = shuffledQuestions[currentIndex];
    const total = shuffledQuestions.length;

    // Обновляем счётчик
    document.getElementById('question-number').textContent =
        `Вопрос ${currentIndex + 1} из ${total}`;

    // Показываем текст вопроса
    document.getElementById('question-text').textContent = q.question;

    // Создаём кнопки вариантов ответов
    const container = document.getElementById('answers-container');
    container.innerHTML = '';

    q.answers.forEach((answer, index) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = answer;
        btn.onclick = () => selectAnswer(index);
        btn.dataset.index = index;
        container.appendChild(btn);
    });

    // Скрываем обратную связь и кнопку "Далее"
    document.getElementById('feedback').style.display = 'none';
    document.getElementById('next-btn').style.display = 'none';

    answered = false;
}

/**
 * Выбор ответа
 */
function selectAnswer(selectedIndex) {
    if (answered) return;
    answered = true;

    const q = shuffledQuestions[currentIndex];
    const isCorrect = selectedIndex === q.correct_index;

    // Подсвечиваем кнопки
    const buttons = document.querySelectorAll('.answer-btn');
    buttons.forEach((btn, idx) => {
        btn.disabled = true;

        if (idx === q.correct_index) {
            btn.classList.add('correct');
        }

        if (idx === selectedIndex && !isCorrect) {
            btn.classList.add('wrong');
        }
    });

    // Показываем обратную связь
    const feedbackDiv = document.getElementById('feedback');
    const feedbackText = document.getElementById('feedback-text');
    const correctAnswerText = document.getElementById('correct-answer-text');

    feedbackDiv.style.display = 'block';

    if (isCorrect) {
        feedbackText.textContent = 'Верно!';
        feedbackText.className = 'feedback-correct';
        correctAnswerText.textContent = '';
        score++;
    } else {
        feedbackText.textContent = 'Неверно';
        feedbackText.className = 'feedback-wrong';
        correctAnswerText.textContent = `Правильный ответ: ${q.answers[q.correct_index]}`;

        // Сохраняем ошибку (включая полные данные вопроса для повторного прохождения)
        mistakes.push({
            questionNumber: currentIndex + 1,
            questionText: q.question,
            userAnswer: q.answers[selectedIndex],
            correctAnswer: q.answers[q.correct_index],
            // Сохраняем оригинальный вопрос для функции "пройти ошибки заново"
            originalQuestion: {
                question: q.question,
                answers: q.answers,
                correct_index: q.correct_index
            }
        });
    }

    // Показываем кнопку для перехода
    const nextBtn = document.getElementById('next-btn');
    nextBtn.style.display = 'block';

    if (currentIndex === shuffledQuestions.length - 1) {
        nextBtn.textContent = 'Завершить';
    } else {
        nextBtn.textContent = 'Следующий вопрос';
    }
}

/**
 * Переход к следующему вопросу или завершение
 */
function nextQuestion() {
    currentIndex++;

    if (currentIndex >= shuffledQuestions.length) {
        showResults();
    } else {
        showQuestion();
    }
}

/**
 * Отображение результатов
 */
function showResults() {
    document.getElementById('test-screen').style.display = 'none';
    document.getElementById('results-screen').style.display = 'block';

    const total = shuffledQuestions.length;
    const percent = Math.round((score / total) * 100);

    document.getElementById('score').innerHTML =
        `<strong>${score} из ${total}</strong> (${percent}%)`;

    // Показываем ошибки, если есть
    const mistakesSection = document.getElementById('mistakes-section');
    const mistakesList = document.getElementById('mistakes-list');

    // Показываем/скрываем кнопку "Пройти ошибки заново"
    const retryMistakesBtn = document.getElementById('retry-mistakes-btn');

    if (mistakes.length > 0) {
        mistakesSection.style.display = 'block';
        retryMistakesBtn.style.display = 'inline-block';
        mistakesList.innerHTML = '';

        mistakes.forEach(m => {
            const div = document.createElement('div');
            div.className = 'mistake-item';
            div.innerHTML = `
                <div class="mistake-question">
                    <strong>Вопрос ${m.questionNumber}:</strong> ${m.questionText}
                </div>
                <div class="mistake-user">
                    <span class="label">Ваш ответ:</span> ${m.userAnswer}
                </div>
                <div class="mistake-correct">
                    <span class="label">Правильный ответ:</span> ${m.correctAnswer}
                </div>
            `;
            mistakesList.appendChild(div);
        });
    } else {
        mistakesSection.style.display = 'none';
        retryMistakesBtn.style.display = 'none';
    }
}

/**
 * Перезапуск теста
 */
function restartTest() {
    startTest();
}

/**
 * Повторное прохождение только ошибочных вопросов
 */
function retryMistakes() {
    if (mistakes.length === 0) return;

    // Собираем вопросы из ошибок
    const mistakeQuestions = mistakes.map(m => m.originalQuestion);

    // Сбрасываем состояние
    currentIndex = 0;
    score = 0;
    mistakes = [];
    answered = false;

    // Перемешиваем вопросы и ответы
    shuffledQuestions = shuffleQuestionsAndAnswers(mistakeQuestions);

    // Показываем экран теста
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('test-screen').style.display = 'block';
    document.getElementById('results-screen').style.display = 'none';

    // Отображаем первый вопрос
    showQuestion();
}
