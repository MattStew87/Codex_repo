# pine_overlay_pie_center_smart_labels_solid_bigpie_thinborder_center_image_fixed.py

from PIL import Image, ImageDraw, ImageFont
import matplotlib.pyplot as plt
import matplotlib as mpl
import numpy as np
from datetime import datetime
from matplotlib.font_manager import FontProperties
import os
import math
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
DEFAULT_OUTPUT_PATH = GRAPHS_DIR / "pine_poster_pie.png"


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

# ------------------ number formatter -----------------------
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

# ------------------ simple vertical label de-overlap --------
def _spread_labels(labels, min_gap=0.10):
    """
    labels: list of dicts with key 'y_label_base'
    Adds 'y_label' to each dict, spaced by at least min_gap.
    """
    labels_sorted = sorted(labels, key=lambda d: d["y_label_base"])
    prev_y = None
    for lab in labels_sorted:
        y = lab["y_label_base"]
        if prev_y is not None and y - prev_y < min_gap:
            y = prev_y + min_gap
        lab["y_label"] = y
        prev_y = y
    return labels_sorted

# ------------------ center image loader ---------------------
def _load_center_image(center_image):
    """
    center_image: None, local path, or URL.
    Returns a PIL.Image (RGBA) or None.
    """
    if not center_image:
        return None

    try:
        if isinstance(center_image, str) and center_image.startswith(("http://", "https://")):
            with urllib.request.urlopen(center_image) as resp:
                data = resp.read()
            img = Image.open(io.BytesIO(data)).convert("RGBA")
        else:
            img = Image.open(center_image).convert("RGBA")
        return img
    except Exception as e:
        print("⚠️ Could not load center image:", e)
        return None

# ----------------------- main render -----------------------
def _render_pine_poster_pie_impl(
    title,
    subtitle,
    note_value,
    labels,
    values,
    colors_hex=None,
    template_name: str = DEFAULT_TEMPLATE_NAME, 
    date_str=None,
    center_image=None,
):
    """
    Render a Pine-branded poster with a centered pie chart.

    labels: list of category labels
    values: list/array of numeric values (same length as labels)
    colors_hex: optional list of hex colors, otherwise auto-generated
    center_image: optional image path or URL; if provided, it is cropped
                  to a circle and placed in the center of the pie,
                  and % labels inside slices are disabled.
    """

    out_path = DEFAULT_OUTPUT_PATH
    template_path = _resolve_template_path(template_name)

    dpi = 300
    base_color_hex = "#1C5C3D"

    values = np.array(values, dtype=float)
    if len(values) == 0:
        raise ValueError("values must contain at least one entry.")
    if len(labels) != len(values):
        raise ValueError("labels and values must be same length.")

    # --- colors ---
    n = len(values)
    if colors_hex is None:
        palette = _palette_from_base(base_color_hex, n)
    else:
        if len(colors_hex) != n:
            raise ValueError(f"colors_hex must have {n} entries.")
        palette = colors_hex

    colors_rgb = [_hex_to_rgb01(c) for c in palette]

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

    # --- fonts/canvas ---
    title_font = _pick_font([None, None], int(0.045 * H))
    subtitle_font = _pick_font([None, None], int(0.022 * H))
    footer_font = _pick_font([None, None], int(0.017 * H))
    legend_font_size = max(6, int(0.008 * H))
    value_label_font_size = max(6, int(0.007 * H))
    pct_label_font_size = max(6, int(0.007 * H))

    canvas = template.copy()
    draw = ImageDraw.Draw(canvas)

    # Title / subtitle
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

    # --- Matplotlib figure for pie ---
    fig_w_inches = chart_width / dpi
    fig_h_inches = chart_height / dpi
    fig = plt.figure(figsize=(fig_w_inches, fig_h_inches), dpi=dpi)
    ax = fig.add_subplot(111)
    fig.patch.set_alpha(0.0)
    ax.set_aspect("equal")
    ax.set_facecolor((1, 1, 1, 0))

    # ---------------- PIE: larger & thinner borders ----------------
    wedges, _texts = ax.pie(
        values,
        labels=None,
        colors=colors_rgb,
        startangle=90,
        radius=1.75,  # big pie
        wedgeprops={
            "linewidth": 0.3,
            "edgecolor": "black",
        },
    )

    total = values.sum()

    # --- label geometry parameters ---
    r_line_start = 1.5
    r_label_radius = 1.69
    min_vertical_gap = 0.11

    right_labels = []
    left_labels = []

    for wedge, val in zip(wedges, values):
        theta = 0.5 * (wedge.theta1 + wedge.theta2)
        theta_rad = math.radians(theta)
        x_dir = math.cos(theta_rad)
        y_dir = math.sin(theta_rad)

        side = "right" if x_dir >= 0 else "left"

        # base label position
        y_label_base = r_label_radius * y_dir
        x_label_base = r_label_radius * (1 if side == "right" else -1)

        label_dict = {
            "wedge": wedge,
            "value": val,
            "theta_rad": theta_rad,
            "x_dir": x_dir,
            "y_dir": y_dir,
            "side": side,
            "x_label_base": x_label_base,
            "y_label_base": y_label_base,
        }

        if side == "right":
            right_labels.append(label_dict)
        else:
            left_labels.append(label_dict)

    # Spread vertically per side to reduce overlap
    right_labels = _spread_labels(right_labels, min_gap=min_vertical_gap)
    left_labels = _spread_labels(left_labels, min_gap=min_vertical_gap)
    all_labels = right_labels + left_labels

    # --- draw leader lines + bold value labels at adjusted positions ---
    for lab in all_labels:
        val = lab["value"]
        x_dir = lab["x_dir"]
        y_dir = lab["y_dir"]
        side = lab["side"]
        y_label = lab["y_label"]
        x_label = lab["x_label_base"]

        # line starts at slice edge
        x0 = r_line_start * x_dir
        y0 = r_line_start * y_dir

        # elbow slightly inward horizontally
        x_mid = x_label * 0.85
        y_mid = y_label

        x1 = x_label
        y1 = y_label

        # polyline: wedge -> elbow -> label
        ax.plot(
            [x0, x_mid, x1],
            [y0, y_mid, y1],
            linewidth=0.6,
            color="black",
            alpha=0.9,
        )

        txt_val = _format_compact_number(val)
        ha = "left" if side == "right" else "right"
        text_offset = 0.02 if side == "right" else -0.02

        ax.text(
            x1 + text_offset,
            y1,
            txt_val,
            ha=ha,
            va="center",
            fontsize=value_label_font_size,
            fontweight="bold",
            color="#111111",
        )

    # --- percentage labels on slices >= 5% (inside pie) ---
    # Disabled if we have a center image (to keep things clean)
    if center_image is None:
        for wedge, val in zip(wedges, values):
            pct = (val / total) * 100 if total > 0 else 0
            if pct < 5:
                continue

            theta = 0.5 * (wedge.theta1 + wedge.theta2)
            theta_rad = math.radians(theta)

            r_pct = 0.82
            x_pct = r_pct * math.cos(theta_rad)
            y_pct = r_pct * math.sin(theta_rad)

            ax.text(
                x_pct,
                y_pct,
                f"{pct:.1f}%",
                ha="center",
                va="center",
                fontsize=pct_label_font_size,
                fontweight="bold",
                color="#111111",
            )

    # --- expanded limits so lines & labels don't get clipped ---
    ax.set_xlim(-1.7, 2.0)   # extra room on right for labels
    ax.set_ylim(-1.9, 1.9)

    # Legend slightly to the right
    prop = FontProperties(weight="bold", size=legend_font_size)
    leg = ax.legend(
        wedges,
        labels,
        loc="center left",
        bbox_to_anchor=(1.20, 0.5),
        frameon=True,
        fancybox=True,
        framealpha=0.35,
        prop=prop,
        labelcolor="black",
        borderpad=0.35,
        handlelength=1.4,
        handletextpad=0.5,
    )
    leg.get_frame().set_edgecolor((0, 0, 0, 0.15))
    leg.get_frame().set_linewidth(0.6)
    leg.get_frame().set_facecolor((1, 1, 1, 0.35))

    ax.set_xticks([])
    ax.set_yticks([])

    # ---- compute true pie center in pixels (axes bbox) ----
    plt.tight_layout(pad=0.2)
    bbox = ax.get_position()  # in figure fraction coords (0..1 from bottom-left)
    center_x_frac = 0.5 * (bbox.x0 + bbox.x1)
    center_y_frac = 0.5 * (bbox.y0 + bbox.y1)

    # figure size in pixels is exactly chart_width x chart_height
    pie_center_x_px = center_x_frac * chart_width
    # convert from bottom-origin (matplotlib) to top-origin (PIL)
    pie_center_y_px_from_bottom = center_y_frac * chart_height
    pie_center_y_px = chart_height - pie_center_y_px_from_bottom

    tmp_chart_path = TMP_DIR / "_tmp_chart_pie.png"
    fig.savefig(tmp_chart_path, transparent=True, dpi=dpi)
    plt.close(fig)

    # --- composite on template ---
    chart_img = Image.open(tmp_chart_path).convert("RGBA")
    chart_img = chart_img.resize((chart_width, chart_height), Image.Resampling.LANCZOS)

    # --- optional center image overlay (circle crop) ---
    center_img = _load_center_image(center_image)
    if center_img is not None:
        # size of circular cutout as fraction of chart
        diameter = int(min(chart_width, chart_height) * 0.45)
        if diameter > 0:
            center_img = center_img.resize((diameter, diameter), Image.Resampling.LANCZOS)

            # circular mask
            mask = Image.new("L", (diameter, diameter), 0)
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.ellipse((0, 0, diameter, diameter), fill=255)

            # center coordinates at actual pie center
            cx = int(pie_center_x_px) - 30
            cy = int(pie_center_y_px)
            top_left = (cx - diameter // 2, cy - diameter // 2)

            chart_img.paste(center_img, top_left, mask)

    # now paste chart_img onto the main canvas
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


def render_pine_poster_pie(
    title,
    subtitle,
    note_value,
    labels,
    values,
    colors_hex=None,
    template_name: str = DEFAULT_TEMPLATE_NAME,
    date_str=None,
    center_image=None,
):
    """Logging and error-handling wrapper for the pie renderer."""

    render_context = {
        "event": "render_pie_start",
        "label_count": len(labels) if labels is not None else 0,
        "template_name": template_name,
        "has_center_image": bool(center_image),
    }
    logger.info("Rendering pie poster", extra=render_context)

    try:
        out_path = _render_pine_poster_pie_impl(
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
        logger.info(
            "Pie poster rendered",
            extra={**render_context, "event": "render_pie_success", "output_path": str(out_path)},
        )
        return out_path
    except Exception:
        logger.exception(
            "Pie poster render failed",
            extra={**render_context, "event": "render_pie_error"},
        )
        raise


# --------------- example usage ----------------
if __name__ == "__main__":
    labels = ["DEX A", "DEX B", "DEX C", "Long-Tail", "Tiny #1", "Tiny #2"]
    values = [420_000_000, 1_240_000_000, 2_100_000_000, 95_000_000, 50_000_000, 40_000_000]

    render_pine_poster_pie(
        title="DEX Volume Share — Last 30 Days",
        subtitle="Share of total volume by venue",
        note_value="Illustrative split only.",
        labels=labels,
        values=values,
        colors_hex=["#1C5C3D", "#D97706", "#2563EB", "#6B7280", "#10B981", "#F97316"],
        out_path="pine_demo_pie.png",
        date_str=None,
        # example:
        # center_image="logo.png",
        #center_image="https://pbs.twimg.com/profile_images/1986462619956379648/9gKvkbln_400x400.jpg",
        center_image=None,
    )
