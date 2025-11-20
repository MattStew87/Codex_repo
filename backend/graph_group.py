# pine_overlay_bar_horizontal_safe_imgs.py

from PIL import Image, ImageDraw, ImageFont
import matplotlib.pyplot as plt
import matplotlib as mpl
import matplotlib.ticker as mticker
from matplotlib.offsetbox import OffsetImage, AnnotationBbox
import numpy as np
from datetime import datetime
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
DEFAULT_OUTPUT_PATH = GRAPHS_DIR / "pine_poster_group.png"


logger = logging.getLogger(__name__)

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
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))

def _rgb01_to_hex(rgb):
    return "#{:02X}{:02X}{:02X}".format(*(int(round(c * 255)) for c in rgb))

def _mix(rgb, to=(1, 1, 1), t=0.0):
    return tuple((1 - t) * rgb[i] + t * to[i] for i in range(3))

def _palette_from_base(base_hex, n):
    base = _hex_to_rgb01(base_hex)
    if n <= 1:
        return [_rgb01_to_hex(base)]
    colors = []
    for i in range(n):
        if i == 0:
            colors.append(_rgb01_to_hex(base))
        elif i % 2 == 1:
            t = min(0.15 + 0.12 * (i // 2), 0.6)
            colors.append(_rgb01_to_hex(_mix(base, (1, 1, 1), t)))
        else:
            t = min(0.12 + 0.10 * ((i - 1) // 2), 0.6)
            colors.append(_rgb01_to_hex(_mix(base, (0, 0, 0), t)))
    return colors

# ------------------ compact number fmt (label text) --------
def _format_compact_number(v):
    v = float(v)
    abs_v = abs(v)
    if abs_v >= 1_000_000_000:
        return f"{v / 1_000_000_000:.2f}B"
    elif abs_v >= 1_000_000:
        return f"{v / 1_000_000:.2f}M"
    elif abs_v >= 1_000:
        return f"{v / 1_000:.2f}K"
    else:
        return f"{v:.2f}"

# ------------------ human format (axis ticks) --------------
def human_format(num):
    n = float(num)
    a = abs(n)
    if a >= 1_000_000_000_000:
        return f"{n/1_000_000_000_000:.1f}T"
    if a >= 1_000_000_000:
        return f"{n/1_000_000_000:.1f}B"
    if a >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if a >= 1_000:
        return f"{n/1_000:.1f}K"
    return f"{n:.0f}"

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

# -------------- tick helpers (x / y variants) --------------
def _set_linear_y_ticks(ax, data_arrays, include_zero=True, pad_frac=0.22):
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

def _set_linear_x_ticks(ax, data_arrays, include_zero=True, pad_frac=0.22):
    xmin_data = float(min(np.min(s) for s in data_arrays))
    xmax_data = float(max(np.max(s) for s in data_arrays))

    if xmin_data == xmax_data:
        if xmin_data == 0:
            xmin_data = -0.5
            xmax_data = 0.5
        else:
            xmin_data *= 0.9
            xmax_data *= 1.1

    xmin = xmin_data
    xmax = xmax_data

    if include_zero:
        if xmin > 0:
            xmin = 0.0
        elif xmax < 0:
            xmax = 0.0

    span = xmax - xmin
    if span <= 0:
        if xmax == 0:
            xmin = -1.0
            xmax = 1.0
        else:
            xmin = xmin * 0.9
            xmax = xmax * 1.1
        span = xmax - xmin

    zero_in_range = (xmin <= 0 <= xmax)
    if zero_in_range:
        pad_right = pad_frac * span
        xmax = xmax + pad_right
    else:
        pad = pad_frac * span
        xmin = xmin - pad
        xmax = xmax + pad

    ax.set_xlim(xmin, xmax)
    axis_range = (xmin, xmax)

    ax.xaxis.set_major_locator(mticker.AutoLocator())
    ax.xaxis.set_minor_locator(mticker.NullLocator())
    ax.xaxis.set_major_formatter(
        mticker.FuncFormatter(lambda v, p: _smart_human_format(v, axis_range))
    )
    ax.xaxis.get_offset_text().set_visible(False)

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

def _circle_crop(img):
    w, h = img.size
    size = min(w, h)
    left = (w - size) // 2
    top = (h - size) // 2
    img = img.crop((left, top, left + size, top + size))

    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size, size), fill=255)

    img = img.convert("RGBA").copy()
    img.putalpha(mask)
    return img

# ----------------------- main render -----------------------
def _render_pine_poster_bar_impl(
    title,
    subtitle,
    note_value,
    labels,
    values,
    colors_hex=None,
    template_name: str = DEFAULT_TEMPLATE_NAME,
    date_str=None,
    center_image=None,              
    value_axis_label="Volume (USD)",
    label_images=None,               
    orientation="horizontal",       
):
    """
    Horizontal-focused version:
    - Bars go right (categories on y-axis).
    - If all categories use images, ghost tick labels are used for spacing.
    - Avatars are drawn *inside* the axes (x_axes = 0.02) so they aren't clipped.
    """

    out_path = DEFAULT_OUTPUT_PATH
    template_path = _resolve_template_path(template_name)

    orientation = orientation.lower()
    if orientation not in ("vertical", "horizontal"):
        raise ValueError("orientation must be 'vertical' or 'horizontal'")

    dpi = 300
    base_color_hex = "#1C5C3D"

    values = np.array(values, dtype=float)
    if len(values) == 0:
        raise ValueError("values must contain at least one entry.")
    if len(labels) != len(values):
        raise ValueError("labels and values must be same length.")

    if label_images is not None and len(label_images) != len(labels):
        raise ValueError("label_images must be the same length as labels")

    n = len(values)

    # --- template/layout ---
    template = Image.open(template_path).convert("RGBA")
    W, H = template.size

    mpl.rcParams.update({
        "font.family": "monospace",
        "font.monospace": [
            "Courier Prime", "Courier New",
            "DejaVuSansMono", "Liberation Mono", "monospace"
        ]
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

    # --- hardcoded avatar size and offsets ---
    label_image_size_px = 20           # fixed size
    y_avatar_offset_axes = -0.08       # for vertical orientation (if used)
    x_avatar_offset_axes_inside = -0.05 # for horizontal: just inside axis so not clipped

    # --- colors ---
    if colors_hex is None:
        palette = _palette_from_base(base_color_hex, n)
    else:
        if len(colors_hex) != n:
            raise ValueError(f"colors_hex must have {n} entries.")
        palette = colors_hex
    colors_rgb = [_hex_to_rgb01(c) for c in palette]

    # --- fonts/canvas ---
    title_font = _pick_font([None, None], int(0.045 * H))
    subtitle_font = _pick_font([None, None], int(0.022 * H))
    footer_font = _pick_font([None, None], int(0.017 * H))

    axis_label_font_size = max(6, int(0.010 * H))
    tick_label_font_size = max(6, int(0.007 * H))
    value_label_font_size = max(6, int(0.009 * H))

    canvas = template.copy()
    draw = ImageDraw.Draw(canvas)

    # --- Title / subtitle ---
    if title:
        for dx, dy in [(0, 0), (1, 0), (0, 1)]:
            draw.text(
                (left_margin + dx, title_y + dy),
                title,
                fill=(0, 0, 0, 255),
                font=title_font,
            )
    if subtitle:
        draw.text(
            (left_margin, subtitle_y),
            subtitle,
            fill=(0, 0, 0, 255),
            font=subtitle_font,
        )

    # --- Matplotlib figure for bar chart ---
    fig_w_inches = chart_width / dpi
    fig_h_inches = chart_height / dpi
    fig = plt.figure(figsize=(fig_w_inches, fig_h_inches), dpi=dpi)

    # extra left space for avatars / labels
    if orientation == "vertical":
        fig.subplots_adjust(bottom=0.25)
    else:
        fig.subplots_adjust(left=0.25)

    ax = fig.add_subplot(111)
    fig.patch.set_alpha(0.0)
    ax.set_facecolor((1, 1, 1, 0))

    indices = np.arange(n)
    bar_thickness = 0.6

    # ---------- Draw bars ----------
    if orientation == "vertical":
        bars = ax.bar(
            indices,
            values,
            bar_thickness,
            color=colors_rgb,
            edgecolor="black",
            linewidth=0.4,
        )
    else:
        bars = ax.barh(
            indices,
            values,
            bar_thickness,
            color=colors_rgb,
            edgecolor="black",
            linewidth=0.4,
        )

    # ---------- Category axis ----------
    if orientation == "vertical":
        ax.set_xticks(indices)
        base_tick_labels = list(labels)

        if label_images is not None:
            for i, img_ref in enumerate(label_images):
                if img_ref:
                    base_tick_labels[i] = ""

        ax.set_xticklabels(
            base_tick_labels,
            rotation=45,
            ha="right",
            fontsize=tick_label_font_size,
            fontweight="bold",
        )
    else:
        ax.set_yticks(indices)
        base_tick_labels = list(labels)

        all_have_images = (
            label_images is not None and all(bool(img) for img in label_images)
        )

        if label_images is not None:
            if all_have_images:
                # ONLY IMAGES CASE → ghost labels so spacing is correct, text invisible
                ghost_labels = ["XXXXXXX"] * n  # ~7 chars
                texts = ax.set_yticklabels(
                    ghost_labels,
                    fontsize=tick_label_font_size,
                    fontweight="bold",
                )
                for t in texts:
                    t.set_color((0, 0, 0, 0))  # fully transparent
            else:
                # mixed: hide text only where avatar exists
                for i, img_ref in enumerate(label_images):
                    if img_ref:
                        base_tick_labels[i] = ""
                ax.set_yticklabels(
                    base_tick_labels,
                    fontsize=tick_label_font_size,
                    fontweight="bold",
                )
        else:
            ax.set_yticklabels(
                base_tick_labels,
                fontsize=tick_label_font_size,
                fontweight="bold",
            )

    # ---------- Numeric axis ticks ----------
    if orientation == "vertical":
        _set_linear_y_ticks(ax, [values], include_zero=True, pad_frac=0.22)
    else:
        _set_linear_x_ticks(ax, [values], include_zero=True, pad_frac=0.22)

    ax.tick_params(
        axis="y",
        which="both",
        labelsize=tick_label_font_size,
        length=2,
        width=0.4,
        pad=2,
    )
    ax.tick_params(
        axis="x",
        which="both",
        labelsize=tick_label_font_size,
        length=2,
        width=0.4,
        pad=2,
    )

    for lbl in ax.get_xticklabels() + ax.get_yticklabels():
        lbl.set_fontweight("bold")

    # Numeric axis label
    if value_axis_label:
        if orientation == "vertical":
            ax.set_ylabel(
                value_axis_label,
                fontsize=axis_label_font_size,
                fontweight="bold",
                labelpad=6,
            )
        else:
            ax.set_xlabel(
                value_axis_label,
                fontsize=axis_label_font_size,
                fontweight="bold",
                labelpad=6,
            )

    # Spines / grid
    if orientation == "vertical":
        ax.grid(axis="y", which="major", alpha=0.25, linewidth=0.6)
    else:
        ax.grid(axis="x", which="major", alpha=0.25, linewidth=0.6)

    ax.set_axisbelow(True)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_linewidth(0.8)
    ax.spines["left"].set_linewidth(0.8)

    # --- Value labels on bars ---
    for bar, val in zip(bars, values):
        if orientation == "vertical":
            x = bar.get_x() + bar.get_width() / 2
            y = bar.get_height()
            ax.text(
                x,
                y,
                _format_compact_number(val),
                ha="center",
                va="bottom",
                fontsize=value_label_font_size,
                fontweight="bold",
                color="#111111",
            )
        else:
            x = bar.get_width()
            y = bar.get_y() + bar.get_height() / 2
            ax.text(
                x,
                y,
                _format_compact_number(val),
                ha="left",
                va="center",
                fontsize=value_label_font_size,
                fontweight="bold",
                color="#111111",
            )

    # ---- Image labels (avatars) ----------
    if label_images is not None:
        for i, img_ref in enumerate(label_images):
            if not img_ref:
                continue

            raw_img = _load_image(img_ref)
            if raw_img is None:
                continue

            circ = _circle_crop(raw_img)
            arr = np.array(circ)

            h0, w0 = arr.shape[0], arr.shape[1]
            base_size = max(h0, w0)
            zoom = float(label_image_size_px) / float(base_size) if base_size > 0 else 1.0
            imagebox = OffsetImage(arr, zoom=zoom)

            if orientation == "vertical":
                x_data = indices[i]
                y_axes = y_avatar_offset_axes
                ab = AnnotationBbox(
                    imagebox,
                    (x_data, y_axes),
                    xycoords=("data", "axes fraction"),
                    frameon=False,
                    box_alignment=(0.5, 0.5),
                    pad=0.0,
                    clip_on=False,
                )
            else:
                # KEY: x_axes is *inside* axes, so images never cross figure edge
                y_data = indices[i]
                x_axes = x_avatar_offset_axes_inside
                ab = AnnotationBbox(
                    imagebox,
                    (x_axes, y_data),
                    xycoords=("axes fraction", "data"),
                    frameon=False,
                    box_alignment=(0.5, 0.5),
                    pad=0.0,
                    clip_on=False,
                )

            ax.add_artist(ab)

    # Margins
    if orientation == "vertical":
        ax.margins(x=0.07, y=0.05)
    else:
        ax.margins(y=0.07, x=0.05)

    plt.tight_layout(pad=0.35)

    # --- save chart as image and composite onto template ---
    tmp_chart_path = TMP_DIR / "_tmp_chart_group.png"
    fig.savefig(tmp_chart_path, transparent=True, dpi=dpi)
    plt.close(fig)

    chart_img = Image.open(tmp_chart_path).convert("RGBA")
    chart_img = chart_img.resize((chart_width, chart_height), Image.Resampling.LANCZOS)

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
    draw.text(
        (footer_value_x - 134, date_y + 69),
        date_str,
        fill=(0, 0, 0, 255),
        font=footer_font,
    )
    if note_value:
        draw.text(
            (footer_value_x - 134, note_y + 63),
            note_value,
            fill=(0, 0, 0, 255),
        font=footer_font,
    )

    canvas.save(out_path)
    print("✅ Saved:", out_path)
    return out_path


def render_pine_poster_bar(
    title,
    subtitle,
    note_value,
    labels,
    values,
    colors_hex=None,
    template_name: str = DEFAULT_TEMPLATE_NAME,
    date_str=None,
    center_image=None,
    value_axis_label="Volume (USD)",
    label_images=None,
    orientation="horizontal",
):
    """Logging/error-handling wrapper for the bar renderer."""

    render_context = {
        "event": "render_bar_start",
        "label_count": len(labels) if labels is not None else 0,
        "template_name": template_name,
        "orientation": orientation,
        "has_center_image": bool(center_image),
        "label_images_count": len(label_images) if label_images is not None else 0,
    }
    logger.info("Rendering bar poster", extra=render_context)

    try:
        out_path = _render_pine_poster_bar_impl(
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
            orientation=orientation,
        )
        logger.info(
            "Bar poster rendered",
            extra={**render_context, "event": "render_bar_success", "output_path": str(out_path)},
        )
        return out_path
    except Exception:
        logger.exception(
            "Bar poster render failed",
            extra={**render_context, "event": "render_bar_error"},
        )
        raise


# --------------- example usage ----------------
if __name__ == "__main__":
    labels = ["DEX A", "DEX B", "DEX C", "Long-Tail", "Tiny #1"]
    values = [420_000_000, 1_240_000_000, 2_100_000_000, 95_000_000, 50_000_000]

    label_images = [
        None,
        None,
        None,
        None,
        None,
    ]

    render_pine_poster_bar(
        title="DEX Volume — Last 30 Days",
        subtitle="Horizontal bars with avatars on y-axis (safe layout)",
        note_value="Illustrative volumes only.",
        labels=labels,
        values=values,
        colors_hex=["#1C5C3D", "#D97706", "#2563EB", "#6B7280", "#10B981"],
        out_path="pine_demo_bar_horizontal.png",
        value_axis_label="Volume (USD)",
        label_images=label_images,
        orientation="horizontal",
    )
