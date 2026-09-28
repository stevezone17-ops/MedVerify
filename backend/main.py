"""ASGI entrypoint forwarding to app.main:app.

This allows running both:
    uvicorn app.main:app --port 8001
and:
    uvicorn main:app --port 8001
"""

from app.main import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8001, reload=True)
