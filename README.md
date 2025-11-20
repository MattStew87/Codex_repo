# Full Stack Starter

This repository contains a minimal full stack setup with a Python backend and a Next.js frontend.

## Project structure

- `backend/`: Flask-based API with instructions for creating a local virtual environment.
- `frontend/`: Next.js app with a sample page and API route.

## Getting started

### Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment, then install dependencies:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. Run the server:
   ```bash
   flask --app app.main run --host 0.0.0.0 --port 8000
   ```

### Frontend
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

Both services can run concurrently on different ports (backend on `8000`, frontend on `3000`).
