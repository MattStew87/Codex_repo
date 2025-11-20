# From repo root: /home/pine/Documents/png_creator_matt

########################################
# 1) Start backend (FastAPI)
########################################
cd backend

# (first time only – create venv and install deps)
python -m venv venv
source venv/bin/activate           # on Windows: .\venv\Scripts\activate
pip install -r requirements.txt

# run FastAPI
uvicorn api:app --reload --port 8000
# backend now at http://127.0.0.1:8000


########################################
# 2) Start frontend (Next.js)
#    (run in a SECOND terminal)
########################################
cd /home/pine/Documents/png_creator_matt/frontend

# (first time only – install deps)
npm install

# run dev server
npm run dev
# frontend now at http://localhost:3000
