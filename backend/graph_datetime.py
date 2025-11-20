# pine_overlay_chart_dual_axis_optional_right_highlight_points.py

from collections import OrderedDict
from PIL import Image, ImageDraw, ImageFont
import matplotlib.pyplot as plt
import matplotlib as mpl
import matplotlib.dates as mdates
import matplotlib.ticker as mticker
import numpy as np
from datetime import datetime, timedelta, timezone
from dateutil import parser as dateparser
from matplotlib.font_manager import FontProperties
import os
import io
import urllib.request
from pathlib import Path
import logging


# ---------------------- File Helpers  ----------------------
BASE_DIR = Path(__file__).resolve().parent
GRAPHS_DIR = BASE_DIR / "graphs"
TEMPLATE_DIR = GRAPHS_DIR / "templates"
TMP_DIR = GRAPHS_DIR / "tmp"

GRAPHS_DIR.mkdir(parents=True, exist_ok=True)
TMP_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_TEMPLATE_PATH = TEMPLATE_DIR / "main_template.png"
DEFAULT_TEMPLATE_NAME = "main"
DEFAULT_OUTPUT_PATH = GRAPHS_DIR / "pine_poster_datetime.png"


logger = logging.getLogger(__name__)


def _time_range_to_timedelta(r: str):
    if r == "7d":
        return timedelta(days=7)
    if r == "30d":
        return timedelta(days=30)
    if r == "90d":
        return timedelta(days=90)
    if r == "180d":
        return timedelta(days=180)
    if r == "1y":
        return timedelta(days=365)
    return None


def _normalize_datetime_to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def apply_time_range(xs, left_series_dict, right_series, time_range: str):
    """
    xs: list[datetime]
    left_series_dict: dict[str, list[float]] from y_series (all same length)
    right_series: list[float] or None
    time_range: one of the TimeRange values
    """

    if not xs:
        return xs, left_series_dict, right_series

    dt = _time_range_to_timedelta(time_range)
    if dt is None:
        return xs, left_series_dict, right_series

    max_ts = max(xs)
    start_ts = max_ts - dt

    keep_indices = [i for i, x in enumerate(xs) if x >= start_ts]

    if not keep_indices:
        return xs, left_series_dict, right_series

    def _filter_list(lst):
        return [lst[i] for i in keep_indices]

    xs_f = _filter_list(xs)

    left_filtered = {key: _filter_list(vals) for key, vals in left_series_dict.items()}

    if right_series is not None:
        right_filtered = _filter_list(right_series)
    else:
        right_filtered = None

    return xs_f, left_filtered, right_filtered


def _bucket_start(dt: datetime, time_bucket: str) -> datetime | None:
    bucket = (time_bucket or "none").lower()

    if bucket in ("none", "off", "all"):
        return None

    if bucket == "7d":
        base = dt - timedelta(days=dt.weekday())
        return datetime(base.year, base.month, base.day)

    if bucket == "30d":
        return datetime(dt.year, dt.month, 1)

    if bucket == "90d":
        quarter_start_month = 3 * ((dt.month - 1) // 3) + 1
        return datetime(dt.year, quarter_start_month, 1)

    if bucket == "180d":
        half_year_month = 1 if dt.month <= 6 else 7
        return datetime(dt.year, half_year_month, 1)

    if bucket == "1y":
        return datetime(dt.year, 1, 1)

    return None


def apply_time_bucket(xs, left_series_dict, right_series, time_bucket: str):
    """Aggregate datetime-series points into requested time buckets."""

    if not xs:
        return xs, left_series_dict, right_series

    bucket_labels = [_bucket_start(x, time_bucket) for x in xs]
    if all(b is None for b in bucket_labels):
        return xs, left_series_dict, right_series

    labels = list(left_series_dict.keys())
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    buckets = OrderedDict()

    for idx in order:
        b_start = bucket_labels[idx]
        if b_start is None:
            return xs, left_series_dict, right_series

        bucket = buckets.get(b_start)
        if bucket is None:
            bucket = {
                "left": {label: 0.0 for label in labels},
                "right": 0.0 if right_series is not None else None,
            }
            buckets[b_start] = bucket

        for label in labels:
            bucket["left"][label] += float(left_series_dict[label][idx])

        if right_series is not None and bucket["right"] is not None:
            bucket["right"] += float(right_series[idx])

    xs_bucketed = list(buckets.keys())
    left_bucketed = {
        label: [bucket["left"][label] for bucket in buckets.values()]
        for label in labels
    }

    right_bucketed = None
    if right_series is not None:
        right_bucketed = [bucket["right"] for bucket in buckets.values()]

    return xs_bucketed, left_bucketed, right_bucketed

def _resolve_template_path(template_name: str) -> Path:
    """
    Map a simple template name to a template PNG filename.

    For now:
      "main" -> main_template.png

    Later you can add:
      "dark" -> dark_template.png
      "alt"  -> alt_template.png
    """
    name = (template_name or DEFAULT_TEMPLATE_NAME).strip().lower()

    # simple convention: <name>_template.png
    candidate = TEMPLATE_DIR / f"{name}_template.png"
    if candidate.exists():
        return candidate

    # fallback to main if missing
    return DEFAULT_TEMPLATE_PATH



# ----------------------- font helper -----------------------
def _pick_font(path_candidates, size):
    for p in path_candidates or []:
        if p and os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    for name in ["Courier Prime.ttf", "Courier New.ttf", "DejaVuSansMono.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()

# ------------------ color helpers --------------------------
def _hex_to_rgb01(hexstr):
    h = hexstr.strip().lstrip("#")
    return tuple(int(h[i:i+2], 16)/255 for i in (0,2,4))

def _rgb01_to_hex(rgb):
    return "#{:02X}{:02X}{:02X}".format(*(int(round(c*255)) for c in rgb))

def _mix(rgb, to=(1,1,1), t=0.0):
    return tuple((1-t)*rgb[i] + t*to[i] for i in range(3))

def _palette_from_base(base_hex, n):
    base = _hex_to_rgb01(base_hex)
    if n <= 1:
        return [_rgb01_to_hex(base)]
    colors = []
    for i in range(n):
        if i == 0:
            colors.append(_rgb01_to_hex(base))
        elif i % 2 == 1:
            t = min(0.15 + 0.12*(i//2), 0.6)
            colors.append(_rgb01_to_hex(_mix(base, (1,1,1), t)))
        else:
            t = min(0.12 + 0.10*((i-1)//2), 0.6)
            colors.append(_rgb01_to_hex(_mix(base, (0,0,0), t)))
    return colors

# ------------------ compact number fmt ---------------------
def human_format(num):
    n = float(num); a = abs(n)
    if a >= 1_000_000_000_000: return f"{n/1_000_000_000_000:.1f}T"
    if a >= 1_000_000_000:     return f"{n/1_000_000_000:.1f}B"
    if a >= 1_000_000:         return f"{n/1_000_000:.1f}M"
    if a >= 1_000:             return f"{n/1_000:.1f}K"
    return f"{n:.0f}"

# -------- smarter formatter that chooses decimals per axis --------
def _smart_human_format(value, axis_range=None):
    v = float(value)
    if v == 0:
        return "0"

    abs_v = abs(v)

    if axis_range is None:
        return human_format(v)

    lo, hi = axis_range
    span = abs(hi - lo) if hi is not None and lo is not None else None

    if abs_v >= 1_000_000_000_000:
        scale = 1_000_000_000_000.0; suffix = "T"
    elif abs_v >= 1_000_000_000:
        scale = 1_000_000_000.0; suffix = "B"
    elif abs_v >= 1_000_000:
        scale = 1_000_000.0; suffix = "M"
    elif abs_v >= 1_000:
        scale = 1_000.0; suffix = "K"
    else:
        scale = 1.0; suffix = ""

    scaled = v / scale

    decimals = 0
    if span is not None:
        span_scaled = span / scale
        if scale >= 1_000_000_000:
            decimals = 0 if span_scaled > 20 else 1
        elif scale >= 1_000_000:
            decimals = 0 if span_scaled > 50 else 1
        elif scale >= 1_000:
            if span_scaled > 50:
                decimals = 0
            elif span_scaled > 10:
                decimals = 1
            else:
                decimals = 2
        else:
            if span > 100:
                decimals = 0
            elif span > 10:
                decimals = 1
            else:
                decimals = 2
    else:
        decimals = 1 if scale >= 1_000 else 2

    if decimals > 0 and abs(scaled - round(scaled)) < 0.05:
        decimals = 0

    if decimals == 0:
        return f"{int(round(scaled))}{suffix}"
    else:
        return f"{scaled:.{decimals}f}{suffix}"

# -------------- tick helpers (for both axes) ----------------
def _set_linear_ticks(ax, data_arrays, include_zero=True, pad_frac=0.22):
    ymin_data = float(min(np.min(s) for s in data_arrays))
    ymax_data = float(max(np.max(s) for s in data_arrays))

    if ymin_data == ymax_data:
        if ymin_data == 0:
            ymin_data = -0.5
            ymax_data = 0.5
        else:
            ymin_data *= 0.9
            ymax_data *= 1.1

    ymin = ymin_data
    ymax = ymax_data

    if include_zero:
        if ymin > 0:
            ymin = 0.0
        elif ymax < 0:
            ymax = 0.0

    span = ymax - ymin
    if span <= 0:
        if ymax == 0:
            ymin = -1.0
            ymax = 1.0
        else:
            ymin = ymin * 0.9
            ymax = ymax * 1.1
        span = ymax - ymin

    zero_in_range = (ymin <= 0 <= ymax)

    if zero_in_range:
        pad_top = pad_frac * span
        ymax = ymax + pad_top
    else:
        pad = pad_frac * span
        ymin = ymin - pad
        ymax = ymax + pad

    ax.set_ylim(ymin, ymax)
    axis_range = (ymin, ymax)

    ax.yaxis.set_major_locator(mticker.AutoLocator())
    ax.yaxis.set_minor_locator(mticker.NullLocator())
    ax.yaxis.set_major_formatter(
        mticker.FuncFormatter(lambda v, p: _smart_human_format(v, axis_range))
    )
    ax.yaxis.get_offset_text().set_visible(False)

def _set_log_ticks(ax, data_arrays, pad_frac=0.22):
    ax.set_yscale('log')

    positive_mins = []
    for s in data_arrays:
        pos_vals = s[s > 0]
        if len(pos_vals) > 0:
            positive_mins.append(np.min(pos_vals))
    if not positive_mins:
        raise ValueError("Log axis requires positive values.")

    ymin = float(min(positive_mins))
    ymax = float(max(np.max(s) for s in data_arrays if np.any(s > 0)))
    if ymin <= 0:
        ymin = 1e-6
    if ymin == ymax:
        ymin /= 10.0
        ymax *= 10.0

    span = ymax - ymin
    if span <= 0:
        ymax = ymax * (1.0 + pad_frac)
    else:
        ymax = ymax + pad_frac * span

    ax.set_ylim(ymin, ymax)
    axis_range = (ymin, ymax)

    locator = mticker.LogLocator(base=10.0, subs=(1.0, 2.0, 5.0))
    ax.yaxis.set_major_locator(locator)
    ax.yaxis.set_minor_locator(mticker.NullLocator())
    ax.yaxis.set_major_formatter(
        mticker.FuncFormatter(lambda v, p: _smart_human_format(v, axis_range))
    )
    ax.yaxis.get_offset_text().set_visible(False)


# ------------------ image helpers --------------------------
def _load_image(path_or_url):
    if not path_or_url:
        return None
    try:
        if isinstance(path_or_url, str) and path_or_url.startswith(("http://", "https://")):
            with urllib.request.urlopen(path_or_url) as resp:
                data = resp.read()
            img = Image.open(io.BytesIO(data)).convert("RGBA")
        else:
            img = Image.open(path_or_url).convert("RGBA")
        return img
    except Exception as e:
        print("⚠️ Could not load image:", path_or_url, "error:", e)
        return None

# ----------------------- main render -----------------------
def _render_pine_poster_dual_impl(
    title,
    subtitle,
    note_value,
    x_values,
    y_series,
    colors_hex=None,
    ylabel_left="",
    log_left=False,
    include_zero_left=True,
    chart_type="line",
    right_series=None,
    right_color_hex="#8C3A3A",
    ylabel_right="",
    right_chart_type="line",
    log_right=False,
    include_zero_right=True,
    template_name: str = DEFAULT_TEMPLATE_NAME,
    highlight_regions=None,
    highlight_points=None,
    date_str=None,
    center_image=None,
    time_range="all",
    time_bucket="none",
):
    
    out_path = DEFAULT_OUTPUT_PATH
    template_path = _resolve_template_path(template_name)


    dpi = 300
    line_width = 1.1
    base_color_hex = "#1C5C3D"
    area_alpha = 0.18

    # --- normalize LEFT series ---
    dict_input = isinstance(y_series, dict)
    if dict_input:
        left_labels = list(y_series.keys())
        Y_left = [np.array(list(y_series[k]), dtype=float) for k in left_labels]
    else:
        if hasattr(y_series, "__iter__") and not isinstance(
            y_series[0], (list, tuple, np.ndarray)
        ):
            Y_left = [np.array(list(y_series), dtype=float)]
            left_labels = ["Series"]
        else:
            Y_left = [np.array(list(s), dtype=float) for s in y_series]
            left_labels = [f"S{i+1}" for i in range(len(Y_left))]

    if not Y_left:
        raise ValueError("y_series must contain at least one series.")
    L = len(Y_left[0])
    if any(len(s) != L for s in Y_left):
        raise ValueError("All left-axis series must have the same length.")

    # --- normalize RIGHT series ---
    Y_right = None
    if right_series is not None:
        Y_right = [np.array(list(right_series), dtype=float)]
        if len(Y_right[0]) != L:
            raise ValueError("right_series must have the same length as left y_series.")

    # --- basic log guards ---
    if log_left:
        for s in Y_left:
            if np.any(s <= 0):
                raise ValueError("log_left=True requires all left y > 0.")
    if log_right and Y_right is not None:
        for s in Y_right:
            if np.any(s <= 0):
                raise ValueError("log_right=True requires all right y > 0.")

    # --- colors for LEFT ---
    n_left = len(Y_left)
    if colors_hex is None:
        palette_left = _palette_from_base(base_color_hex, n_left)
    elif isinstance(colors_hex, str):
        palette_left = [colors_hex] * n_left
    else:
        if len(colors_hex) != n_left:
            raise ValueError(
                f"colors_hex must have exactly one color per left series "
                f"(got {len(colors_hex)} colors for {n_left} series)."
            )
        palette_left = list(colors_hex)

    # --- template/layout ---
    template = Image.open(template_path).convert("RGBA")
    W, H = template.size

    mpl.rcParams.update({
        "font.family": "monospace",
        "font.monospace": ["Courier Prime", "Courier New",
                           "DejaVuSansMono", "Liberation Mono", "monospace"]
    })

    left_margin = int(0.096 * W)
    right_margin = int(0.062 * W)
    title_y = int(0.038 * H)
    subtitle_y = int(0.09 * H)
    footer_label_x = int(0.09 * W)
    footer_value_x = footer_label_x + int(0.07 * W)
    date_y = int(0.86 * H)
    note_y = int(0.895 * H)
    chart_top = int(0.15 * H)
    chart_bottom = int(0.90 * H)
    chart_left = footer_value_x - 229
    chart_right = W - right_margin + 60
    chart_width = chart_right - chart_left
    chart_height = chart_bottom - chart_top

    # --- fonts/canvas ---
    title_font = _pick_font([None, None], int(0.045 * H))
    subtitle_font = _pick_font([None, None], int(0.022 * H))
    footer_font = _pick_font([None, None], int(0.017 * H))

    base_ylabel_size = int(0.01 * H)
    base_tick_size = int(0.005 * H)

    ylabel_font_size = max(6, base_ylabel_size - 2.5)
    tick_font_size = max(6, base_tick_size + 2)
    legend_font_size = max(6, int(0.008 * H))

    canvas = template.copy()
    draw = ImageDraw.Draw(canvas)
    if title:
        for dx, dy in [(0,0),(1,0),(0,1)]:
            draw.text((left_margin+dx, title_y+dy), title,
                      fill=(0,0,0,255), font=title_font)
    if subtitle:
        draw.text((left_margin, subtitle_y), subtitle,
                  fill=(0,0,0,255), font=subtitle_font)

    # --- x parsing (shared) ---
    x_is_date = False

    def _parse_x_values(vals):
        parsed_dt = []
        for xv in vals:
            if isinstance(xv, datetime):
                dt = xv
            else:
                dt = dateparser.parse(str(xv))
            if not isinstance(dt, datetime):
                raise ValueError("x_values entries must be datetime-like or numeric")
            parsed_dt.append(_normalize_datetime_to_naive_utc(dt))
        return parsed_dt

    def _looks_like_datetime(vals):
        for xv in vals:
            if isinstance(xv, datetime):
                return True
            if isinstance(xv, str):
                if any(tok in xv for tok in ("-", "/", "T", ":")):
                    return True
            # Also treat pandas/NumPy datetime64 by string inspection
            if hasattr(xv, "dtype") and "datetime" in str(getattr(xv, "dtype", "")):
                return True
        return False

    def _all_numeric(vals):
        try:
            [float(v) for v in vals]
            return True
        except Exception:
            return False

    if x_values is None:
        X = list(range(1, L + 1))
    else:
        vals_list = list(x_values)
        if _looks_like_datetime(vals_list):
            try:
                X = _parse_x_values(vals_list)
                x_is_date = True
            except Exception as exc:
                raise ValueError(
                    "x_values must be parseable datetimes for time-series charts"
                ) from exc
        elif _all_numeric(vals_list):
            X = [float(v) for v in vals_list]
            x_is_date = False
        else:
            try:
                X = _parse_x_values(vals_list)
                x_is_date = True
            except Exception as exc:
                raise ValueError(
                    "x_values must be parseable datetimes or numeric values"
                ) from exc

    N = len(Y_left[0])

    if x_is_date:
        left_series_dict = {
            label: list(series) for label, series in zip(left_labels, Y_left)
        }
        right_list = Y_right[0].tolist() if Y_right is not None else None

        X, left_series_dict, right_list = apply_time_range(
            X, left_series_dict, right_list, time_range
        )
        X, left_series_dict, right_list = apply_time_bucket(
            X, left_series_dict, right_list, time_bucket
        )

        left_labels = list(left_series_dict.keys())
        Y_left = [np.array(vals, dtype=float) for vals in left_series_dict.values()]
        if right_list is not None and Y_right is not None:
            Y_right = [np.array(right_list, dtype=float)]
        else:
            Y_right = None

        L = len(Y_left[0])
        N = L

    if x_is_date:
        x_num = mdates.date2num(X)
        x_plot = x_num
    else:
        try:
            x_plot = np.array(X, dtype=float)
        except Exception as exc:
            raise ValueError(
                "x_values must be numeric when not parsed as datetimes"
            ) from exc

    # helper to convert highlight x to same scale
    def _to_x_plot(val):
        if x_is_date:
            if isinstance(val, datetime):
                return mdates.date2num(val)
            else:
                return mdates.date2num(dateparser.parse(str(val)))
        else:
            return float(val)

    # --- shared step & bar width (so both axes match) ---
    if len(x_plot) > 1:
        base_step = float(np.diff(x_plot).mean())
    else:
        base_step = 0.8
    left_bar_width = base_step * 0.8
    right_bar_width = left_bar_width   # same thickness for right bars

    # --- figure/axes ---
    fig_h_inches = chart_height / dpi
    fig_w_inches = chart_width / dpi
    fig = plt.figure(figsize=(fig_w_inches, fig_h_inches), dpi=dpi)
    ax_left = fig.add_subplot(111)
    fig.patch.set_alpha(0.0)
    ax_left.set_facecolor((1,1,1,0))

    ax_right = None
    if Y_right is not None:
        ax_right = ax_left.twinx()

    # Track stacking mode for point placement
    stack_mode_left = "none"      # "none" | "area" | "bar"
    cum_stack_left = None         # for area

    # ---------------- LEFT AXIS PLOTTING --------------------
    ct_left = chart_type.lower().strip()
    tick_arrays_left = Y_left  # default

    if ct_left == "line":
        for s, col, lab in zip(Y_left, palette_left, left_labels):
            ax_left.plot(
                x_plot,
                s,
                linewidth=line_width,
                color=_hex_to_rgb01(col),
                label=lab
            )
        ax_left.margins(x=0, y=0)
        ax_left.set_xlim(x_plot[0], x_plot[-1])

    elif ct_left == "area":
        rgb_cols = [_hex_to_rgb01(c) for c in palette_left]
        ax_left.stackplot(
            x_plot,
            *Y_left,
            colors=rgb_cols,
            alpha=area_alpha,
            labels=left_labels,
            linewidth=0.0
        )
        cum = np.row_stack(Y_left).cumsum(axis=0)
        for s, col in zip(cum, palette_left):
            ax_left.plot(
                x_plot,
                s,
                color=_hex_to_rgb01(col),
                linewidth=max(0.9, line_width-0.3)
            )
        ax_left.margins(x=0, y=0)
        ax_left.set_xlim(x_plot[0], x_plot[-1])
        tick_arrays_left = [cum[-1]]

        stack_mode_left = "area"
        cum_stack_left = cum

    elif ct_left == "bar":
        bottom_vals = np.zeros(N, dtype=float)
        for s, col, lab in zip(Y_left, palette_left, left_labels):
            ax_left.bar(
                x_plot,
                s,
                width=left_bar_width,
                bottom=bottom_vals,
                color=_hex_to_rgb01(col),
                align="center",
                label=lab,
                alpha=0.55,
            )
            bottom_vals += s
        ax_left.set_xlim(x_plot[0] - left_bar_width/2, x_plot[-1] + left_bar_width/2)
        ax_left.margins(x=0, y=0)
        tick_arrays_left = [bottom_vals]

        stack_mode_left = "bar"

    else:
        raise ValueError("chart_type must be one of: 'line', 'bar', 'area'")

    # ---------------- RIGHT AXIS PLOTTING -------------------
    if ax_right is not None:
        right_color = _hex_to_rgb01(right_color_hex)
        sR = Y_right[0]
        ct_r = right_chart_type.lower().strip()

        if ct_r == "line":
            ax_right.plot(
                x_plot,
                sR,
                linewidth=line_width,
                color=right_color,
                label=ylabel_right or "Right"
            )
        elif ct_r == "area":
            baseline = 0.0 if (not log_right and sR.min() >= 0) else (sR.min() * 0.999 if log_right else 0.0)
            ax_right.fill_between(
                x_plot,
                baseline,
                sR,
                color=right_color,
                alpha=area_alpha
            )
            ax_right.plot(
                x_plot,
                sR,
                linewidth=line_width,
                color=right_color,
                label=ylabel_right or "Right"
            )
        elif ct_r == "bar":
            ax_right.bar(
                x_plot,
                sR,
                width=right_bar_width,
                color=right_color,
                align="center",
                label=ylabel_right or "Right",
                alpha=0.55,
            )
        else:
            raise ValueError("right_chart_type must be one of: 'line', 'bar', 'area'")

    # ---------------- HIGHLIGHT REGIONS (BANDS) -------------------
    if highlight_regions:
        for region in highlight_regions:
            start_raw = region.get("start")
            end_raw = region.get("end")
            band_label = region.get("label", "")

            if start_raw is None or end_raw is None:
                continue

            x_start = _to_x_plot(start_raw)
            x_end = _to_x_plot(end_raw)
            if x_end < x_start:
                x_start, x_end = x_end, x_start

            ax_left.axvspan(
                x_start,
                x_end,
                facecolor=(0.55, 0.65, 0.95, 0.25),  # darker blue & a bit more opaque
                edgecolor=(0.30, 0.40, 0.70, 0.9),   # dark border
                linewidth=0.5,
                zorder=0.1,
            )

            if band_label:
                x_center = 0.5 * (x_start + x_end)
                ax_left.text(
                    x_center,
                    0.02,
                    band_label,
                    transform=ax_left.get_xaxis_transform(),
                    ha="center",
                    va="bottom",
                    fontsize=max(6, tick_font_size),
                    fontweight="bold",
                    color="#1f2933",
                    zorder=3,
                )

    # ---------------- HIGHLIGHT POINTS -------------------
    if highlight_points:
        for pt in highlight_points:
            x_raw = pt.get("x")
            series_key = pt.get("series", 0)  # label or index
            label_text = pt.get("label", "")
            axis_side = pt.get("axis", "left").lower()

            if x_raw is None:
                continue

            x_val = _to_x_plot(x_raw)
            idx_x = int(np.argmin(np.abs(x_plot - x_val)))

            if axis_side == "right" and ax_right is not None and Y_right is not None:
                # right axis (single series)
                y_arr = Y_right[0]
                if idx_x < 0 or idx_x >= len(y_arr):
                    continue
                x_point = x_plot[idx_x]
                y_point = y_arr[idx_x]
                color = _hex_to_rgb01(right_color_hex)
                ax = ax_right
            else:
                # left axis
                if isinstance(series_key, str):
                    if series_key in left_labels:
                        s_idx = left_labels.index(series_key)
                    else:
                        s_idx = 0
                else:
                    try:
                        s_idx = int(series_key)
                    except Exception:
                        s_idx = 0
                    if s_idx < 0 or s_idx >= len(Y_left):
                        s_idx = 0

                if idx_x < 0 or idx_x >= len(Y_left[s_idx]):
                    continue

                x_point = x_plot[idx_x]

                # --- stacked-aware y value ---
                if stack_mode_left == "area" and cum_stack_left is not None:
                    # top of this series's layer
                    y_point = cum_stack_left[s_idx, idx_x]
                elif stack_mode_left == "bar":
                    # top of this series's bar segment in the stack
                    y_point = sum(Y_left[i][idx_x] for i in range(s_idx + 1))
                else:
                    # plain line / non-stacked
                    y_point = Y_left[s_idx][idx_x]

                color = _hex_to_rgb01(palette_left[s_idx])
                ax = ax_left

            # draw circled marker
            ax.scatter(
                [x_point],
                [y_point],
                s=45,
                facecolors=(1, 1, 1, 1),
                edgecolors=color,
                linewidths=1.4,
                zorder=4,
            )

            if label_text:
                ax.annotate(
                    label_text,
                    xy=(x_point, y_point),
                    xycoords="data",
                    xytext=(6, 6),
                    textcoords="offset points",
                    ha="left",
                    va="bottom",
                    fontsize=max(6, tick_font_size),
                    fontweight="bold",
                    color="#111111",   # black label text
                    zorder=4,
                )

    # ---------------- AXIS SCALES & TICKS -------------------
    if log_left:
        _set_log_ticks(ax_left, tick_arrays_left, pad_frac=0.22)
    else:
        _set_linear_ticks(ax_left, tick_arrays_left, include_zero=include_zero_left, pad_frac=0.22)

    if ax_right is not None:
        if log_right:
            _set_log_ticks(ax_right, Y_right, pad_frac=0.22)
        else:
            _set_linear_ticks(ax_right, Y_right, include_zero=include_zero_right, pad_frac=0.22)
        ax_right.tick_params(axis='y', labelsize=tick_font_size, length=2, pad=2)

    # X axis formatting
    if x_is_date:
        locator_x = mdates.AutoDateLocator(minticks=3, maxticks=6)
        fmt = mdates.ConciseDateFormatter(locator_x); fmt.show_offset = False
        ax_left.xaxis.set_major_locator(locator_x)
        ax_left.xaxis.set_major_formatter(fmt)
    else:
        ax_left.xaxis.set_major_formatter(
            mticker.FuncFormatter(lambda v, p: human_format(v))
        )

    # style left axis, grid, labels
    ax_left.tick_params(axis='both', labelsize=tick_font_size, length=2, pad=2)

    for lbl in ax_left.get_xticklabels() + ax_left.get_yticklabels():
        lbl.set_fontweight("bold")
    if ax_right is not None:
        for lbl in ax_right.get_yticklabels():
            lbl.set_fontweight("bold")

    if ylabel_left:
        ax_left.set_ylabel(
            ylabel_left,
            fontsize=ylabel_font_size,
            fontweight="bold",
            labelpad=6
        )
    if ax_right is not None and ylabel_right:
        ax_right.set_ylabel(
            ylabel_right,
            fontsize=ylabel_font_size,
            fontweight="bold",
            labelpad=6
        )

    ax_left.grid(axis='y', which='major', alpha=0.25, linewidth=0.6)
    ax_left.spines['top'].set_visible(False); ax_left.spines['right'].set_visible(False)
    ax_left.spines['bottom'].set_linewidth(0.8); ax_left.spines['left'].set_linewidth(0.8)

    if ax_right is not None:
        ax_right.spines['top'].set_visible(False)
        ax_right.spines['left'].set_visible(False)
        ax_right.spines['right'].set_linewidth(0.8)
        ax_right.spines['bottom'].set_visible(False)

    # ---------------- LEGEND (above highlight bands) -------------------
    handles1, labels1 = ax_left.get_legend_handles_labels()
    handles = handles1
    labels = labels1

    if ax_right is not None:
        h2, l2 = ax_right.get_legend_handles_labels()
        handles += h2
        labels += l2

    if ax_right is None and len(handles1) <= 1:
        handles = []
        labels = []

    if handles:
        prop = FontProperties(weight='bold', size=legend_font_size)
        leg = ax_left.legend(
            handles, labels,
            loc="upper left",
            frameon=True,
            fancybox=True,
            framealpha=0.35,
            prop=prop,
            labelcolor="black",
            borderpad=0.35,
            handlelength=1.4,
            handletextpad=0.5,
        )
        leg.get_frame().set_edgecolor((0,0,0,0.15))
        leg.get_frame().set_linewidth(0.6)
        leg.get_frame().set_facecolor((1,1,1,0.35))
        leg.set_zorder(10)   # <- ensure legend sits above highlight bands

    plt.tight_layout(pad=0.35)
    tmp_chart_path = TMP_DIR / "_tmp_chart_datetime.png"
    fig.savefig(tmp_chart_path, transparent=True, dpi=dpi)
    plt.close(fig)

    # --- composite on template ---
    chart_img = Image.open(tmp_chart_path).convert("RGBA")
    chart_img = chart_img.resize((chart_width, chart_height),
                                 Image.Resampling.LANCZOS)

    # optional center watermark
    if center_image is not None:
        center_img = _load_image(center_image)
        if center_img is not None:
            diameter = int(min(chart_width, chart_height) * 0.4)
            if diameter > 0:
                center_img = center_img.resize((diameter, diameter), Image.Resampling.LANCZOS)
                mask = Image.new("L", (diameter, diameter), 0)
                mask_draw = ImageDraw.Draw(mask)
                mask_draw.ellipse((0, 0, diameter, diameter), fill=155)
                cx = chart_width // 2
                cy = chart_height // 2
                top_left = (cx - diameter // 2, cy - diameter // 2)
                chart_img.paste(center_img, top_left, mask)

    canvas.alpha_composite(chart_img, (chart_left, chart_top))

    # --- footer (date + note) ---
    if date_str is None:
        date_str = datetime.now().strftime("%B %d, %Y")
    draw.text((footer_value_x - 134, date_y + 69),
              date_str, fill=(0,0,0,255), font=footer_font)
    if note_value:
        draw.text((footer_value_x - 134, note_y + 63),
                  note_value, fill=(0,0,0,255), font=footer_font)

    canvas.save(out_path)
    print(f"✅ Saved:", out_path)
    return out_path


def render_pine_poster_dual(
    title,
    subtitle,
    note_value,
    x_values,
    y_series,
    colors_hex=None,
    ylabel_left="",
    log_left=False,
    include_zero_left=True,
    chart_type="line",
    right_series=None,
    right_color_hex="#8C3A3A",
    ylabel_right="",
    right_chart_type="line",
    log_right=False,
    include_zero_right=True,
    template_name: str = DEFAULT_TEMPLATE_NAME,
    highlight_regions=None,
    highlight_points=None,
    date_str=None,
    center_image=None,
    time_range="all",
    time_bucket="none",
):
    """Logging/error-handling wrapper for the dual-axis renderer."""

    render_context = {
        "event": "render_dual_start",
        "x_len": len(x_values) if x_values is not None else 0,
        "y_series_count": len(y_series) if y_series is not None else 0,
        "template_name": template_name,
        "has_center_image": bool(center_image),
        "highlight_regions_count": len(highlight_regions) if highlight_regions else 0,
        "highlight_points_count": len(highlight_points) if highlight_points else 0,
        "time_range": time_range,
        "time_bucket": time_bucket,
    }
    logger.info("Rendering dual-axis poster", extra=render_context)

    try:
        out_path = _render_pine_poster_dual_impl(
            title=title,
            subtitle=subtitle,
            note_value=note_value,
            x_values=x_values,
            y_series=y_series,
            colors_hex=colors_hex,
            ylabel_left=ylabel_left,
            log_left=log_left,
            include_zero_left=include_zero_left,
            chart_type=chart_type,
            right_series=right_series,
            right_color_hex=right_color_hex,
            ylabel_right=ylabel_right,
            right_chart_type=right_chart_type,
            log_right=log_right,
            include_zero_right=include_zero_right,
            template_name=template_name,
            highlight_regions=highlight_regions,
            highlight_points=highlight_points,
            date_str=date_str,
            center_image=center_image,
            time_range=time_range,
            time_bucket=time_bucket,
        )
        logger.info(
            "Dual-axis poster rendered",
            extra={**render_context, "event": "render_dual_success", "output_path": str(out_path)},
        )
        return out_path
    except Exception:
        logger.exception(
            "Dual-axis poster render failed",
            extra={**render_context, "event": "render_dual_error"},
        )
        raise


# --------------- example usage ----------------
if __name__ == "__main__":
    np.random.seed(7)

    # Common X axis: 90 days of data
    end = datetime.today().replace(hour=0, minute=0, second=0, microsecond=0)
    start = end - timedelta(days=89)
    xs = [start + timedelta(days=i) for i in range(90)]
    t = np.arange(90)

    # Fake underlying metrics
    base = 10_000
    s1 = base + 900*np.sin(2*np.pi*t/7)  + np.linspace(0,3000,90) + np.random.normal(0,500,90)
    s2 = base*0.6 + 600*np.sin(2*np.pi*(t+2)/7) + np.linspace(0,1800,90) + np.random.normal(0,350,90)
    s3 = base*0.3 + 300*np.sin(2*np.pi*(t+4)/7) + np.linspace(0, 900,90) + np.random.normal(0,200,90)
    Y  = [np.maximum(s, 100) for s in [s1, s2, s3]]

    # Fake "price" for right axis
    price = 2 + 0.4*np.sin(2*np.pi*t/30) + 0.02*t

    # ---------------- EXAMPLE 1 ----------------
    # Multi-line left axis + one highlighted regime block
    render_pine_poster_dual(
        title="Example 1 — Multi-Line + Highlighted Regime",
        subtitle="Left: 3 metrics • No right axis",
        note_value="Shows multi-series line chart + shaded regime window.",
        x_values=xs,
        y_series={
            "DEX A swappers": Y[0],
            "DEX B swappers": Y[1],
            "DEX C swappers": Y[2],
        },
        colors_hex=["#1C5C3D", "#D97706", "#2563EB"],
        ylabel_left="Wallets (unique / day)",
        log_left=False,
        include_zero_left=True,
        chart_type="line",

        right_series=None,              # no right axis
        right_color_hex="#8C3A3A",
        ylabel_right="",
        right_chart_type="line",
        log_right=False,
        include_zero_right=True,


        out_path="pine_demo_1_line_regime.png",
        highlight_regions=[
            {
                "start": xs[15],
                "end": xs[30],
                "label": "Launch window",
            }
        ],
        highlight_points=None,
        date_str=None,
    )

    # ---------------- EXAMPLE 2 ----------------
    # Line on left, bar on right + two callout points
    render_pine_poster_dual(
        title="Example 2 — Line + Right-Axis Bars + Callouts",
        subtitle="Left: swappers • Right: token price (bars)",
        note_value="Shows dual axis + highlighted points.",
        x_values=xs,
        y_series={"Swappers": Y[0]},
        colors_hex=["#1C5C3D"],
        ylabel_left="Wallets (unique / day)",
        log_left=False,
        include_zero_left=True,
        chart_type="line",

        right_series=price,
        right_color_hex="#8C3A3A",
        ylabel_right="Price (USD)",
        right_chart_type="bar",
        log_right=False,
        include_zero_right=False,

        out_path="pine_demo_2_line_right_bar_points.png",
        highlight_regions=None,
        highlight_points=[
            {
                "x": xs[20],
                "series": "Swappers",    # by series label
                "label": "Usage spike",
                "axis": "left",
            },
            {
                "x": xs[60],
                "series": 0,             # index into left series
                "label": "Another local high",
                "axis": "left",
            },
        ],
        date_str=None,
    )

    # ---------------- EXAMPLE 3 ----------------
    # Stacked area chart left + regime + one point on series B
    render_pine_poster_dual(
        title="Example 3 — Stacked Area + Regime + Point",
        subtitle="Left: stacked swappers across two DEXs",
        note_value="Shows area mode, regime highlight, and a point label.",
        x_values=xs,
        y_series={
            "DEX A swappers": Y[0],
            "DEX B swappers": Y[1],
        },
        colors_hex=["#1C5C3D", "#D97706"],
        ylabel_left="Wallets (stacked / day)",
        log_left=False,
        include_zero_left=True,
        chart_type="area",

        right_series=None,
        right_color_hex="#8C3A3A",
        ylabel_right="",
        right_chart_type="line",
        log_right=False,
        include_zero_right=True,

  
        out_path="pine_demo_3_area_regime_point.png",
        highlight_regions=[
            {
                "start": xs[40],
                "end": xs[55],
                "label": "Liquidity mining",
            }
        ],
        highlight_points=[
            {
                "x": xs[48],
                "series": "DEX B swappers",
                "label": "DEX B peak",
                "axis": "left",
            }
        ],
        date_str=None,
    )

    # ---------------- EXAMPLE 4 ----------------
    # Stacked bar left + right-axis line + callouts on both axes
    render_pine_poster_dual(
        title="Example 4 — Stacked Bars + Right Line + Dual Callouts",
        subtitle="Left: stacked volume • Right: price",
        note_value="Shows bar mode + dual-axis point labels.",
        x_values=xs,
        y_series={
            "DEX A volume": np.abs(Y[0]),
            "DEX B volume": np.abs(Y[1]),
        },
        colors_hex=["#1C5C3D", "#D97706"],
        ylabel_left="Volume (USD)",
        log_left=False,
        include_zero_left=True,
        chart_type="bar",

        right_series=price,
        right_color_hex="#2563EB",
        ylabel_right="Price (USD)",
        right_chart_type="line",
        log_right=False,
        include_zero_right=False,

       
        out_path="pine_demo_4_bar_right_line_points.png",
        highlight_regions=None,
        highlight_points=[
            {
                "x": xs[25],
                "series": "DEX A volume",
                "label": "DEX A blow-out",
                "axis": "left",
            },
            {
                "x": xs[75],
                "series": 0,           # 0 = the only right-axis series
                "label": "Price breakout",
                "axis": "right",
            },
        ],
        date_str=None,
    )
