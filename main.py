"""
FastAPI сервер для веб-приложения тестирования.
"""

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from parser import parse_txt, ParserError

app = FastAPI(title="Викторина")

# Получаем путь к директории приложения
BASE_DIR = Path(__file__).resolve().parent

# Подключаем статические файлы
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def index():
    """Отдаёт главную страницу."""
    template_path = BASE_DIR / "templates" / "index.html"
    with open(template_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Принимает txt файл, парсит и возвращает JSON с вопросами.
    """
    # Проверяем расширение файла
    filename = (file.filename or "").lower()
    if not filename.endswith(".txt"):
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "Неверный формат файла. Загрузите файл .txt"
            }
        )

    try:
        content = await file.read()
        questions = parse_txt(content)

        return JSONResponse(content={
            "success": True,
            "questions": questions
        })

    except ParserError as e:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": str(e)
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": f"Внутренняя ошибка сервера: {str(e)}"
            }
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
