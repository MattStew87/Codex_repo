// app/components/HighlightEditor.tsx
"use client";

import type { CSSProperties } from "react";
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

  const sharedSelectStyle: CSSProperties = {
    fontSize: "0.75rem",
    backgroundColor: "#ffffff",
    borderRadius: "0.375rem",
    border: "1px solid #d1d5db",
    padding: "0.15rem 0.35rem",
  };

  const pillStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.4rem",
    alignItems: "center",
    marginBottom: "0.25rem",
    padding: "0.35rem 0.5rem",
    borderRadius: "0.75rem",
    background: "#e5e7eb",
    border: "1px solid #d1d5db",
  };

  const smallButtonStyle: CSSProperties = {
    fontSize: "0.75rem",
    padding: "0.15rem 0.55rem",
    borderRadius: "999px",
    border: "1px solid #111827",
    background: "#111827",
    color: "#f9fafb",
    cursor: "pointer",
  };

  const smallButtonDisabledStyle: CSSProperties = {
    ...smallButtonStyle,
    background: "#9ca3af",
    borderColor: "#9ca3af",
    cursor: "not-allowed",
  };

  return (
    <div
      style={{
        borderTop: "1px solid #d1d5db",
        marginTop: "1rem",
        paddingTop: "0.75rem",
      }}
    >
      <h3
        style={{
          fontSize: "0.9rem",
          fontWeight: 700,
          marginBottom: "0.5rem",
          color: "#111827",
        }}
      >
        Highlights
      </h3>

      {!canEdit && (
        <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>
          Add x-values first to enable highlight editing.
        </p>
      )}

      {/* Regions */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "0.25rem",
          }}
        >
          <span
            style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}
          >
            Highlight Bands
          </span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={addRegion}
            style={canEdit ? smallButtonStyle : smallButtonDisabledStyle}
          >
            + Add band
          </button>
        </div>

        {uiRegions.length === 0 && (
          <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
            No highlight bands yet.
          </p>
        )}

        {uiRegions.map((r, idx) => (
          <div key={r.id} style={pillStyle}>
            <span style={{ fontSize: "0.75rem", color: "#4b5563" }}>From</span>
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
              style={sharedSelectStyle}
            >
              <option value="">(none)</option>
              {xOptions.map((o) => (
                <option key={o.idx} value={o.idx}>
                  {o.label}
                </option>
              ))}
            </select>

            <span style={{ fontSize: "0.75rem", color: "#4b5563" }}>to</span>
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
              style={sharedSelectStyle}
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
              style={{
                flex: 1,
                minWidth: "8rem",
                fontSize: "0.75rem",
                padding: "0.2rem 0.45rem",
                backgroundColor: "#ffffff",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
              }}
            />

            <button
              type="button"
              onClick={() => removeRegionAt(idx)}
              style={{
                fontSize: "0.75rem",
                borderRadius: "999px",
                padding: "0.1rem 0.45rem",
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Points */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "0.25rem",
          }}
        >
          <span
            style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}
          >
            Highlight points
          </span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={addPoint}
            style={canEdit ? smallButtonStyle : smallButtonDisabledStyle}
          >
            + Add point
          </button>
        </div>

        {uiPoints.length === 0 && (
          <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
            No highlight points yet.
          </p>
        )}

        {uiPoints.map((p, idx) => (
          <div key={p.id} style={pillStyle}>
            <span style={{ fontSize: "0.75rem", color: "#4b5563" }}>X</span>
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
              style={sharedSelectStyle}
            >
              <option value="">(none)</option>
              {xOptions.map((o) => (
                <option key={o.idx} value={o.idx}>
                  {o.label}
                </option>
              ))}
            </select>

            <span style={{ fontSize: "0.75rem", color: "#4b5563" }}>axis</span>
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
              style={sharedSelectStyle}
            >
              <option value="left">left</option>
              <option value="right">right</option>
            </select>

            {p.axis === "left" && (
              <>
                <span style={{ fontSize: "0.75rem", color: "#4b5563" }}>
                  series
                </span>
                <select
                  value={p.seriesKey}
                  onChange={(e) =>
                    updatePointAt(idx, { seriesKey: e.target.value })
                  }
                  style={sharedSelectStyle}
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
              style={{
                flex: 1,
                minWidth: "8rem",
                fontSize: "0.75rem",
                padding: "0.2rem 0.45rem",
                backgroundColor: "#ffffff",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
              }}
            />

            <button
              type="button"
              onClick={() => removePointAt(idx)}
              style={{
                fontSize: "0.75rem",
                borderRadius: "999px",
                padding: "0.1rem 0.45rem",
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
