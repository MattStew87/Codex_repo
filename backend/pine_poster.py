# pine_poster.py

from graph_group import render_pine_poster_bar
from graph_datetime import render_pine_poster_dual
from graph_piechart import render_pine_poster_pie
from pathlib import Path


# ---------------------- File Helpers  ----------------------
BASE_DIR = Path(__file__).resolve().parent
GRAPHS_DIR = BASE_DIR / "graphs"
TEMPLATE_DIR = GRAPHS_DIR / "templates"
TMP_DIR = GRAPHS_DIR / "tmp"

GRAPHS_DIR.mkdir(parents=True, exist_ok=True)
TMP_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_TEMPLATE_PATH = TEMPLATE_DIR / "main_template.png"
DEFAULT_TEMPLATE_NAME = "main"

# -----------------------------------------------------------


def render_pine_poster(
    poster_type,
    title,
    subtitle="",
    note_value="",
    template_name: str = DEFAULT_TEMPLATE_NAME,
    date_str=None,
    colors_hex=None,
    # pie + bar
    labels=None,
    values=None,
    center_image=None,
    # bar-only
    value_axis_label="Volume (USD)",
    label_images=None,
    orientation="horizontal",  # "horizontal" | "vertical"
    # dual-only
    x_values=None,
    y_series=None,
    ylabel_left="",
    log_left=False,
    include_zero_left=True,
    left_series_type="line",   # "line" | "area" | "bar"
    right_series=None,
    right_color_hex="#8C3A3A",
    ylabel_right="",
    right_series_type="line",  # "line" | "area" | "bar"
    log_right=False,
    include_zero_right=True,
    highlight_regions=None,
    highlight_points=None,
    time_range="all",
):
    """
    Unified Pine poster entrypoint.

    poster_type:
        - "pie"  -> render_pine_poster_pie(...)
        - "bar"  -> render_pine_poster_bar(...)
        - "dual" -> render_pine_poster_dual(...)

    Keep this thin: poster_type selects the high-level chart family.
    More detailed behavior is controlled via:
      - orientation          (for bar)
      - left_series_type     (for dual left axis)
      - right_series_type    (for dual right axis)
    """

    pt = str(poster_type).lower().strip()

    # ---------- PIE ----------
    if pt == "pie":
        if labels is None or values is None:
            raise ValueError("For poster_type='pie', provide labels and values.")
        return render_pine_poster_pie(
            title=title,
            subtitle=subtitle,
            note_value=note_value,
            labels=labels,
            values=values,
            colors_hex=colors_hex,
            template_name=template_name,
            date_str=date_str,
            center_image=center_image,
        )

    # ---------- BAR ----------
    elif pt == "bar":
        if labels is None or values is None:
            raise ValueError("For poster_type='bar', provide labels and values.")

        bar_orientation = (orientation or "horizontal").lower()
        if bar_orientation not in ("horizontal", "vertical"):
            raise ValueError("orientation must be 'horizontal' or 'vertical'")

        return render_pine_poster_bar(
            title=title,
            subtitle=subtitle,
            note_value=note_value,
            labels=labels,
            values=values,
            colors_hex=colors_hex,
            template_name=template_name,
            date_str=date_str,
            center_image=center_image,
            value_axis_label=value_axis_label,
            label_images=label_images,
            orientation=bar_orientation,
        )

    # ---------- DUAL / OVER-TIME ----------
    elif pt == "dual":
        if x_values is None or y_series is None:
            raise ValueError("For poster_type='dual', provide x_values and y_series.")

        # Normalize series type strings mildly, but let the renderer validate further
        left_type = (left_series_type or "line").lower()
        right_type = (right_series_type or "line").lower()

        return render_pine_poster_dual(
            title=title,
            subtitle=subtitle,
            note_value=note_value,
            x_values=x_values,
            y_series=y_series,
            colors_hex=colors_hex,
            ylabel_left=ylabel_left,
            log_left=log_left,
            include_zero_left=include_zero_left,
            chart_type=left_type,
            right_series=right_series,
            right_color_hex=right_color_hex,
            ylabel_right=ylabel_right,
            right_chart_type=right_type,
            log_right=log_right,
            include_zero_right=include_zero_right,
            template_name=template_name,
            highlight_regions=highlight_regions,
            highlight_points=highlight_points,
            date_str=date_str,
            center_image=center_image,
            time_range=time_range,
        )

    else:
        raise ValueError("poster_type must be one of: 'pie', 'bar', 'dual'")
