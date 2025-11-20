# pine_poster_adapter.py

import logging
from pathlib import Path
from typing import Iterable

from poster_schemas import PosterConfig
from pine_poster import CENTER_UPLOAD_DIR, LABEL_UPLOAD_DIR, render_pine_poster


logger = logging.getLogger(__name__)


def _safe_unlink(path_str: str | None, allowed_root: Path, event_prefix: str) -> bool:
    if not path_str:
        return False

    try:
        path = Path(path_str).resolve()
    except (TypeError, ValueError):
        logger.debug(
            "Skipping cleanup: invalid path",
            extra={
                "event": f"{event_prefix}_cleanup_skipped",
                "path": str(path_str),
            },
        )
        return False

    if allowed_root not in path.parents:
        logger.debug(
            "Skipping cleanup: outside allowed uploads dir",
            extra={
                "event": f"{event_prefix}_cleanup_outside_root",
                "path": str(path),
                "root": str(allowed_root),
            },
        )
        return False

    try:
        if path.exists():
            path.unlink()
            logger.info(
                "Deleted uploaded asset",
                extra={"event": f"{event_prefix}_cleanup_success", "path": str(path)},
            )
            return True
    except OSError as exc:
        logger.warning(
            "Failed to delete uploaded asset",
            extra={
                "event": f"{event_prefix}_cleanup_failed",
                "path": str(path),
                "error": str(exc),
            },
        )

    return False


def cleanup_uploads(
    *, center_image: str | None, label_images: Iterable[str | None] | None
) -> dict[str, int | bool]:
    """
    Delete uploaded assets that live under the known uploads directories.

    Returns a summary of what was removed.
    """

    deleted_center = _safe_unlink(center_image, CENTER_UPLOAD_DIR, "center")

    deleted_labels = 0
    for li in label_images or []:
        if _safe_unlink(li, LABEL_UPLOAD_DIR, "label"):
            deleted_labels += 1

    return {
        "center_deleted": deleted_center,
        "label_images_deleted": deleted_labels,
    }


def render_pine_poster_from_config(config: PosterConfig) -> Path:
    """
    Adapter from typed PosterConfig (Pydantic) -> actual PNG path.
    Returns an absolute Path to the output image.

    The concrete output filename is owned by the underlying chart helpers;
    we just pass configuration and return whatever Path they give back.
    """

    common_kwargs = {
        "poster_type": config.poster_type,
        "title": config.title,
        "subtitle": config.subtitle or "",
        "note_value": config.note_value or "",
        "template_name": config.template_name or "main",
        "date_str": config.date_str,
        "colors_hex": getattr(config, "colors_hex", None),
        "center_image": config.center_image,
    }

    if config.poster_type == "pie":
        out = render_pine_poster(
            **common_kwargs,
            labels=config.labels,
            values=config.values,
        )
        return Path(out)

    if config.poster_type == "bar":
        out = render_pine_poster(
            **common_kwargs,
            labels=config.labels,
            values=config.values,
            value_axis_label=config.value_axis_label,
            label_images=config.label_images,
            orientation=config.orientation,
        )
        return Path(out)

    if config.poster_type == "dual":
        # Convert highlights to plain dicts because the dual helper
        # uses .get(...) on each region/point.
        highlight_regions = (
            [hr.model_dump() for hr in config.highlight_regions]
            if config.highlight_regions
            else None
        )
        highlight_points = (
            [hp.model_dump() for hp in config.highlight_points]
            if config.highlight_points
            else None
        )

        out = render_pine_poster(
            **common_kwargs,
            x_values=config.x_values,
            y_series=config.y_series,
            ylabel_left=config.ylabel_left,
            log_left=config.log_left,
            include_zero_left=config.include_zero_left,
            left_series_type=config.left_series_type,
            right_series=config.right_series,
            right_color_hex=config.right_color_hex,
            ylabel_right=config.ylabel_right,
            right_series_type=config.right_series_type,
            log_right=config.log_right,
            include_zero_right=config.include_zero_right,
            highlight_regions=highlight_regions,
            highlight_points=highlight_points,
            time_range=config.time_range,
            time_bucket=config.time_bucket,
        )
        return Path(out)

    # This should be unreachable because PosterConfig is a union of the three.
    raise ValueError(f"Unsupported poster_type: {config.poster_type}")
