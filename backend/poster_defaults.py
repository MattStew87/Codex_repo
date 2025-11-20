# poster_defaults.py

from datetime import datetime, timedelta
from typing import Dict, List

from poster_schemas import PieConfig, BarConfig, DualConfig, PosterConfig

DEFAULT_COLORS = [
    "#1C5C3D",  # Jupiter
    "#D97706",  # Raydium
    "#2563EB",  # Orca
    "#6B7280",  # Meteora
    "#10B981",  # Other
]


def default_pie() -> PieConfig:
    labels = ["Jupiter", "Raydium", "Orca", "Meteora", "Other"]
    values = [40, 25, 20, 10, 5]
    return PieConfig(
        poster_type="pie",
        title="DEX Volume Share — Last 30 Days",
        subtitle="Share of total volume by venue",
        note_value="Illustrative split only.",
        template_name="main",
        labels=labels,
        values=values,
        colors_hex=DEFAULT_COLORS[: len(labels)],
    )


def default_bar() -> BarConfig:
    labels = ["Jupiter", "Raydium", "Orca", "Meteora", "Other"]
    values = [1_200_000_000, 850_000_000, 650_000_000, 250_000_000, 100_000_000]
    return BarConfig(
        poster_type="bar",
        title="DEX Volume — Last 30 Days",
        subtitle="Total volume per venue (USD)",
        note_value="Example data only.",
        template_name="main",
        labels=labels,
        values=values,
        colors_hex=DEFAULT_COLORS[: len(labels)],
        orientation="horizontal",
        value_axis_label="Volume (USD)",
        label_images=[None] * len(labels),
    )


def default_dual() -> DualConfig:
    # 30 days of fake data
    today = datetime.utcnow().date()
    dates = [str(today - timedelta(days=i))[0:10] for i in range(29, -1, -1)]

    swappers_a = [100 + i * 5 for i in range(30)]
    swappers_b = [80 + i * 4 for i in range(30)]
    price = [2.0 + i * 0.02 for i in range(30)]

    return DualConfig(
        poster_type="dual",
        title="Swappers & Token Price — Last 30 Days",
        subtitle="Left: daily unique swappers • Right: token price (USD)",
        note_value="Synthetic data.",
        template_name="main",
        x_values=dates,
        y_series={
            "DEX A swappers": swappers_a,
            "DEX B swappers": swappers_b,
        },
        colors_hex=["#1C5C3D", "#D97706"],
        ylabel_left="Wallets (unique / day)",
        log_left=False,
        include_zero_left=True,
        left_series_type="line",
        right_series=price,
        right_color_hex="#2563EB",
        ylabel_right="Price (USD)",
        right_series_type="line",
        log_right=False,
        include_zero_right=False,
        highlight_regions=None,
        highlight_points=None,
    )


def get_poster_default(poster_type: str) -> PosterConfig:
    if poster_type == "pie":
        return default_pie()
    if poster_type == "bar":
        return default_bar()
    if poster_type == "dual":
        return default_dual()
    raise ValueError("poster_type must be one of: 'pie', 'bar', 'dual'")
