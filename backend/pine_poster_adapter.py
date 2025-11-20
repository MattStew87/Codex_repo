# pine_poster_adapter.py

import logging
from pathlib import Path

from poster_schemas import PosterConfig
from pine_poster import CENTER_UPLOAD_DIR, render_pine_poster


logger = logging.getLogger(__name__)


def _cleanup_center_image(center_image: str | None) -> None:
    if not center_image:
        return

    try:
        path = Path(center_image).resolve()
    except (TypeError, ValueError):
        logger.debug(
            "Skipping center image cleanup: invalid path",
            extra={"event": "center_cleanup_skipped", "center_image": str(center_image)},
        )
        return

    if CENTER_UPLOAD_DIR not in path.parents:
        return

    try:
        if path.exists():
            path.unlink()
            logger.info(
                "Deleted uploaded center image after render",
                extra={"event": "center_cleanup_success", "path": str(path)},
            )
    except OSError as exc:
        logger.warning(
            "Failed to delete uploaded center image",
            extra={
                "event": "center_cleanup_failed",
                "path": str(path),
                "error": str(exc),
            },
        )


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
        _cleanup_center_image(config.center_image)
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
        _cleanup_center_image(config.center_image)
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
        _cleanup_center_image(config.center_image)
        return Path(out)

    # This should be unreachable because PosterConfig is a union of the three.
    raise ValueError(f"Unsupported poster_type: {config.poster_type}")
