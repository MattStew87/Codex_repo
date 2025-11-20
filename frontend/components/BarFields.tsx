// app/components/BarFields.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import type { BarConfig, Orientation } from "@/lib/types";

// Talk to Next.js route, which proxies to FastAPI
const LABEL_UPLOAD_URL = "/api/poster/upload/label-images";

interface Props {
  config: BarConfig;
  onChange: (config: BarConfig) => void;
}

export function BarFields({ config, onChange }: Props) {
  // Normalize potentially-missing fields so the UI is always controlled
  const labels = config.labels ?? [];
  const values = config.values ?? [];
  const colors = config.colors_hex ?? [];

  const labelCount = labels.length;

  const update = (patch: Partial<BarConfig>) =>
    onChange({ ...config, ...patch });

  const labelsCsv = labels.join(", ");
  const valuesCsv = values.join(", ");
  const colorsCsv = colors.join(", ");

  const parseNumberList = (raw: string): number[] =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => !Number.isNaN(n));

  // Client-only preview URLs for thumbnails; same length as labels
  const [labelPreviewUrls, setLabelPreviewUrls] = useState<(string | null)[]>(
    [],
  );

  // Ref array for per-label hidden file inputs
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Keep preview array aligned with label count
  useEffect(() => {
    setLabelPreviewUrls((prev) => {
      const L = labelCount;
      if (prev.length === L) return prev;
      const next: (string | null)[] = new Array(L).fill(null);
      for (let i = 0; i < L; i++) {
        next[i] = prev[i] ?? null;
      }
      return next;
    });
  }, [labelCount]);

  // Upload a single image for a specific label index
  const handleUploadLabelImageForIndex = async (
    idx: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      e.target.value = "";
      return;
    }

    const file = files[0];

    if (idx < 0 || idx >= labelCount) {
      console.warn("Invalid label index for upload:", idx);
      e.target.value = "";
      return;
    }

    // Normalize existing label_images to exact length = labels.length
    const currentImages: (string | null)[] = new Array(labelCount).fill(null);
    const existing = config.label_images ?? [];
    for (let i = 0; i < labelCount; i++) {
      currentImages[i] = (existing[i] ?? null) as string | null;
    }

    const form = new FormData();
    // Must be "files" to match FastAPI `files: List[UploadFile] = File(...)`
    form.append("files", file, file.name);

    try {
      const res = await fetch(LABEL_UPLOAD_URL, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Label image upload failed:", res.status, text);
        return;
      }

      const data = (await res.json()) as { paths: string[] };
      if (!data || !Array.isArray(data.paths) || data.paths.length === 0) {
        console.error("Label upload response missing paths[]:", data);
        return;
      }

      const path = data.paths[0];
      currentImages[idx] = path;

      const objectUrl = URL.createObjectURL(file);

      // Update config + previews (revoking old URL if present)
      update({
        label_images: currentImages,
      });

      setLabelPreviewUrls((prev) => {
        const next = [...prev];
        const oldUrl = next[idx];
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
        }
        next[idx] = objectUrl;
        return next;
      });
    } catch (err) {
      console.error("Label image upload error:", err);
    } finally {
      // allow re-uploading the same file
      e.target.value = "";
    }
  };

  const handleRemoveLabelImage = (idx: number) => {
    if (idx < 0 || idx >= labelCount) return;

    const currentImages: (string | null)[] = new Array(labelCount).fill(null);
    const existing = config.label_images ?? [];
    for (let i = 0; i < labelCount; i++) {
      currentImages[i] = (existing[i] ?? null) as string | null;
    }

    currentImages[idx] = null;

    update({
      label_images: currentImages,
    });

    setLabelPreviewUrls((prev) => {
      const next = [...prev];
      const url = next[idx];
      if (url) {
        URL.revokeObjectURL(url);
      }
      next[idx] = null;
      return next;
    });
  };

  return (
    <section className="config-card">
      <div className="config-card-header">
        <h2 className="config-card-title">Bar chart data</h2>
        <p className="config-card-subtitle">
          Labels, values, orientation, and per-label images for this bar chart.
        </p>
      </div>

      <div className="config-card-body">
        {/* 1. Labels */}
        <div className="field-row">
          <label htmlFor="bar-labels">Labels (comma-separated)</label>
          <input
            id="bar-labels"
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
            placeholder="Ethereum, Solana, Base"
          />
          <p className="field-help">
            One label per bar, left to right (or bottom to top).
          </p>
        </div>

        {/* 2. Values */}
        <div className="field-row">
          <label htmlFor="bar-values">Values (comma-separated numbers)</label>
          <input
            id="bar-values"
            type="text"
            value={valuesCsv}
            onChange={(e) => update({ values: parseNumberList(e.target.value) })}
            placeholder="120, 80, 40"
          />
          <p className="field-help">
            Must be numeric; invalid entries are ignored.
          </p>
        </div>

        {/* 3. Colors */}
        <div className="field-row">
          <label htmlFor="bar-colors">
            Colors (hex, comma-separated, optional)
          </label>
          <input
            id="bar-colors"
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
            Leave blank to use defaults. Provide one hex per bar (e.g. #6366f1).
          </p>
        </div>

        {/* 4. Orientation */}
        <div className="field-row">
          <label htmlFor="bar-orientation">Orientation</label>
          <select
            id="bar-orientation"
            value={config.orientation ?? ("horizontal" as Orientation)}
            onChange={(e) =>
              update({ orientation: e.target.value as Orientation })
            }
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
          <p className="field-help">
            Horizontal works well for longer labels; vertical is more compact.
          </p>
        </div>

        {/* 5. Value axis label */}
        <div className="field-row">
          <label htmlFor="bar-value-axis-label">Value axis label</label>
          <input
            id="bar-value-axis-label"
            type="text"
            value={config.value_axis_label ?? ""}
            onChange={(e) =>
              update({
                value_axis_label: e.target.value,
              })
            }
            placeholder="Volume (M USD), Users, etc."
          />
          <p className="field-help">
            Text shown on the numeric axis (e.g. &quot;Volume (M USD)&quot;).
          </p>
        </div>

        {/* 6. Label images (per-label chips, last) */}
        {labelCount > 0 && (
          <div className="field-row">
            <label>Per-label images</label>
            <p className="field-help">
              Click a label chip to add or replace its image. Use the × to
              remove.
            </p>

            <div className="label-images-grid">
              {labels.map((label, idx) => {
                const hasImage = !!config.label_images?.[idx];
                const previewUrl = labelPreviewUrls[idx];

                return (
                  <div
                    key={label + idx}
                    className="label-image-pill"
                    onClick={() => {
                      const input = fileInputRefs.current[idx];
                      input?.click();
                    }}
                  >
                    <span className="label-image-pill-label">{label}</span>

                    {hasImage && previewUrl && (
                      <div className="label-image-thumb-wrapper">
                        <img
                          src={previewUrl}
                          alt={label}
                          className="label-image-thumb"
                        />
                      </div>
                    )}

                    {hasImage && !previewUrl && (
                      <span className="label-image-pill-status label-image-pill-status--has-image">
                        image attached
                      </span>
                    )}

                    {!hasImage && (
                      <span className="label-image-pill-status">
                        no image (click to add)
                      </span>
                    )}

                    <input
                      ref={(el) => {
                        fileInputRefs.current[idx] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="label-image-pill-input-hidden"
                      onChange={(e) =>
                        handleUploadLabelImageForIndex(idx, e)
                      }
                    />

                    {hasImage && (
                      <button
                        type="button"
                        className="label-image-remove-btn"
                        onClick={(evt) => {
                          evt.stopPropagation(); // don't also open file dialog
                          handleRemoveLabelImage(idx);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
