# Python Backend

This is a minimal Flask backend. It is configured to run inside a local virtual environment and exposes a single `GET /` endpoint that returns a JSON greeting.

## Setup

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Running the server

With the virtual environment activated, start the development server:
```bash
flask --app app.main run --host 0.0.0.0 --port 8000
```
The API will be available at `http://localhost:8000/`.

## Running directly with Python

You can also run the module directly:
```bash
python -m app.main
```
