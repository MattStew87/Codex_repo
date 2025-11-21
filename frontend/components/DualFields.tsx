// app/components/DualFields.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DualConfig,
  HighlightRegion,
  HighlightPoint,
  UiRegion,
  UiPoint,
  TimeRange,
  TimeBucket,
} from "@/lib/types";
import { HighlightEditor } from "./HighlightEditor";

interface Props {
  config: DualConfig;
  onChange: (cfg: DualConfig) => void;
}

const makeId = () => Math.random().toString(36).slice(2);

// ---- helpers: backend <-> UI mapping ----

function toUiRegions(
  xValues: string[],
  regions: HighlightRegion[] | null | undefined,
): UiRegion[] {
  if (!regions || !regions.length) return [];
  return regions.map((r) => {
    const startIndex = xValues.findIndex((x) => String(x) === String(r.start));
    const endIndex = xValues.findIndex((x) => String(x) === String(r.end));
    return {
      id: makeId(),
      startIndex: startIndex >= 0 ? startIndex : null,
      endIndex: endIndex >= 0 ? endIndex : null,
      label: r.label ?? "",
    };
  });
}

function toUiPoints(
  xValues: string[],
  leftSeriesLabels: string[],
  points: HighlightPoint[] | null | undefined,
): UiPoint[] {
  if (!points || !points.length) return [];
  return points.map((p) => {
    const xIndex = xValues.findIndex((x) => String(x) === String(p.x));
    const axis: "left" | "right" = p.axis === "right" ? "right" : "left";

    let seriesKey = "right";
    if (axis === "left") {
      if (typeof p.series === "string") {
        seriesKey = p.series;
      } else if (
        typeof p.series === "number" &&
        leftSeriesLabels[p.series]
      ) {
        seriesKey = leftSeriesLabels[p.series];
      } else {
        seriesKey = leftSeriesLabels[0] ?? "Series 0";
      }
    }

    return {
      id: makeId(),
      xIndex: xIndex >= 0 ? xIndex : null,
      axis,
      seriesKey,
      label: p.label ?? "",
    };
  });
}

function fromUiHighlights(
  xValues: string[],
  leftSeriesLabels: string[],
  uiRegions: UiRegion[],
  uiPoints: UiPoint[],
): {
  highlight_regions: HighlightRegion[] | null;
  highlight_points: HighlightPoint[] | null;
} {
  const highlight_regions: HighlightRegion[] = uiRegions
    .filter((r) => r.startIndex != null && r.endIndex != null)
    .map((r) => {
      const start = xValues[r.startIndex!];
      const end = xValues[r.endIndex!];
      return {
        start,
        end,
        label: r.label.trim() || undefined,
      };
    });

  const highlight_points: HighlightPoint[] = uiPoints
    .filter((p) => p.xIndex != null)
    .map((p) => {
      const x = xValues[p.xIndex!];
      const label = p.label.trim() || undefined;

      if (p.axis === "right") {
        return {
          x,
          axis: "right",
          series: 0,
          label,
        };
      }

      const seriesKey = p.seriesKey || leftSeriesLabels[0] || "Series 0";

      return {
        x,
        axis: "left",
        series: seriesKey,
        label,
      };
    });

  return {
    highlight_regions: highlight_regions.length ? highlight_regions : null,
    highlight_points: highlight_points.length ? highlight_points : null,
  };
}

// ---- main component ----

export function DualFields({ config, onChange }: Props) {
  const updateConfig = (patch: Partial<DualConfig>) =>
    onChange({ ...config, ...patch });

  const xValues = config.x_values ?? [];
  const timeRange: TimeRange = (config.timeRange as TimeRange) ?? "all";
  const timeBucket: TimeBucket = (config.timeBucket as TimeBucket) ?? "none";
  const leftSeriesLabels = useMemo(
    () => Object.keys(config.y_series ?? {}),
    [config.y_series],
  );

  const [uiRegions, setUiRegions] = useState<UiRegion[]>(() =>
    toUiRegions(xValues, config.highlight_regions),
  );
  const [uiPoints, setUiPoints] = useState<UiPoint[]>(() =>
    toUiPoints(xValues, leftSeriesLabels, config.highlight_points),
  );

  // React to config changes from data binding or AI (x_values, highlights, series labels)
  useEffect(() => {
    setUiRegions(toUiRegions(xValues, config.highlight_regions));
    setUiPoints(
      toUiPoints(xValues, leftSeriesLabels, config.highlight_points),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    JSON.stringify(xValues),
    JSON.stringify(config.highlight_regions ?? []),
    JSON.stringify(config.highlight_points ?? []),
    JSON.stringify(leftSeriesLabels),
  ]);

  const handleHighlightsChange = (
    nextRegions: UiRegion[],
    nextPoints: UiPoint[],
  ) => {
    setUiRegions(nextRegions);
    setUiPoints(nextPoints);

    const { highlight_regions, highlight_points } = fromUiHighlights(
      xValues,
      leftSeriesLabels,
      nextRegions,
      nextPoints,
    );

    updateConfig({
      highlight_regions,
      highlight_points,
    });
  };

  const xValuesCsv = xValues.join(", ");

  const parseNumberList = (raw: string): number[] =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => !Number.isNaN(n));

  const renderCheckboxPill = (
    id: string,
    label: string,
    checked: boolean,
    onChange: (value: boolean) => void,
  ) => (
    <div className="checkbox-pill-wrapper">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="checkbox-pill-input"
      />
      <label
        htmlFor={id}
        className={`checkbox-pill ${
          checked ? "checkbox-pill--on" : "checkbox-pill--off"
        }`}
      >
        <span className="checkbox-pill-text">{label}</span>
        <span className="checkbox-pill-status">{checked ? "on" : "off"}</span>
      </label>
    </div>
  );

  const ySeriesText = useMemo(() => {
    const entries = Object.entries(config.y_series ?? {});
    if (!entries.length) return "";
    return entries
      .map(([name, arr]) => `${name}: ${arr.join(" ")}`)
      .join("\n");
  }, [config.y_series]);

  const handleYSeriesTextChange = (raw: string) => {
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const next: Record<string, number[]> = {};
    for (const line of lines) {
      const [namePart, rest] = line.split(":", 2);
      const name = namePart.trim();
      if (!name) continue;
      const nums = (rest ?? "")
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((n) => !Number.isNaN(n));
      next[name] = nums;
    }
    updateConfig({ y_series: next });
  };

  return (
    <section className="config-card">
      <div className="config-card-header">
        <h2 className="config-card-title">Dual-axis settings</h2>
        <p className="config-card-subtitle">
          X values, left/right series, axis labels, and log/zero options.
        </p>
      </div>

      <div className="config-card-body">
        {/* 1. X values */}
        <div className="field-row">
          <label htmlFor="dual-x-values">X values (comma-separated)</label>
          <input
            id="dual-x-values"
            type="text"
            value={xValuesCsv}
            onChange={(e) =>
              updateConfig({
                x_values: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0),
              })
            }
          />
          <p className="field-help">
            One X value per index. Series align by position.
          </p>
        </div>

        {/* 1b. Time range */}
        <div className="field-row">
          <label htmlFor="dual-time-range">Time range</label>
          <select
            id="dual-time-range"
            value={timeRange}
            onChange={(e) =>
              updateConfig({ timeRange: e.target.value as TimeRange })
            }
          >
            <option value="all">All</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="180d">Last 180 days</option>
            <option value="1y">Last 1 year</option>
          </select>
        </div>

        {/* 1c. Time bucket */}
        <div className="field-row">
          <label htmlFor="dual-time-bucket">Time bucket</label>
          <select
            id="dual-time-bucket"
            value={timeBucket}
            onChange={(e) =>
              updateConfig({ timeBucket: e.target.value as TimeBucket })
            }
          >
            <option value="none">No aggregation</option>
            <option value="7d">Week (start Monday)</option>
            <option value="30d">Month (calendar start)</option>
            <option value="90d">Quarter (calendar start)</option>
            <option value="180d">Half year (Jan/Jul)</option>
            <option value="1y">Year (Jan 1)</option>
          </select>
          <p className="field-help">
            Buckets datetime x-values and sums all series before plotting.
          </p>
        </div>

        {/* 2. Left series */}
        <div className="field-row">
          <label htmlFor="dual-left-series">
            Left series (one per line: name: v1 v2 v3)
          </label>
          <textarea
            id="dual-left-series"
            value={ySeriesText}
            onChange={(e) => handleYSeriesTextChange(e.target.value)}
            rows={4}
            className="ai-chat-input" // reuse textarea styling (small, rounded)
          />
          <p className="field-help">
            Example: <code>Volume: 10 20 15 30</code>. One line per series.
          </p>
        </div>

        {/* 3. Left axis label */}
        <div className="field-row">
          <label htmlFor="dual-left-axis-label">Left axis label</label>
          <input
            id="dual-left-axis-label"
            type="text"
            value={config.ylabel_left ?? ""}
            onChange={(e) => updateConfig({ ylabel_left: e.target.value })}
          />
        </div>

        {/* 4. Left axis type (left series type) */}
        <div className="field-row">
          <label htmlFor="dual-left-axis-type">Left axis type</label>
          <select
            id="dual-left-axis-type"
            value={config.left_series_type ?? "line"}
            onChange={(e) =>
              updateConfig({
                left_series_type:
                  (e.target.value as DualConfig["left_series_type"]) || "line",
              })
            }
          >
            <option value="line">Line</option>
            <option value="area">Area (stacked)</option>
            <option value="bar">Bar (stacked)</option>
          </select>
        </div>

        {/* 5. Log scale (left) */}
        <div className="field-row">
          {renderCheckboxPill(
            "dual-log-left",
            "Log scale (left)",
            !!config.log_left,
            (value) => updateConfig({ log_left: value }),
          )}
        </div>

        {/* 6. Force zero in range (left) */}
        <div className="field-row">
          {renderCheckboxPill(
            "dual-zero-left",
            "Force zero in range (left)",
            !!config.include_zero_left,
            (value) => updateConfig({ include_zero_left: value }),
          )}
        </div>

        {/* 7. Right series (optional) */}
        <div className="field-row">
          <label htmlFor="dual-right-series">
            Right series (comma-separated numbers, optional)
          </label>
          <input
            id="dual-right-series"
            type="text"
            value={(config.right_series ?? []).join(", ")}
            onChange={(e) =>
              updateConfig({
                right_series: e.target.value
                  ? parseNumberList(e.target.value)
                  : null,
              })
            }
          />
        </div>

        {/* 8. Right axis label */}
        <div className="field-row">
          <label htmlFor="dual-right-axis-label">Right axis label</label>
          <input
            id="dual-right-axis-label"
            type="text"
            value={config.ylabel_right ?? ""}
            onChange={(e) =>
              updateConfig({ ylabel_right: e.target.value || null })
            }
          />
        </div>

        {/* 9. Right series type */}
        <div className="field-row">
          <label htmlFor="dual-right-series-type">Right series type</label>
          <select
            id="dual-right-series-type"
            value={config.right_series_type ?? "line"}
            onChange={(e) =>
              updateConfig({
                right_series_type:
                  (e.target.value as DualConfig["right_series_type"]) || "line",
              })
            }
          >
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="bar">Bar</option>
          </select>
        </div>

        {/* 10. Right color (hex) */}
        <div className="field-row">
          <label htmlFor="dual-right-color">Right color (hex)</label>
          <input
            id="dual-right-color"
            type="text"
            value={config.right_color_hex ?? ""}
            onChange={(e) =>
              updateConfig({ right_color_hex: e.target.value })
            }
          />
        </div>

        {/* 11. Log scale (right) */}
        <div className="field-row">
          {renderCheckboxPill(
            "dual-log-right",
            "Log scale (right)",
            !!config.log_right,
            (value) => updateConfig({ log_right: value }),
          )}
        </div>

        {/* 12. Force zero in range (right) */}
        <div className="field-row">
          {renderCheckboxPill(
            "dual-zero-right",
            "Force zero in range (right)",
            !!config.include_zero_right,
            (value) => updateConfig({ include_zero_right: value }),
          )}
        </div>

        {/* Highlight editor at the bottom of the section */}
        <div className="field-row">
          <HighlightEditor
            xValues={xValues}
            leftSeriesLabels={leftSeriesLabels}
            uiRegions={uiRegions}
            uiPoints={uiPoints}
            onChange={handleHighlightsChange}
          />
        </div>
      </div>
    </section>
  );
}
