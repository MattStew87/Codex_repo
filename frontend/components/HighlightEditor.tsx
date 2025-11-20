"use client";

import type { UiRegion, UiPoint } from "@/lib/types";

interface HighlightEditorProps {
  xValues: string[];          // DualConfig.x_values
  leftSeriesLabels: string[]; // Object.keys(DualConfig.y_series)
  uiRegions: UiRegion[];
  uiPoints: UiPoint[];
  onChange: (regions: UiRegion[], points: UiPoint[]) => void;
}

const makeId = () => Math.random().toString(36).slice(2);

function xLabel(x: string) {
  // hook to pretty-format dates later
  return x;
}

export function HighlightEditor({
  xValues,
  leftSeriesLabels,
  uiRegions,
  uiPoints,
  onChange,
}: HighlightEditorProps) {
  const canEdit = xValues.length > 0;

  const xOptions = xValues.map((x, idx) => ({
    idx,
    label: `${idx}: ${xLabel(x)}`,
  }));

  const updateRegions = (next: UiRegion[]) => onChange(next, uiPoints);
  const updatePoints = (next: UiPoint[]) => onChange(uiRegions, next);

  // ----- Regions -----
  const addRegion = () => {
    if (!canEdit) return;
    const idx0 = 0;
    const region: UiRegion = {
      id: makeId(),
      startIndex: idx0,
      endIndex: idx0,
      label: "",
    };
    updateRegions([...uiRegions, region]);
  };

  const updateRegionAt = (idx: number, patch: Partial<UiRegion>) => {
    const next = uiRegions.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    updateRegions(next);
  };

  const removeRegionAt = (idx: number) => {
    const next = uiRegions.filter((_, i) => i !== idx);
    updateRegions(next);
  };

  // ----- Points -----
  const addPoint = () => {
    if (!canEdit) return;
    const defaultSeries = leftSeriesLabels[0] ?? "Series 0";
    const pt: UiPoint = {
      id: makeId(),
      xIndex: 0,
      axis: "left",
      seriesKey: defaultSeries,
      label: "",
    };
    updatePoints([...uiPoints, pt]);
  };

  const updatePointAt = (idx: number, patch: Partial<UiPoint>) => {
    const next = uiPoints.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    updatePoints(next);
  };

  const removePointAt = (idx: number) => {
    const next = uiPoints.filter((_, i) => i !== idx);
    updatePoints(next);
  };

  return (
    <div className="highlight-section">
      <div className="highlight-header">
        <h3 className="highlight-title">Highlights</h3>
        <span className="badge-soft">New</span>
      </div>

      {!canEdit && (
        <p className="helper-text">
          Add x-values first to enable highlight editing.
        </p>
      )}

      {/* Regions */}
      <div className="stack">
        <div className="inline-between">
          <span className="text-small text-semibold">Highlight bands</span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={addRegion}
            className="chip-button"
          >
            + Add band
          </button>
        </div>

        {uiRegions.length === 0 && (
          <p className="highlight-empty">No highlight bands yet.</p>
        )}

        {uiRegions.map((r, idx) => (
          <div key={r.id} className="highlight-chip">
            <span className="text-tiny text-muted">From</span>
            <select
              value={r.startIndex ?? ""}
              onChange={(e) =>
                updateRegionAt(idx, {
                  startIndex:
                    e.target.value === ""
                      ? null
                      : Number.parseInt(e.target.value, 10),
                })
              }
              disabled={!canEdit}
              className="pill-select"
            >
              <option value="">(none)</option>
              {xOptions.map((o) => (
                <option key={o.idx} value={o.idx}>
                  {o.label}
                </option>
              ))}
            </select>

            <span className="text-tiny text-muted">to</span>
            <select
              value={r.endIndex ?? ""}
              onChange={(e) =>
                updateRegionAt(idx, {
                  endIndex:
                    e.target.value === ""
                      ? null
                      : Number.parseInt(e.target.value, 10),
                })
              }
              disabled={!canEdit}
              className="pill-select"
            >
              <option value="">(none)</option>
              {xOptions.map((o) => (
                <option key={o.idx} value={o.idx}>
                  {o.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Label (e.g. Launch window)"
              value={r.label}
              onChange={(e) => updateRegionAt(idx, { label: e.target.value })}
              onKeyDown={(e) => {
                // prevent parent key handlers from stealing Backspace/Space
                e.stopPropagation();
              }}
              className="pill-input"
            />

            <button
              type="button"
              onClick={() => removeRegionAt(idx)}
              className="chip-button chip-button--danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Points */}
      <div>
        <div className="inline-between">
          <span className="text-small text-semibold">Highlight points</span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={addPoint}
            className="chip-button"
          >
            + Add point
          </button>
        </div>

        {uiPoints.length === 0 && (
          <p className="highlight-empty">No highlight points yet.</p>
        )}

        {uiPoints.map((p, idx) => (
          <div key={p.id} className="highlight-chip">
            <span className="text-tiny text-muted">X</span>
            <select
              value={p.xIndex ?? ""}
              onChange={(e) =>
                updatePointAt(idx, {
                  xIndex:
                    e.target.value === ""
                      ? null
                      : Number.parseInt(e.target.value, 10),
                })
              }
              disabled={!canEdit}
              className="pill-select"
            >
              <option value="">(none)</option>
              {xOptions.map((o) => (
                <option key={o.idx} value={o.idx}>
                  {o.label}
                </option>
              ))}
            </select>

            <span className="text-tiny text-muted">axis</span>
            <select
              value={p.axis}
              onChange={(e) =>
                updatePointAt(idx, {
                  axis: e.target.value === "right" ? "right" : "left",
                  seriesKey:
                    e.target.value === "right"
                      ? "right"
                  : leftSeriesLabels[0] ?? p.seriesKey,
                })
              }
              className="pill-select"
            >
              <option value="left">left</option>
              <option value="right">right</option>
            </select>

            {p.axis === "left" && (
              <>
                <span className="text-tiny text-muted">series</span>
                <select
                  value={p.seriesKey}
                  onChange={(e) =>
                    updatePointAt(idx, { seriesKey: e.target.value })
                  }
                  className="pill-select"
                >
                  {leftSeriesLabels.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </>
            )}

            <input
              type="text"
              placeholder="Label (e.g. Usage spike)"
              value={p.label}
              onChange={(e) => updatePointAt(idx, { label: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
              }}
              className="pill-input"
            />

            <button
              type="button"
              onClick={() => removePointAt(idx)}
              className="chip-button chip-button--danger"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
