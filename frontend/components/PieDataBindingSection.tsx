// app/components/PieDataBindingSection.tsx
"use client";

import { useEffect, useState } from "react";
import type { PieConfig, PieDataBinding, PieQueryResponse } from "@/lib/types";

interface Props {
  config: PieConfig;
  binding: PieDataBinding | null;
  onConfigChange: (cfg: PieConfig) => void;
  onBindingChange: (b: PieDataBinding) => void;
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

// Keep colors_hex aligned with number of labels
const buildColorsForLabels = (
  labels: string[] | undefined,
  existingColors: string[] | undefined,
): string[] => {
  const count = labels?.length ?? 0;
  if (count === 0) return [];

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

  for (let i = 0; i < count; i++) {
    out.push(base[i] ?? palette[i % palette.length]);
  }

  return out;
};

export function PieDataBindingSection({
  config,
  binding,
  onConfigChange,
  onBindingChange,
}: Props) {
  const [dbs, setDbs] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  // Local binding state so we only apply on "Apply"
  const [bindingState, setBindingState] = useState<PieDataBinding>(() =>
    binding ?? {
      kind: "pie",
      db: "plasma",
      table: "",
      label_column: "",
      value_column: "",
    },
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync from parent binding when it changes (e.g., via chatbot)
  useEffect(() => {
    if (binding) {
      setBindingState(binding);
    }
  }, [binding]);

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

  // React whenever bindingState.db changes (user *or* AI)
  useEffect(() => {
    if (!bindingState.db) {
      setTables([]);
      setColumns([]);
      return;
    }
    void loadTables(bindingState.db);
  }, [bindingState.db]);

  // React whenever bindingState.table changes (user *or* AI)
  useEffect(() => {
    if (!bindingState.db || !bindingState.table) {
      setColumns([]);
      return;
    }
    void loadColumns(bindingState.db, bindingState.table);
  }, [bindingState.db, bindingState.table]);

  const handleDbChange = (db: string) => {
    setBindingState((prev) => ({
      ...prev,
      db,
      table: "",
      label_column: "",
      value_column: "",
    }));
    // tables/columns effects above will take care of loading
  };

  const handleTableChange = (table: string) => {
    setBindingState((prev) => ({
      ...prev,
      table,
      label_column: "",
      value_column: "",
    }));
    // columns effect will take care of loading
  };

  const handleApply = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload: PieDataBinding = bindingState;

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to fetch pie data");
      }

      const data = (await res.json()) as PieQueryResponse;
      const labels = data.labels ?? [];
      const values = data.values ?? [];

      const colors = buildColorsForLabels(
        labels,
        config.colors_hex ?? undefined,
      );

      // Apply to config (normalize arrays)
      onConfigChange({
        ...config,
        labels,
        values,
        colors_hex: colors,
      });

      // Hoist the committed binding up to Page (for chatbot, etc.)
      onBindingChange(bindingState);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const canApply =
    !loading &&
    bindingState.db &&
    bindingState.table &&
    bindingState.label_column &&
    bindingState.value_column;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "0.75rem",
        marginBottom: "0.75rem",
        background: "#f9fafb",
      }}
    >
      <h2 className="config-card-title">Data Binding</h2>
      <br /> 

      <div className="field-row">
        <label>Schema</label>
        <select
          value={bindingState.db ?? ""}
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
          value={bindingState.table ?? ""}
          onChange={(e) => handleTableChange(e.target.value)}
          disabled={!bindingState.db}
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
        <label>Label column</label>
        <select
          value={bindingState.label_column ?? ""}
          onChange={(e) =>
            setBindingState((prev) => ({
              ...prev,
              label_column: e.target.value,
            }))
          }
          disabled={!bindingState.table}
        >
          <option value="">Select label column</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <label>Value column</label>
        <select
          value={bindingState.value_column ?? ""}
          onChange={(e) =>
            setBindingState((prev) => ({
              ...prev,
              value_column: e.target.value,
            }))
          }
          disabled={!bindingState.table}
        >
          <option value="">Select value column</option>
          {columns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p
          style={{
            fontSize: "0.75rem",
            color: "#b91c1c",
            marginTop: "0.25rem",
          }}
        >
          {error}
        </p>
      )}

      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" onClick={handleApply} disabled={!canApply}>
          {loading ? "Loading…" : "Apply pie data"}
        </button>
      </div>
    </div>
  );
}
