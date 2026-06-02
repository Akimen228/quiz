// ===================================================================
//  ПАРСЕР .txt ФАЙЛОВ И ОБЩИЕ ХЕЛПЕРЫ
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

function encodeManifestFilePath(filePath) {
    return filePath.split('/').map(part => encodeURIComponent(part)).join('/');
}

/**
 * Проверяет, что путь из манифеста ведёт к .txt внутри tests/
 * (защита от "..", абсолютных путей и внешних URL в битом manifest.json).
 */
function isSafeManifestPath(filePath) {
    if (typeof filePath !== 'string' || !filePath) return false;
    if (!filePath.startsWith('tests/')) return false;
    if (!/\.txt$/i.test(filePath)) return false;
    if (filePath.startsWith('/') || /^[a-z]+:/i.test(filePath)) return false;
    return filePath.split('/').every(seg => seg !== '' && seg !== '.' && seg !== '..');
}

function formatQuestionCount(count) {
    const abs = Math.abs(count) % 100;
    const last = abs % 10;

    if (abs > 10 && abs < 20) {
        return `${count} вопросов`;
    }
    if (last === 1) {
        return `${count} вопрос`;
    }
    if (last >= 2 && last <= 4) {
        return `${count} вопроса`;
    }
    return `${count} вопросов`;
}
