# pine_poster_adapter.py

from pathlib import Path

from poster_schemas import PosterConfig
from pine_poster import render_pine_poster


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
        )
        return Path(out)

    # This should be unreachable because PosterConfig is a union of the three.
    raise ValueError(f"Unsupported poster_type: {config.poster_type}")
