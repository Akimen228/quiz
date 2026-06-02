const SEARCH_MAX_RESULTS = 50;

const searchState = {
    searchIndex: [],
    currentResults: [],
    topCopyButton: null
};

const searchElements = {};

document.addEventListener('DOMContentLoaded', initializeSearchApp);

function initializeSearchApp() {
    searchElements.subjectScreen = document.getElementById('subject-screen');
    searchElements.searchScreen = document.getElementById('search-screen');
    searchElements.manifestMessage = document.getElementById('search-manifest-message');
    searchElements.subjectList = document.getElementById('subject-list');
    searchElements.backButton = document.getElementById('back-to-subjects');
    searchElements.subjectTitle = document.getElementById('selected-subject-title');
    searchElements.input = document.getElementById('search-input');
    searchElements.status = document.getElementById('search-status');
    searchElements.resultsList = document.getElementById('results-list');

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
}

function showSearchScreen(testName) {
    searchElements.subjectScreen.style.display = 'none';
    searchElements.searchScreen.style.display = 'block';
    searchElements.subjectTitle.textContent = testName;
    searchElements.input.value = '';
    renderSearchResults('');
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

    if (!tests.length) {
        setSearchMessage(searchElements.manifestMessage, 'Готовых тестов пока нет.');
        return;
    }

    setSearchMessage(searchElements.manifestMessage, '');

    const fragment = document.createDocumentFragment();
    tests.forEach(test => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'test-list-item';
        button.addEventListener('click', () => loadSubject(test));

        const title = document.createElement('span');
        title.className = 'test-title';
        title.textContent = test.name || test.file;

        const count = document.createElement('span');
        count.className = 'test-count';
        count.textContent = formatQuestionCount(test.count);

        button.appendChild(title);
        button.appendChild(count);
        fragment.appendChild(button);
    });

    searchElements.subjectList.appendChild(fragment);
}

async function loadSubject(test) {
    const testName = test.name || test.file;
    setSearchMessage(searchElements.manifestMessage, `Загружаем «${testName}»...`);

    try {
        if (!isSafeManifestPath(test.file)) {
            throw new ParserError('Некорректный путь к тесту в манифесте');
        }

        const response = await fetch(encodeManifestFilePath(test.file), { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const parsed = parseTxt(await response.arrayBuffer());
        searchState.searchIndex = buildSearchIndex(parsed);
        setSearchMessage(searchElements.manifestMessage, '');
        showSearchScreen(testName);
    } catch (err) {
        const message = err instanceof ParserError
            ? err.message
            : `Не удалось загрузить тест: ${err.message}`;
        setSearchMessage(searchElements.manifestMessage, message, true);
    }
}

function normalizeSearchText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^0-9a-zа-я]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function buildSearchIndex(questions) {
    return questions.map(item => {
        const answer = item.answers[item.correct_index];
        return {
            question: item.question,
            answer: answer,
            normQuestion: normalizeSearchText(item.question)
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
