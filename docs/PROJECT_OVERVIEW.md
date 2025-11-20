# Project overview

## High-level structure
- **Purpose:** Pine Poster lets users configure pie, bar, and dual-axis charts, render them as branded PNG posters via a FastAPI backend, and explore AI-assisted chart configuration from a Next.js frontend.
- **Top-level layout:**
  - `backend/` – FastAPI API plus chart rendering pipeline (Pydantic schemas, defaults, matplotlib/Pillow renderers) and upload handling.
  - `frontend/` – Next.js app with poster editors, preview pane, AI helper, and catalog API routes backed by OpenAI and AWS S3.
  - `README.md` – Quickstart for running backend and frontend locally.

## Frontend (Next.js / React / TypeScript)
### Overall app structure
- **Entry/layout:** `app/layout.tsx` sets global fonts and wraps the app shell; `app/globals.css` holds shared styles.
- **Main page:** `app/page.tsx` runs on the client, orchestrating poster type selection, config state, bindings, rendering calls, and AI-assisted updates. It composes editor sections, preview, and chat panel.
- **API routes:**
  - `app/api/catalog/route.ts` lists schemas/tables/columns from S3 JSONL files to inform the AI assistant.
  - `app/api/ai-config/route.ts` proxies chart state to OpenAI (`gpt-5-nano`), enforces invariants (image fields, lengths, defaults), and normalizes binding shapes.
- **Shared types:** `lib/types.ts` defines poster configs, bindings, highlight shapes, chat payloads, and catalog snapshot structures shared across UI and API routes.
- **Components:** Form/editing widgets such as `PosterTypeSelect`, `PosterBaseFields`, `PiePosterEditor`, `BarPosterEditor`, `DualPosterEditor`, highlight and data-binding editors, preview (`PosterPreview`), AI chat panel (`ConfigChatPanel`), and `ThemeToggle` are under `components/`.

### Data flow and state management
- **Poster defaults:** `page.tsx` fetches `/poster/default` from the FastAPI backend when the poster type changes, normalizing dual configs to ensure `timeRange` is present.
- **User edits:** Local state (`useState`) stores the selected poster type, current config, binding state, catalog snapshot, errors, and loading flags; updates are passed down via `onChange`/`onBindingChange` props.
- **Rendering:** `page.tsx` posts the current config to `/poster/render`, receives a base64 PNG, and feeds it to `PosterPreview` for display/download.
- **Catalog loading:** On mount, `page.tsx` walks the `/api/catalog` endpoints (dbs → tables → columns) to build a schema snapshot for the AI helper, storing loading/error states separately.
- **AI assistance:** `ConfigChatPanel` collects chat history and posts poster state plus catalog snapshot to `/api/ai-config`; the route calls OpenAI and returns a complete config/binding update that the page applies atomically.

### Notable patterns
- **Config discrimination:** Poster editors and page-level helpers branch on `poster_type` to render the correct editor and enforce type-safe updates (`isPie/isBar/isDual`).
- **Bindings as first-class state:** `BindingState` keeps database bindings in sync with configs, with dedicated UI sections for pie/bar/dual bindings.
- **Invariant enforcement:** The AI route patches responses to preserve read-only image fields and fill dual-axis defaults, ensuring downstream UI/renderer compatibility.
- **Theming & UX:** A simple `ThemeToggle` and `globals.css` provide base styling; preview and chat panels are split into control and preview sections for clarity.

## Backend / Data / Infra (Python / FastAPI)
### Modules and responsibilities
- **API surface (`api.py`):** FastAPI app exposes poster defaults, poster rendering, and upload endpoints (center/label images) with CORS enabled for Next.js dev.
- **Schemas (`poster_schemas.py`):** Pydantic models validate poster configs (pie, bar, dual), normalize lengths, time ranges, and highlight structures.
- **Defaults (`poster_defaults.py`):** Provides canned demo configs for each poster type, including synthetic datasets and color palettes.
- **Adapter (`pine_poster_adapter.py`):** Bridges Pydantic configs to renderer calls, handling type-specific kwargs and converting highlight models to plain dicts.
- **Renderer entrypoint (`pine_poster.py`):** Dispatches to chart-specific renderers, validates required fields, and resolves template/layout options; manages graph/temp directories.
- **Chart renderers:**
  - `graph_piechart.py` renders pie posters with Matplotlib/Pillow, color palette helpers, label de-overlap, and optional center images.
  - `graph_group.py` and `graph_datetime.py` (plus supporting assets in `graphs/`) handle bar and dual/time-series charts.
- **Assets:** `graphs/templates` contains base poster templates; `graphs/tmp` and `graphs/uploads` hold generated images and user uploads.

### Data movement
- **Rendering pipeline:** API receives validated poster configs → adapter normalizes → `pine_poster` dispatches to specific renderer → PNG written to `backend/graphs` directories and returned as base64.
- **Uploads:** `/poster/upload/center-image` and `/poster/upload/label-images` persist user-provided images into scoped upload folders and return filesystem paths for configs.
- **Frontend catalog helper:** The Next.js catalog route streams S3 (`pinevisionarycloudstorage`) JSONL files, lists databases/tables, and samples column names by gunzipping lines to infer schema metadata.
- **AI config generation:** The Next.js AI route relays poster state to OpenAI and sends back normalized config/binding JSON for the UI.

### Infra/tooling
- **FastAPI + Uvicorn:** Local dev instructions in root `README.md` specify running `uvicorn api:app --reload --port 8000`.
- **Python deps:** `backend/requirements.txt` pins FastAPI, Matplotlib, Pillow, NumPy, Pydantic, etc., for rendering.
- **Next.js runtime:** Uses API routes for server-side calls to AWS and OpenAI; relies on `OPENAI_API_KEY` env var and AWS credentials available to the runtime.

## Relationships and flow
- **Frontend → Backend:** `app/page.tsx` fetches FastAPI endpoints for defaults and poster rendering; image uploads flow through backend upload endpoints when center/label images are added.
- **Shared contracts:** Type definitions in `frontend/lib/types.ts` mirror backend `poster_schemas.py` models, keeping poster configs and bindings aligned across layers.
- **AI & data catalog:** Frontend API routes (`app/api/ai-config`, `app/api/catalog`) run server-side to keep secrets off the client while feeding UI helpers and OpenAI prompts.
- **Storage paths:** Backend renderers and upload handlers read/write under `backend/graphs`, while frontend S3 access is read-only for catalog discovery.

## Potential improvements
### React/TypeScript
- Extract shared form logic for repeated title/subtitle/note fields into reusable hooks/components to reduce prop drilling across `PosterBaseFields` and poster editors.
- Introduce schema-driven form validation (e.g., Zod) to validate configs client-side before sending to FastAPI, aligning with backend Pydantic rules.
- Add global state (Context/Redux/Zustand) for poster config and bindings to simplify passing state through deeply nested editors and the chat panel.

### Python/ETL/Postgres
- Add structured logging and error handling around renderer functions (`graph_piechart.py`, `graph_group.py`, `graph_datetime.py`) to make render failures easier to diagnose.
- Validate uploaded files’ MIME/types and size limits in `api.py` before writing to disk, and add cleanup routines for `graphs/tmp` and `graphs/uploads` to avoid bloat.
- Factor shared palette/templating utilities into a module reused across renderers to reduce duplication and ensure consistent styling defaults.

### Overall architecture & DX
- Document data contracts between frontend types and backend schemas in a shared spec (e.g., under `docs/`) to avoid drift as fields evolve.
- Add docker-compose/devcontainer to launch FastAPI + Next.js together with stubbed AWS/OpenAI credentials for easier onboarding.
- Automate linting/formatting (ESLint/Prettier for frontend, Ruff/Black for backend) and include CI to catch schema or invariant regressions early.
