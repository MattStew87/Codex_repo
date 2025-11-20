# AGENTS

These agents define task-specific processes for this repository. Invoke an agent by referencing its name (e.g., "Act as the Types Agent"). Each agent assumes work happens in this repo and should be followed in addition to global system instructions.

## General rules (all agents)
- Review this file and any nested `AGENTS.md` files in the target directories before editing.
- Keep frontend/back-end contracts in sync (see `docs/PROJECT_OVERVIEW.md` for context).
- Prefer small, scoped commits with clear messages; run relevant tests or explain why they were skipped.

## Agents

### 1) Types Agent
Purpose: Maintain shared typings/config schemas between Next.js frontend and FastAPI backend.

Workflow:
1. Locate types in `frontend/lib/types.ts` and matching Pydantic models in `backend/poster_schemas.py` (plus defaults in `backend/poster_defaults.py`).
2. Mirror field changes across both sides; keep discriminated unions aligned (`poster_type`, pie/bar/dual configs, bindings, highlights).
3. Update derived helpers/adapters (`frontend/app/api/ai-config/route.ts`, `backend/pine_poster_adapter.py`) and ensure invariants (time ranges, highlight structures, required images) remain valid.
4. Adjust tests or sample payloads (e.g., default fetch in `frontend/app/page.tsx`) to reflect type updates.
5. Document notable contract changes in `docs/PROJECT_OVERVIEW.md` or new docs as needed.

### 2) Frontend Agent
Purpose: Evolve the Next.js UI/UX while keeping data flow intact.

Workflow:
1. Identify the impacted component/page under `frontend/app` or `frontend/components`; check for shared hooks/utilities.
2. Preserve state flow patterns in `frontend/app/page.tsx` (poster type → config/binding state → render/AI/catalog calls).
3. Keep API route behavior compatible with the backend endpoints (`/poster/default`, `/poster/render`, upload routes) and AI/catalog helpers under `frontend/app/api/*`.
4. Follow existing styling/layout conventions (`app/layout.tsx`, `app/globals.css`, preview/editor panel split) and reuse editors (`PosterBaseFields`, poster-specific editors) when possible.
5. Update types and props to maintain type safety; ensure new UI paths still render valid poster configs.

### 3) Backend Agent
Purpose: Modify FastAPI endpoints and rendering pipeline safely.

Workflow:
1. Map changes to API surface in `backend/api.py`, ensuring Pydantic schema validation and CORS stay intact.
2. When altering render logic, propagate updates through `backend/pine_poster_adapter.py` and renderer entrypoint `backend/pine_poster.py` before touching chart modules (`graph_piechart.py`, `graph_group.py`, `graph_datetime.py`).
3. Preserve file system expectations for assets/uploads (`backend/graphs/templates`, `backend/graphs/tmp`, `backend/graphs/uploads`).
4. Keep defaults in sync with schema requirements (`backend/poster_defaults.py`), updating any demo data or palettes consistently.
5. Add/adjust logging and error handling around render steps when changing behavior; prefer deterministic outputs for previews.

### 4) Data/AI Agent
Purpose: Work on data catalog helpers and AI-assisted config generation.

Workflow:
1. For catalog discovery, start in `frontend/app/api/catalog/route.ts`; maintain streaming/JSONL parsing logic and S3 object paths.
2. For AI config updates, modify `frontend/app/api/ai-config/route.ts`, ensuring prompts enforce invariants (image fields, bindings, dual-axis defaults) and responses are normalized before returning to the client.
3. Align catalog snapshot shapes with `frontend/lib/types.ts` and ensure the main page’s loader in `frontend/app/page.tsx` still builds the expected schema tree.
4. Keep secrets out of the client; server-only environment usage should remain in API routes.

### 5) Documentation Agent
Purpose: Add or update project documentation.

Workflow:
1. Prefer `docs/` for repository-wide docs; keep `docs/PROJECT_OVERVIEW.md` in sync with meaningful architecture or contract changes.
2. Summarize behavior rather than duplicating code; link key modules and entrypoints so readers can navigate quickly.
3. When documenting endpoints or types, reference both frontend and backend sources to avoid drift.
