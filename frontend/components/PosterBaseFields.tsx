// app/components/PosterBaseFields.tsx
"use client";

import { useState, useRef } from "react";
import type { PosterConfig } from "@/lib/types";

interface Props {
  config: PosterConfig;
  onChange: (config: PosterConfig) => void;
}

export function PosterBaseFields({ config, onChange }: Props) {
  const [uploadingCenter, setUploadingCenter] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const update = (patch: Partial<PosterConfig>) =>
    onChange({ ...config, ...patch } as PosterConfig);

  const templateName = (config as any).template_name ?? "main";

  const handleCenterImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadError(null);
      setUploadingCenter(true);

      const res = await fetch("/api/poster/upload/center-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { path: string };
      update({ center_image: data.path } as PosterConfig);
    } catch (e: any) {
      console.error(e);
      setUploadError(e.message ?? "Failed to upload center image");
    } finally {
      setUploadingCenter(false);
    }
  };

  return (
    <section className="config-card">
      <div className="config-card-header">
        <h2 className="config-card-title">Poster basics</h2>
        <p className="config-card-subtitle">
          Core metadata used across all poster types.
        </p>
      </div>

      <div className="config-card-body">
        <div className="field-row">
          <label htmlFor="poster-title">Title</label>
          <input
            id="poster-title"
            type="text"
            value={config.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Swappers & token price — last 30 days"
          />
          <p className="field-help">Shown prominently at the top of the poster.</p>
        </div>

        <div className="field-row">
          <label htmlFor="poster-subtitle">Subtitle</label>
          <input
            id="poster-subtitle"
            type="text"
            value={config.subtitle ?? ""}
            onChange={(e) => update({ subtitle: e.target.value })}
            placeholder="Short one-line explanation or context"
          />
          <p className="field-help">
            Optional line below the title to clarify the chart.
          </p>
        </div>

        <div className="field-row">
          <label htmlFor="poster-note">Footer note</label>
          <input
            id="poster-note"
            type="text"
            value={config.note_value ?? ""}
            onChange={(e) => update({ note_value: e.target.value })}
            placeholder="Data source, methodology, disclaimers…"
          />
          <p className="field-help">
            Appears in the footer; great for data source and caveats.
          </p>
        </div>

        <div className="field-row">
          <label htmlFor="poster-template">Template</label>
          <select
            id="poster-template"
            value={templateName}
            onChange={(e) =>
              update({
                template_name: e.target.value,
              } as any)
            }
          >
            <option value="main">Main</option>
          </select>
          <p className="field-help">
            Controls overall layout and sizing presets.
          </p>
        </div>

        <div className="field-row">
          <label htmlFor="poster-date">Footer date override</label>
          <input
            id="poster-date"
            type="text"
            placeholder="Leave empty to use today's date"
            value={config.date_str ?? ""}
            onChange={(e) =>
              update({ date_str: e.target.value || undefined } as PosterConfig)
            }
          />
          <p className="field-help">
            ISO date or custom string; blank will auto-use today.
          </p>
        </div>

        <div className="field-row">
        <label>Center image</label>

        <div
          className={
            "center-image-box" +
            (config.center_image ? " center-image-box--has-image" : "")
          }
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadingCenter && (
            <span className="center-image-text">Uploading…</span>
          )}

          {!uploadingCenter && !config.center_image && (
            <span className="center-image-text">
              Click to upload an image
            </span>
          )}

          {!uploadingCenter && config.center_image && (
            <>
              <div className="center-image-preview-wrapper">
                <img
                  src={config.center_image}
                  alt="Center"
                  className="center-image-preview"
                />
              </div>
              <span className="center-image-text center-image-text--sub">
                Image attached — click to replace
              </span>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="center-image-input-hidden"
          onChange={(e) => handleCenterImageUpload(e.target.files)}
          disabled={uploadingCenter}
        />

        {uploadError && (
          <span className="field-status field-status--error">
            {uploadError}
          </span>
        )}

        <p className="field-help">
          Optional focal image (e.g., logo or protocol icon) rendered in the
          chart area.
        </p>
      </div>
      </div>
    </section>
  );
}
