// Глобальные переменные
let sourceQuestions = [];     // Все вопросы выбранного теста до среза
let questions = [];           // Вопросы выбранного объёма до перемешивания
let shuffledQuestions = [];   // Перемешанные вопросы
let currentIndex = 0;         // Текущий индекс вопроса
let score = 0;                // Количество правильных ответов
let mistakes = [];            // Список ошибок
let answered = false;         // Флаг: ответил ли пользователь на текущий вопрос
let currentTestName = '';     // Название выбранного теста
let selectedRangeId = 'all';  // Выбранный объём

// ===================================================================
//  БИБЛИОТЕКА ТЕСТОВ И ВЫБОР ОБЪЁМА
// ===================================================================

const SCREEN_IDS = ['library-screen', 'range-screen', 'test-screen', 'results-screen'];

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    showScreen('library-screen');
    loadManifest();
}

function showScreen(screenId) {
    SCREEN_IDS.forEach(id => {
        const screen = document.getElementById(id);
        if (screen) {
            screen.style.display = id === screenId ? 'block' : 'none';
        }
    });

    if (window.scrollTo) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function setMessage(elementId, text, isError = false) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.textContent = text;
    element.style.display = text ? 'block' : 'none';
    element.classList.toggle('error', isError);
    element.classList.toggle('message', !isError);
}

async function loadManifest() {
    const list = document.getElementById('tests-list');
    if (list) {
        list.innerHTML = '';
    }
    setMessage('manifest-message', 'Загружаем список тестов...');

    try {
        const response = await fetch('manifest.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const manifest = await response.json();
        const tests = Array.isArray(manifest.tests) ? manifest.tests : [];
        renderTestList(tests);
    } catch (err) {
        renderTestList([]);
        setMessage(
            'manifest-message',
            'Не удалось загрузить список тестов. Если вы открыли index.html двойным кликом, запустите локальный сервер или откройте сайт на GitHub Pages. Загрузка своего .txt ниже работает.',
            true
        );
    }
}

function renderTestList(tests) {
    const list = document.getElementById('tests-list');
    if (!list) return;

    list.innerHTML = '';

    if (!tests.length) {
        setMessage('manifest-message', 'Готовых тестов пока нет. Можно загрузить свой .txt ниже.');
        return;
    }

    setMessage('manifest-message', '');

    tests.forEach(test => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'test-list-item';
        button.addEventListener('click', () => loadReadyTest(test));

        const title = document.createElement('span');
        title.className = 'test-title';
        title.textContent = test.name || test.file;

        const count = document.createElement('span');
        count.className = 'test-count';
        count.textContent = formatQuestionCount(test.count);

        button.appendChild(title);
        button.appendChild(count);
        list.appendChild(button);
    });
}

async function loadReadyTest(test) {
    setMessage('manifest-message', `Загружаем «${test.name}»...`);

    try {
        if (!isSafeManifestPath(test.file)) {
            throw new ParserError('Некорректный путь к тесту в манифесте');
        }
        const response = await fetch(encodeManifestFilePath(test.file), { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const parsed = parseLoadedQuestions(await response.arrayBuffer());
        openRangeSelection(parsed, test.name || test.file);
    } catch (err) {
        const message = err instanceof ParserError
            ? err.message
            : `Не удалось загрузить тест: ${err.message}`;
        setMessage('manifest-message', message, true);
    }
}

function parseLoadedQuestions(arrayBuffer) {
    const parsed = parseTxt(arrayBuffer);
    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new ParserError('Файл не содержит вопросов');
    }
    return parsed;
}

function openRangeSelection(parsedQuestions, testName) {
    sourceQuestions = parsedQuestions;
    currentTestName = testName;
    selectedRangeId = 'all';
    setMessage('manifest-message', '');
    showRangeSelection();
}

function showRangeSelection() {
    if (!Array.isArray(sourceQuestions) || sourceQuestions.length === 0) {
        setMessage('manifest-message', 'Выберите тест или загрузите .txt файл.', true);
        showScreen('library-screen');
        return;
    }

    document.getElementById('range-title').textContent = currentTestName || 'Выбор объёма';
    document.getElementById('range-summary').textContent =
        `Всего: ${formatQuestionCount(sourceQuestions.length)}`;
    setMessage('range-error', '');
    renderRangeOptions();
    showScreen('range-screen');
}

function getQuestionRangeOptions(total) {
    const mid = Math.ceil(total / 2);
    return [
        { id: 'all', label: 'Все вопросы', count: total },
        { id: 'first', label: 'Первая половина', count: mid },
        { id: 'second', label: 'Вторая половина', count: Math.max(total - mid, 0) }
    ];
}

function selectQuestionRange(allQuestions, rangeId) {
    const mid = Math.ceil(allQuestions.length / 2);

    if (rangeId === 'first') {
        return allQuestions.slice(0, mid);
    }

    if (rangeId === 'second') {
        return allQuestions.slice(mid);
    }

    return allQuestions.slice();
}

function renderRangeOptions() {
    const container = document.getElementById('range-options');
    if (!container) return;

    container.innerHTML = '';

    getQuestionRangeOptions(sourceQuestions.length).forEach(option => {
        const label = document.createElement('label');
        label.className = 'range-option';
        if (option.id === selectedRangeId) {
            label.classList.add('selected');
        }
        if (option.count === 0) {
            label.classList.add('disabled');
        }

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'question-range';
        input.value = option.id;
        input.checked = option.id === selectedRangeId;
        input.disabled = option.count === 0;
        input.addEventListener('change', () => {
            selectedRangeId = option.id;
            renderRangeOptions();
        });

        const text = document.createElement('span');
        text.className = 'range-label';
        text.textContent = option.label;

        const count = document.createElement('span');
        count.className = 'range-count';
        count.textContent = formatQuestionCount(option.count);

        label.appendChild(input);
        label.appendChild(text);
        label.appendChild(count);
        container.appendChild(label);
    });
}

function fileDisplayName(fileName) {
    return fileName.replace(/\.txt$/i, '').replace(/_/g, ' ');
}

function backToLibrary() {
    showScreen('library-screen');
}

/**
 * Выход из теста к списку — с подтверждением, чтобы случайным нажатием
 * не потерять прогресс текущего прохождения.
 */
function exitTestToLibrary() {
    const confirmed = window.confirm(
        'Выйти из теста? Прогресс текущего прохождения будет потерян.'
    );
    if (confirmed) {
        backToLibrary();
    }
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
            const parsed = parseLoadedQuestions(e.target.result);
            openRangeSelection(parsed, fileDisplayName(file.name));
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
    if (!Array.isArray(sourceQuestions) || sourceQuestions.length === 0) {
        setMessage('range-error', 'Файл не содержит вопросов', true);
        showScreen('range-screen');
        return;
    }

    questions = selectQuestionRange(sourceQuestions, selectedRangeId);

    if (!questions.length) {
        setMessage('range-error', 'В выбранном объёме нет вопросов', true);
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
    showScreen('test-screen');

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

    const progressValue = Math.round(((currentIndex + 1) / total) * 100);
    const progressBar = document.querySelector('.progress-bar');
    const progressFill = document.getElementById('progress-fill');
    if (progressBar) {
        progressBar.setAttribute('aria-valuenow', String(progressValue));
    }
    if (progressFill) {
        progressFill.style.width = `${progressValue}%`;
    }

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
    showScreen('results-screen');

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

        // Собираем через DOM/textContent — тексты вопросов и ответов из .txt
        // вставляются как текст, а не HTML (защита от XSS и от поломки на < > &).
        const buildRow = (className, labelText, valueText, strong) => {
            const row = document.createElement('div');
            row.className = className;
            const label = document.createElement(strong ? 'strong' : 'span');
            if (!strong) {
                label.className = 'label';
            }
            label.textContent = labelText;
            row.appendChild(label);
            row.appendChild(document.createTextNode(' ' + valueText));
            return row;
        };

        mistakes.forEach(m => {
            const div = document.createElement('div');
            div.className = 'mistake-item';
            div.appendChild(buildRow('mistake-question', `Вопрос ${m.questionNumber}:`, m.questionText, true));
            div.appendChild(buildRow('mistake-user', 'Ваш ответ:', m.userAnswer, false));
            div.appendChild(buildRow('mistake-correct', 'Правильный ответ:', m.correctAnswer, false));
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
    showRangeSelection();
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
    showScreen('test-screen');

    // Отображаем первый вопрос
    showQuestion();
}
