# poster_schemas.py

from __future__ import annotations
from typing import Dict, List, Optional, Union, Literal
from pydantic import BaseModel, field_validator, model_validator, ConfigDict, Field

PosterType = Literal["pie", "bar", "dual"]
TimeRange = Literal["7d", "30d", "90d", "180d", "1y", "all"]


class BasePosterConfig(BaseModel):
    poster_type: PosterType
    title: str
    subtitle: Optional[str] = ""
    note_value: Optional[str] = ""

    # logical template selector; backend maps "main" → main_template.png, etc.
    template_name: Optional[str] = "main"

    # optional override of the footer date
    date_str: Optional[str] = None
    # optional brand/logo in center for some charts
    center_image: Optional[str] = None


# ---------- PIE ----------

class PieConfig(BasePosterConfig):
    poster_type: Literal["pie"]
    labels: List[str]
    values: List[float]
    colors_hex: Optional[List[str]] = None

    @field_validator("values")
    @classmethod
    def values_non_empty(cls, v: List[float]) -> List[float]:
        if not v:
            raise ValueError("values must not be empty")
        return v

    @model_validator(mode="after")
    def check_labels_match_values(self) -> "PieConfig":
        if len(self.labels) != len(self.values):
            raise ValueError("labels and values must have same length")
        return self


# ---------- BAR ----------

# poster_schemas.py

class BarConfig(BasePosterConfig):
    poster_type: Literal["bar"]
    labels: List[str]
    values: List[float]
    colors_hex: Optional[List[str]] = None
    orientation: Literal["horizontal", "vertical"] = "horizontal"
    value_axis_label: str = "Volume (USD)"
    # allow fewer entries than labels, filled with None
    label_images: Optional[List[Optional[str]]] = None

    @field_validator("values")
    @classmethod
    def bar_values_non_empty(cls, v: List[float]) -> List[float]:
        if not v:
            raise ValueError("values must not be empty")
        return v

    @model_validator(mode="after")
    def check_bar_lengths(self) -> "BarConfig":
        # labels vs values still strict
        if len(self.labels) != len(self.values):
            raise ValueError("labels and values must have same length")

        # label_images: allow 0…len(labels), normalize to that length
        if self.label_images is not None:
            li = list(self.label_images)
            L = len(self.labels)

            if len(li) < L:
                li = li + [None] * (L - len(li))
            elif len(li) > L:
                li = li[:L]

            self.label_images = li

        return self



# ---------- HIGHLIGHT STRUCTS ----------

class HighlightRegion(BaseModel):
    start: str         # date or x value as string
    end: str
    label: Optional[str] = None


class HighlightPoint(BaseModel):
    x: str                             # date or x value as string
    series: Union[int, str] = 0        # key in y_series or index
    axis: Literal["left", "right"] = "left"
    label: Optional[str] = None


# ---------- DUAL / DATETIME ----------

class DualConfig(BasePosterConfig):
    model_config = ConfigDict(populate_by_name=True)

    poster_type: Literal["dual"]

    x_values: List[str]  # parseable date strings or numeric strings
    y_series: Dict[str, List[float]]
    colors_hex: Optional[List[str]] = None

    ylabel_left: str
    log_left: bool = False
    include_zero_left: bool = True
    left_series_type: Literal["line", "area", "bar"] = "line"

    right_series: Optional[List[float]] = None
    right_color_hex: str = "#8C3A3A"
    ylabel_right: Optional[str] = ""
    right_series_type: Literal["line", "area", "bar"] = "line"
    log_right: bool = False
    include_zero_right: bool = True

    highlight_regions: Optional[List[HighlightRegion]] = None
    highlight_points: Optional[List[HighlightPoint]] = None

    time_range: TimeRange = Field("all", alias="timeRange")

    @model_validator(mode="after")
    def validate_series_lengths(self) -> "DualConfig":
        # y_series must not be empty
        if not self.y_series:
            raise ValueError("y_series must contain at least one series")

        lengths = {len(series) for series in self.y_series.values()}
        if len(lengths) != 1:
            raise ValueError("all y_series arrays must have the same length")

        left_len = next(iter(lengths))

        # x_values length must match
        if len(self.x_values) != left_len:
            raise ValueError("x_values length must match y_series length")

        # right_series (if present) must match
        if self.right_series is not None and len(self.right_series) != left_len:
            raise ValueError("right_series length must match y_series length")

        return self


PosterConfig = Union[PieConfig, BarConfig, DualConfig]
