// app/components/DualDataBindingSection.tsx
"use client";

import { useEffect, useState } from "react";
import type {
  DualConfig,
  DualDataBinding,
  DualAxisBinding,
  TimeseriesQueryResponse,
} from "@/lib/types";

interface Props {
  config: DualConfig;
  binding: DualDataBinding | null;
  onConfigChange: (cfg: DualConfig) => void;
  onBindingChange: (b: DualDataBinding) => void;
}

interface CatalogDbResponse {
  dbs: string[];
}
interface CatalogTablesResponse {
  db: string;
  tables: string[];
}
interface CatalogColumnsResponse {
  db: string;
  table: string;
  columns: string[];
}

type AxisSide = "left" | "right";
type MissingMode = DualAxisBinding["missing_mode"];

// Clamp colors_hex to the number of left-series
const buildColorsForLeftSeries = (
  ySeries: Record<string, number[]> | undefined,
  existingColors: string[] | undefined,
): string[] => {
  const names = ySeries ? Object.keys(ySeries) : [];
  const seriesCount = names.length;
  if (seriesCount === 0) return [];

  const palette = [
    "#1C5C3D",
    "#D97706",
    "#2563EB",
    "#10B981",
    "#F97316",
    "#7C3AED",
    "#F59E0B",
  ];
  const base = existingColors ?? [];

  const out: string[] = [];
  for (let i = 0; i < seriesCount; i++) {
    out.push(base[i] ?? palette[i % palette.length]);
  }
  return out;
};

const normalizeMissingMode = (mode: MissingMode): MissingMode =>
  mode === "forward_fill" ? "forward_fill" : "zero";

const alignSeriesToUnion = (
  unionX: string[],
  idxMap: Record<string, number>,
  series: number[],
  mode: MissingMode,
): number[] => {
  let last: number | null = null;

  return unionX.map((x) => {
    const i = idxMap[x];
    const raw = i === undefined ? null : series[i];

    if (raw == null || Number.isNaN(raw)) {
      if (mode === "forward_fill" && last !== null) {
        return last;
      }
      return 0;
    }

    last = raw;
    return raw;
  });
};

const createDefaultAxis = (): DualAxisBinding => ({
  kind: "dual",
  db: "plasma",
  table: "",
  x_column: "",
  series: [],
  grouped: false,
  group_column: "",
  missing_mode: "zero",
});

export function DualDataBindingSection({
  config,
  binding,
  onConfigChange,
  onBindingChange,
}: Props) {
  const [dbs, setDbs] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  // Which side are we binding right now?
  const [side, setSide] = useState<AxisSide>("left");

  // Local binding state (full left+right DualDataBinding)
  const [bindingState, setBindingState] = useState<DualDataBinding>(() =>
    binding ?? {
      kind: "dual", 
      left: createDefaultAxis(),
      right: createDefaultAxis(),
    },
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync from parent (e.g., AI or reset)
  useEffect(() => {
    if (binding) {
      setBindingState((prev) => ({
        kind: "dual", 
        left: binding.left ?? prev.left ?? createDefaultAxis(),
        right: binding.right ?? prev.right ?? createDefaultAxis(),
      }));
    }
  }, [binding]);

  // Convenience: current axis we're editing
  const activeAxis: DualAxisBinding =
    (side === "left" ? bindingState.left : bindingState.right) ??
    createDefaultAxis();

  const activeDb = activeAxis.db;
  const activeTable = activeAxis.table;

  const updateActiveAxis = (patch: Partial<DualAxisBinding>) => {
    setBindingState((prev) => {
      const current =
        (side === "left" ? prev.left : prev.right) ?? createDefaultAxis();
      const nextAxis: DualAxisBinding = { ...current, ...patch };

      const next: DualDataBinding =
        side === "left"
          ? { ...prev, left: nextAxis }
          : { ...prev, right: nextAxis };

      return next;
    });
  };

  // --- Catalog loading: DB list ---

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/catalog");
        const json = (await res.json()) as CatalogDbResponse;
        setDbs(json.dbs || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const loadTables = async (db: string) => {
    try {
      const res = await fetch(`/api/catalog?db=${encodeURIComponent(db)}`);
      const json = (await res.json()) as CatalogTablesResponse;
      setTables(json.tables || []);
    } catch (e) {
      console.error(e);
      setTables([]);
    }
  };

  const loadColumns = async (db: string, table: string) => {
    try {
      const res = await fetch(
        `/api/catalog?db=${encodeURIComponent(db)}&table=${encodeURIComponent(table)}`,
      );
      const json = (await res.json()) as CatalogColumnsResponse;
      setColumns(json.columns || []);
    } catch (e) {
      console.error(e);
      setColumns([]);
    }
  };

  // React whenever active axis db changes
  useEffect(() => {
    if (!activeDb) {
      setTables([]);
      setColumns([]);
      return;
    }
    void loadTables(activeDb);
  }, [activeDb]);

  // React whenever active axis table changes
  useEffect(() => {
    if (!activeDb || !activeTable) {
      setColumns([]);
      return;
    }
    void loadColumns(activeDb, activeTable);
  }, [activeDb, activeTable]);

  const handleDbChange = (db: string) => {
    updateActiveAxis({
      db,
      table: "",
      x_column: "",
      series: [],
      group_column: activeAxis.grouped ? "" : activeAxis.group_column,
    });
  };

  const handleTableChange = (table: string) => {
    updateActiveAxis({
      table,
      x_column: "",
      series: [],
      group_column: activeAxis.grouped ? "" : activeAxis.group_column,
    });
  };

  // --- Core: apply data and keep left/right + x_values in sync ---

  const handleApplyData = async () => {
    setError(null);
    setLoading(true);
    try {
      // Snapshot the axis we're applying right now
      const axis: DualAxisBinding =
        (side === "left" ? bindingState.left : bindingState.right) ??
        createDefaultAxis();

      // Build payload that /api/query expects (single-axis binding)
      const payload = {
        kind: axis.kind,
        db: axis.db,
        table: axis.table,
        x_column: axis.x_column,
        series: axis.series ?? [],
        grouped: side === "left" ? axis.grouped ?? false : false,
        group_column: side === "left" ? axis.group_column ?? "" : "",
        missing_mode: normalizeMissingMode(axis.missing_mode),
      };

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to fetch timeseries");
      }
      const data = (await res.json()) as TimeseriesQueryResponse;

      const newX = data.x_values ?? [];
      const newYSeries = data.y_series ?? {};

      const leftMissingMode = normalizeMissingMode(
        bindingState.left?.missing_mode,
      );
      const rightMissingMode = normalizeMissingMode(
        bindingState.right?.missing_mode,
      );
      const activeMissingMode =
        side === "left" ? leftMissingMode : rightMissingMode;

      const prevX = config.x_values ?? [];
      const prevY = config.y_series ?? {};
      const prevRight = config.right_series ?? [];

      // Build union of timestamps (as strings) from previous config + new data.
      const unionSet = new Set<string>();
      prevX.forEach((x) => unionSet.add(x));
      newX.forEach((x) => unionSet.add(x));
      const unionX = Array.from(unionSet).sort(
        (a, b) => Date.parse(a) - Date.parse(b),
      );

      // Build index maps for old and new x arrays
      const prevIdx: Record<string, number> = {};
      prevX.forEach((x, i) => {
        prevIdx[x] = i;
      });

      const newIdx: Record<string, number> = {};
      newX.forEach((x, i) => {
        newIdx[x] = i;
      });

      let nextY: Record<string, number[]> = {};
      let nextRight: number[] | undefined;

      if (side === "left") {
        // LEFT: replace left-series with new data, keep right-series and realign it.

        // Realign new left-series to unionX
        Object.entries(newYSeries).forEach(([name, arr]) => {
          nextY[name] = alignSeriesToUnion(
            unionX,
            newIdx,
            arr,
            activeMissingMode,
          );
        });

        // Realign previous right_series (if present) to unionX
        if (prevRight.length > 0 && prevX.length > 0) {
          nextRight = alignSeriesToUnion(
            unionX,
            prevIdx,
            prevRight,
            rightMissingMode,
          );
        } else if (config.right_series) {
          // Keep explicit "no right" if previously set
          nextRight = config.right_series;
        }
      } else {
        // RIGHT: keep existing left-series, replace right-series from the
        // first returned series of newYSeries and realign everything.

        const seriesNames = Object.keys(newYSeries);
        if (seriesNames.length === 0) {
          throw new Error("Timeseries response had no series for right axis");
        }
        const firstName = seriesNames[0];
        const rightRaw = newYSeries[firstName];

        // Realign existing left-series to unionX
        Object.entries(prevY).forEach(([name, arr]) => {
          nextY[name] = alignSeriesToUnion(
            unionX,
            prevIdx,
            arr,
            leftMissingMode,
          );
        });

        // Realign new right-series to unionX
        nextRight = alignSeriesToUnion(
          unionX,
          newIdx,
          rightRaw,
          activeMissingMode,
        );
      }

      // Rebuild colors for left axis
      const colors = buildColorsForLeftSeries(
        nextY,
        config.colors_hex ?? [],
      );

      onConfigChange({
        ...config,
        x_values: unionX,
        y_series: nextY,
        right_series: nextRight,
        colors_hex: colors,
      });

      onBindingChange(bindingState);

      // bindingState already kept in sync via updateActiveAxis; no extra push needed.
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSeriesKey = (idx: number, key: string) => {
    const series = [...(activeAxis.series ?? [])];
    series[idx] = { ...series[idx], key };
    updateActiveAxis({ series });
  };

  const handleUpdateSeriesValueCol = (idx: number, col: string) => {
    const series = [...(activeAxis.series ?? [])];
    series[idx] = { ...series[idx], value_column: col };
    updateActiveAxis({ series });
  };

  const addSeries = () => {
    // For right axis, only allow a single series
    if (side === "right" && (activeAxis.series?.length ?? 0) >= 1) {
      return;
    }
    const series = [
      ...(activeAxis.series ?? []),
      {
        key: `Series ${(activeAxis.series ?? []).length + 1}`,
        value_column: "",
      },
    ];
    updateActiveAxis({ series });
  };

  const removeSeries = (idx: number) => {
    const series = (activeAxis.series ?? []).filter((_, i) => i !== idx);
    updateActiveAxis({ series });
  };

  const requiresGroupColumn =
    side === "left" && (activeAxis.grouped ?? false);

  const seriesCount = activeAxis.series?.length ?? 0;

  const canApply =
    !loading &&
    activeAxis.db &&
    activeAxis.table &&
    activeAxis.x_column &&
    seriesCount > 0 &&
    (activeAxis.series ?? []).every((s) => s.value_column) &&
    (side === "left" || seriesCount === 1) && // right side: exactly one series
    (!requiresGroupColumn || !!activeAxis.group_column);

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

  return (
    <div className="data-binding-card">
      <h3 className="data-binding-title">Data binding</h3>
      <p className="data-binding-subtitle">
        Bind each axis to a data source. Right axis accepts a single series for
        clarity.
      </p>

      {/* Target axis selector */}
      <div className="field-row">
        <label>Target axis</label>
        <select
          value={side}
          onChange={(e) => setSide(e.target.value as AxisSide)}
        >
          <option value="left">Left axis</option>
          <option value="right">Right axis</option>
        </select>
      </div>

      <div className="field-row">
        <label>Schema</label>
        <select
          value={activeDb ?? ""}
          onChange={(e) => handleDbChange(e.target.value)}
        >
          <option value="">Select schema</option>
          {dbs.map((db) => (
            <option key={db} value={db}>
              {db}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <label>Table</label>
        <select
          value={activeTable ?? ""}
          onChange={(e) => handleTableChange(e.target.value)}
          disabled={!activeDb}
        >
          <option value="">Select table</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <label>X column</label>
        <select
          value={activeAxis.x_column ?? ""}
          onChange={(e) => updateActiveAxis({ x_column: e.target.value })}
          disabled={!activeTable}
        >
          <option value="">Select x column</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <label>Missing data handling</label>
        <select
          value={normalizeMissingMode(activeAxis.missing_mode)}
          onChange={(e) =>
            updateActiveAxis({
              missing_mode: e.target.value as MissingMode,
            })
          }
        >
          <option value="zero">Fill gaps with 0</option>
          <option value="forward_fill">Carry last value forward</option>
        </select>
        <p className="field-help">
          Choose how to fill missing points for this axis when a timestamp is
          absent.
        </p>
      </div>

      {/* Grouped toggle + group column (left axis only) */}
      {side === "left" && (
        <div className="field-row">
          {renderCheckboxPill(
            "dual-group-toggle",
            "Group by column",
            activeAxis.grouped ?? false,
            (value) =>
              updateActiveAxis({
                grouped: value,
                group_column: value ? activeAxis.group_column ?? "" : "",
              }),
          )}
        </div>
      )}

      {side === "left" && (activeAxis.grouped ?? false) && (
        <div className="field-row">
          <label>Group column</label>
          <select
            value={activeAxis.group_column ?? ""}
            onChange={(e) =>
              updateActiveAxis({ group_column: e.target.value })
            }
            disabled={!activeTable}
          >
            <option value="">Select group column</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="stack">
        <div className="inline-between">
          <span className="text-small text-semibold">
            {side === "left"
              ? "Left-axis series bindings"
              : "Right-axis series binding"}
          </span>
          <button type="button" onClick={addSeries}>
            + Add series
          </button>
        </div>

        {seriesCount === 0 && (
          <p className="helper-text">No series bound yet.</p>
        )}

        {(activeAxis.series ?? []).map((s, idx) => (
          <div key={idx} className="inline-field-row">
            <input
              type="text"
              placeholder="Series label"
              value={s.key ?? ""}
              onChange={(e) => handleUpdateSeriesKey(idx, e.target.value)}
            />
            <select
              value={s.value_column ?? ""}
              onChange={(e) => handleUpdateSeriesValueCol(idx, e.target.value)}
            >
              <option value="">Value column</option>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => removeSeries(idx)}>
              ×
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="helper-text text-danger">{error}</p>
      )}

      <div className="data-binding-actions">
        <button type="button" onClick={handleApplyData} disabled={!canApply}>
          {loading ? "Loading…" : "Apply data to chart"}
        </button>
      </div>
    </div>
  );
}
