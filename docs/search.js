const SEARCH_MAX_RESULTS = 50;

const searchState = {
    availableTests: [],
    selectedFiles: new Set(),
    searchIndex: [],
    currentResults: [],
    topCopyButton: null,
    activeTestCount: 0
};

const searchElements = {};

document.addEventListener('DOMContentLoaded', initializeSearchApp);

function initializeSearchApp() {
    searchElements.subjectScreen = document.getElementById('subject-screen');
    searchElements.searchScreen = document.getElementById('search-screen');
    searchElements.manifestMessage = document.getElementById('search-manifest-message');
    searchElements.subjectList = document.getElementById('subject-list');
    searchElements.searchSelectedButton = document.getElementById('search-selected-btn');
    searchElements.backButton = document.getElementById('back-to-subjects');
    searchElements.subjectTitle = document.getElementById('selected-subject-title');
    searchElements.input = document.getElementById('search-input');
    searchElements.status = document.getElementById('search-status');
    searchElements.resultsList = document.getElementById('results-list');

    searchElements.searchSelectedButton.addEventListener('click', loadSelectedSubjects);
    searchElements.backButton.addEventListener('click', showSubjectScreen);
    searchElements.input.addEventListener('input', handleSearchInput);
    searchElements.input.addEventListener('keydown', handleSearchKeydown);

    showSubjectScreen();
    loadSearchManifest();
}

function showSubjectScreen() {
    searchElements.subjectScreen.style.display = 'block';
    searchElements.searchScreen.style.display = 'none';
    searchElements.input.value = '';
    searchState.currentResults = [];
    searchState.topCopyButton = null;
    searchElements.resultsList.replaceChildren();
    updateSelectedSearchButton();
}

function showSearchScreen(title, warningText = '') {
    searchElements.subjectScreen.style.display = 'none';
    searchElements.searchScreen.style.display = 'block';
    searchElements.subjectTitle.textContent = title;
    searchElements.input.value = '';
    if (warningText) {
        searchElements.resultsList.replaceChildren();
        searchState.currentResults = [];
        searchState.topCopyButton = null;
        setSearchMessage(searchElements.status, warningText);
    } else {
        renderSearchResults('');
    }
    searchElements.input.focus();

    if (window.scrollTo) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function setSearchMessage(element, text, isError = false) {
    element.textContent = text;
    element.style.display = text ? 'block' : 'none';
    element.classList.toggle('error', isError);
    element.classList.toggle('message', !isError);
}

async function loadSearchManifest() {
    searchElements.subjectList.replaceChildren();
    setSearchMessage(searchElements.manifestMessage, 'Загружаем список тестов...');

    try {
        const response = await fetch('manifest.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const manifest = await response.json();
        const tests = Array.isArray(manifest.tests) ? manifest.tests : [];
        renderSubjectList(tests);
    } catch (err) {
        renderSubjectList([]);
        setSearchMessage(
            searchElements.manifestMessage,
            'Не удалось загрузить список тестов. Если вы открыли search.html двойным кликом, запустите локальный сервер или откройте сайт на GitHub Pages.',
            true
        );
    }
}

function renderSubjectList(tests) {
    searchElements.subjectList.replaceChildren();
    searchState.availableTests = tests;
    pruneSelectedFiles(tests);

    if (!tests.length) {
        setSearchMessage(searchElements.manifestMessage, 'Готовых тестов пока нет.');
        updateSelectedSearchButton();
        return;
    }

    setSearchMessage(searchElements.manifestMessage, '');

    const fragment = document.createDocumentFragment();
    tests.forEach(test => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'test-list-item';
        button.setAttribute('aria-pressed', searchState.selectedFiles.has(test.file) ? 'true' : 'false');
        button.addEventListener('click', () => toggleSubjectSelection(test, button));

        const mark = document.createElement('span');
        mark.className = 'test-select-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '✓';

        const title = document.createElement('span');
        title.className = 'test-title';
        title.textContent = test.name || test.file;

        const count = document.createElement('span');
        count.className = 'test-count';
        count.textContent = formatQuestionCount(test.count);

        button.appendChild(mark);
        button.appendChild(title);
        button.appendChild(count);
        fragment.appendChild(button);
    });

    searchElements.subjectList.appendChild(fragment);
    updateSelectedSearchButton();
}

function pruneSelectedFiles(tests) {
    const availableFiles = new Set(tests.map(test => test.file));
    searchState.selectedFiles.forEach(file => {
        if (!availableFiles.has(file)) {
            searchState.selectedFiles.delete(file);
        }
    });
}

function toggleSubjectSelection(test, button) {
    const file = test.file;
    if (searchState.selectedFiles.has(file)) {
        searchState.selectedFiles.delete(file);
        button.setAttribute('aria-pressed', 'false');
    } else {
        searchState.selectedFiles.add(file);
        button.setAttribute('aria-pressed', 'true');
    }

    updateSelectedSearchButton();
}

function updateSelectedSearchButton(isLoading = false) {
    const count = searchState.selectedFiles.size;
    searchElements.searchSelectedButton.textContent = isLoading
        ? 'Загружаем...'
        : `Искать (${count})`;
    searchElements.searchSelectedButton.disabled = isLoading || count === 0;
}

// На время загрузки блокируем переключатели тестов, чтобы выбор не менялся,
// пока строится индекс (иначе активный набор и подсветка могут рассинхронизироваться).
function setSubjectListDisabled(disabled) {
    searchElements.subjectList.querySelectorAll('.test-list-item').forEach(button => {
        button.disabled = disabled;
    });
}

function getSelectedTests() {
    return searchState.availableTests.filter(test => searchState.selectedFiles.has(test.file));
}

async function loadSelectedSubjects() {
    const selectedTests = getSelectedTests();
    if (!selectedTests.length) {
        updateSelectedSearchButton();
        return;
    }

    setSearchMessage(searchElements.manifestMessage, 'Загружаем выбранные тесты...');
    updateSelectedSearchButton(true);
    setSubjectListDisabled(true);

    let results;
    try {
        results = await Promise.all(selectedTests.map(loadSubject));
    } finally {
        setSubjectListDisabled(false);
    }
    const loaded = results.filter(result => result.ok);
    const failed = results.filter(result => !result.ok);

    updateSelectedSearchButton();

    if (!loaded.length) {
        searchState.searchIndex = [];
        searchState.activeTestCount = 0;
        setSearchMessage(
            searchElements.manifestMessage,
            `Не удалось загрузить выбранные тесты: ${formatLoadFailures(failed)}.`,
            true
        );
        return;
    }

    searchState.searchIndex = loaded.flatMap(result => buildSearchIndex(result.questions, result.testName));
    searchState.activeTestCount = loaded.length;

    const warningText = failed.length
        ? `Не удалось загрузить: ${formatLoadFailures(failed)}. Поиск идет по загруженным тестам.`
        : '';

    setSearchMessage(searchElements.manifestMessage, '');
    showSearchScreen(formatSelectedTestsTitle(loaded.map(result => result.testName)), warningText);
}

async function loadSubject(test) {
    const testName = test.name || test.file;

    try {
        if (!isSafeManifestPath(test.file)) {
            throw new ParserError('Некорректный путь к тесту в манифесте');
        }

        const response = await fetch(encodeManifestFilePath(test.file), { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return {
            ok: true,
            testName: testName,
            questions: parseTxt(await response.arrayBuffer())
        };
    } catch (err) {
        const message = err instanceof ParserError
            ? err.message
            : `Не удалось загрузить тест: ${err.message}`;
        return {
            ok: false,
            testName: testName,
            message: message
        };
    }
}

function formatLoadFailures(failedResults) {
    return failedResults
        .map(result => `«${result.testName}» (${result.message})`)
        .join(', ');
}

function formatSelectedTestsTitle(testNames) {
    if (testNames.length === 1) {
        return testNames[0];
    }
    if (testNames.length <= 3) {
        return testNames.join(', ');
    }
    return `Выбрано тестов: ${testNames.length}`;
}

function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^0-9a-zа-я]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function buildSearchIndex(questions, testName = '') {
    return questions.map(item => {
        const answer = item.answers[item.correct_index];
        return {
            question: item.question,
            answer: answer,
            normQuestion: normalizeSearchText(item.question),
            testName: testName
        };
    });
}

function searchEntries(entries, query) {
    const normQuery = normalizeSearchText(query);
    if (!normQuery) {
        return [];
    }

    const queryTokens = normQuery.split(' ').filter(Boolean);
    const scored = [];

    entries.forEach((entry, index) => {
        const phraseIndex = entry.normQuestion.indexOf(normQuery);
        const containsPhrase = phraseIndex !== -1;
        let matchedTokens = 0;

        queryTokens.forEach(token => {
            if (entry.normQuestion.includes(token)) {
                matchedTokens++;
            }
        });

        const allTokensMatch = matchedTokens === queryTokens.length;
        if (!containsPhrase && !allTokensMatch) {
            return;
        }

        let score = 0;
        if (phraseIndex === 0) {
            score += 3000;
        } else if (containsPhrase) {
            score += 2000 - Math.min(phraseIndex, 500);
        }
        if (allTokensMatch) {
            score += 1000;
        }
        score += (matchedTokens / queryTokens.length) * 100;

        scored.push({
            entry: entry,
            score: score,
            length: entry.normQuestion.length,
            index: index
        });
    });

    scored.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        if (a.length !== b.length) {
            return a.length - b.length;
        }
        return a.index - b.index;
    });

    return scored.map(item => item.entry);
}

function handleSearchInput() {
    renderSearchResults(searchElements.input.value);
}

function handleSearchKeydown(event) {
    if (event.key === 'Enter') {
        const topResult = searchState.currentResults[0];
        if (!topResult) {
            return;
        }

        event.preventDefault();
        copyAnswer(topResult.answer, searchState.topCopyButton);
    }
}

function renderSearchResults(query) {
    searchElements.resultsList.replaceChildren();
    searchState.topCopyButton = null;

    if (!normalizeSearchText(query)) {
        searchState.currentResults = [];
        setSearchMessage(searchElements.status, 'Начните вводить вопрос...');
        return;
    }

    const matches = searchEntries(searchState.searchIndex, query);
    searchState.currentResults = matches;

    if (!matches.length) {
        setSearchMessage(searchElements.status, 'Ничего не найдено');
        return;
    }

    const shown = matches.slice(0, SEARCH_MAX_RESULTS);
    if (matches.length > shown.length) {
        setSearchMessage(searchElements.status, `Показаны первые ${shown.length} из ${matches.length}.`);
    } else {
        setSearchMessage(searchElements.status, `Найдено: ${formatQuestionCount(matches.length)}.`);
    }

    const fragment = document.createDocumentFragment();
    shown.forEach((entry, index) => {
        fragment.appendChild(createResultCard(entry, index === 0));
    });
    searchElements.resultsList.appendChild(fragment);
}

function createResultCard(entry, isTopResult) {
    const card = document.createElement('article');
    card.className = 'search-result-card';
    if (isTopResult) {
        card.classList.add('top-result');
    }

    const question = document.createElement('div');
    question.className = 'result-question';
    question.textContent = entry.question;

    if (searchState.activeTestCount > 1 && entry.testName) {
        const source = document.createElement('div');
        source.className = 'result-source';
        source.textContent = entry.testName;
        card.appendChild(source);
    }

    const answerBox = document.createElement('div');
    answerBox.className = 'result-answer';

    const answerLabel = document.createElement('span');
    answerLabel.className = 'result-answer-label';
    answerLabel.textContent = 'Правильный ответ';

    const answerText = document.createElement('span');
    answerText.className = 'result-answer-text';
    answerText.textContent = entry.answer;

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'copy-btn';
    copyButton.textContent = 'Копировать';
    copyButton.addEventListener('click', () => copyAnswer(entry.answer, copyButton));

    if (isTopResult) {
        searchState.topCopyButton = copyButton;
    }

    answerBox.appendChild(answerLabel);
    answerBox.appendChild(answerText);
    card.appendChild(question);
    card.appendChild(answerBox);
    card.appendChild(copyButton);

    return card;
}

async function copyAnswer(answer, button) {
    try {
        await writeClipboardText(answer);
        showCopiedState(button);
    } catch (err) {
        setSearchMessage(searchElements.status, 'Не удалось скопировать ответ. Выделите ответ вручную.', true);
    }
}

async function writeClipboardText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (err) {
            // Небезопасный контекст или запрет браузера: пробуем старый путь ниже.
        }
    }

    fallbackCopyText(text);
}

function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } finally {
        document.body.removeChild(textarea);
    }

    if (!copied) {
        throw new Error('Copy command failed');
    }
}

function showCopiedState(button) {
    if (!button) {
        setSearchMessage(searchElements.status, 'Скопировано ✓');
        return;
    }

    const defaultText = button.dataset.defaultText || 'Копировать';
    button.dataset.defaultText = defaultText;
    button.textContent = 'Скопировано ✓';
    button.classList.add('copied');
    button.disabled = true;

    if (button.copyResetTimer) {
        window.clearTimeout(button.copyResetTimer);
    }

    button.copyResetTimer = window.setTimeout(() => {
        button.textContent = defaultText;
        button.classList.remove('copied');
        button.disabled = false;
    }, 1500);
}
