from pathlib import Path
import base64

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from typing import List
import uuid

from poster_schemas import PosterConfig, PosterType
from poster_defaults import get_poster_default
from pine_poster_adapter import render_pine_poster_from_config
from pine_poster import CENTER_UPLOAD_DIR, LABEL_UPLOAD_DIR

app = FastAPI(title="Pine Poster API")

# Allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/poster/default")
def get_default(
    poster_type: PosterType = Query(..., description="One of: pie, bar, dual")
):
    cfg = get_poster_default(poster_type)
    return cfg.model_dump(by_alias=True)


@app.post("/poster/render")
def render_poster(config: PosterConfig):
    try:
        out_path: Path = render_pine_poster_from_config(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not out_path.exists():
        raise HTTPException(status_code=500, detail="Rendered file missing on disk")

    with out_path.open("rb") as f:
        img_bytes = f.read()

    b64 = base64.b64encode(img_bytes).decode("ascii")

    return {
        "ok": True,
        "image_base64": b64,
        "config_used": config.model_dump(by_alias=True),
    }


@app.post("/poster/upload/center-image")
async def upload_center_image(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    safe_name = f"center_{uuid.uuid4().hex}{suffix}"
    dest = CENTER_UPLOAD_DIR / safe_name

    content = await file.read()
    dest.write_bytes(content)

    # Return the absolute path to store in config.center_image
    return {"path": str(dest)}


@app.post("/poster/upload/label-images")
async def upload_label_images(files: List[UploadFile] = File(...)):
    """
    Accept multiple images at once and return a list of saved paths
    in the same order as the uploaded files.
    """
    saved_paths: list[str] = []

    for f in files:
        if not f.filename:
            continue
        suffix = Path(f.filename).suffix or ".png"
        dest = LABEL_UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"

        contents = await f.read()
        dest.write_bytes(contents)

        saved_paths.append(str(dest))

    if not saved_paths:
        raise HTTPException(status_code=400, detail="No files uploaded")

    return {"paths": saved_paths}


