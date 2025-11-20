# Project setup

Follow these steps from the repository root.

## 1) Start the backend (FastAPI)

```bash
cd backend

# first time only – create venv and install deps
python -m venv venv
source venv/bin/activate  # on Windows: .\\venv\\Scripts\\activate
pip install -r requirements.txt

# run FastAPI
uvicorn api:app --reload --port 8000
```

The backend will be available at http://127.0.0.1:8000.

## 2) Start the frontend (Next.js)

Run these commands in a second terminal:

```bash
cd frontend

# first time only – install deps
npm install

# run dev server
npm run dev
```

The frontend will be available at http://localhost:3000.
