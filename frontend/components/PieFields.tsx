// app/components/PieFields.tsx
"use client";

import type { PieConfig } from "@/lib/types";

interface Props {
  config: PieConfig;
  onChange: (config: PieConfig) => void;
}

export function PieFields({ config, onChange }: Props) {
  const update = (patch: Partial<PieConfig>) =>
    onChange({
      ...config,
      // Always keep arrays defined to avoid uncontrolled/controlled issues
      labels: config.labels ?? [],
      values: config.values ?? [],
      colors_hex:
        config.colors_hex === undefined ? null : config.colors_hex,
      ...patch,
    });

  const safeLabels = config.labels ?? [];
  const safeValues = config.values ?? [];
  const safeColors = config.colors_hex ?? [];

  const labelsCsv = safeLabels.join(", ");
  const valuesCsv = safeValues.join(", ");
  const colorsCsv = safeColors.join(", ");

  const parseNumberList = (raw: string): number[] =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => !Number.isNaN(n));

  return (
    <section className="config-card">
      <div className="config-card-header">
        <h2 className="config-card-title">Pie data</h2>
        <p className="config-card-subtitle">
          Labels, values, and optional slice colors for this poster.
        </p>
      </div>

      <div className="config-card-body">
        <div className="field-row">
          <label htmlFor="pie-labels">Labels (comma-separated)</label>
          <input
            id="pie-labels"
            type="text"
            value={labelsCsv}
            onChange={(e) =>
              update({
                labels: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0),
              })
            }
            placeholder="Swappers, Traders, Protocols"
          />
          <p className="field-help">
            One label per slice, in order. Commas separate labels.
          </p>
        </div>

        <div className="field-row">
          <label htmlFor="pie-values">Values (comma-separated numbers)</label>
          <input
            id="pie-values"
            type="text"
            value={valuesCsv}
            onChange={(e) =>
              update({ values: parseNumberList(e.target.value) })
            }
            placeholder="120, 80, 40"
          />
          <p className="field-help">
            Must be numeric; we’ll ignore invalid (NaN) entries.
          </p>
        </div>

        <div className="field-row">
          <label htmlFor="pie-colors">
            Colors (hex, comma-separated, optional)
          </label>
          <input
            id="pie-colors"
            type="text"
            value={colorsCsv}
            onChange={(e) =>
              update({
                colors_hex: e.target.value
                  ? e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0)
                  : null,
              })
            }
            placeholder="#6366f1, #f97316, #10b981"
          />
          <p className="field-help">
            Leave blank to use defaults. Provide one hex per slice (e.g.
            #6366f1).
          </p>
        </div>
      </div>
    </section>
  );
}
