// Глобальные переменные
let questions = [];          // Оригинальные вопросы с сервера
let shuffledQuestions = [];  // Перемешанные вопросы
let currentIndex = 0;        // Текущий индекс вопроса
let score = 0;               // Количество правильных ответов
let mistakes = [];           // Список ошибок
let answered = false;        // Флаг: ответил ли пользователь на текущий вопрос

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
 * Получение сообщения об ошибке из ответа сервера
 */
function extractErrorMessage(data) {
    if (!data) {
        return 'Ошибка сервера при загрузке файла';
    }
    if (typeof data.error === 'string') {
        return data.error;
    }
    if (typeof data.detail === 'string') {
        return data.detail;
    }
    if (Array.isArray(data.detail)) {
        const messages = data.detail.map((item) => item && item.msg).filter(Boolean);
        if (messages.length) {
            return messages.join('; ');
        }
    }
    return 'Ошибка сервера при загрузке файла';
}

/**
 * Загрузка файла на сервер
 */
async function uploadFile() {
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

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            errorDiv.textContent = 'Не удалось прочитать ответ сервера';
            return;
        }

        if (!response.ok) {
            errorDiv.textContent = extractErrorMessage(data);
            return;
        }

        if (!data.success) {
            errorDiv.textContent = extractErrorMessage(data);
            return;
        }

        if (!Array.isArray(data.questions) || data.questions.length === 0) {
            errorDiv.textContent = 'Файл не содержит вопросов';
            return;
        }

        questions = data.questions;
        startTest();

    } catch (error) {
        errorDiv.textContent = 'Ошибка при загрузке файла: ' + error.message;
    }
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
