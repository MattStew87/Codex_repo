// app/page.tsx (or wherever this lives)
"use client";

import { useEffect, useState } from "react";
import {
  PosterType,
  PosterConfig,
  PieConfig,
  BarConfig,
  DualConfig,
  TimeRange,
  RenderResponse,
  BindingState,       // ✅ use this instead of QueryBinding
  DualDataBinding,
  BarDataBinding,
  PieDataBinding,
  CatalogSchemaSnapshot,
  CatalogTableInfo,
} from "@/lib/types";
import { PosterTypeSelect } from "@/components/PosterTypeSelect";
import { PosterBaseFields } from "@/components/PosterBaseFields";
import { PiePosterEditor } from "@/components/PiePosterEditor";
import { BarPosterEditor } from "@/components/BarPosterEditor";
import { DualPosterEditor } from "@/components/DualPosterEditor";
import { PosterPreview } from "@/components/PosterPreview";
import { ConfigChatPanel } from "@/components/ConfigChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

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

const API_BASE = "http://127.0.0.1:8000";

function isPie(config: PosterConfig): config is PieConfig {
  return config.poster_type === "pie";
}

function isBar(config: PosterConfig): config is BarConfig {
  return config.poster_type === "bar";
}

function isDual(config: PosterConfig): config is DualConfig {
  return config.poster_type === "dual";
}

const ensureDualTimeRange = (cfg: PosterConfig): PosterConfig => {
  if (cfg.poster_type === "dual") {
    const dualCfg = cfg as DualConfig;
    return {
      ...dualCfg,
      timeRange: (dualCfg.timeRange as TimeRange) ?? "all",
    };
  }

  return cfg;
};

export default function Page() {
  const [posterType, setPosterType] = useState<PosterType>("pie");
  const [config, setConfig] = useState<PosterConfig | null>(null);

  // ✅ use BindingState for the global binding state (pie/bar/dual)
  const [binding, setBinding] = useState<BindingState | null>(null);

  const [catalogSnapshot, setCatalogSnapshot] = useState<
    CatalogSchemaSnapshot[] | null
  >(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load defaults whenever posterType changes
  useEffect(() => {
    const loadDefaults = async (type: PosterType) => {
      try {
        setError(null);
        setLoadingDefaults(true);
        setImageBase64(null);

        const res = await fetch(
          `${API_BASE}/poster/default?poster_type=${type}`,
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const cfg = (await res.json()) as PosterConfig;
        setConfig(ensureDualTimeRange(cfg));
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? "Failed to load defaults");
      } finally {
        setLoadingDefaults(false);
      }
    };

    void loadDefaults(posterType);
  }, [posterType]);

  // Load full catalog snapshot for AI helper
  useEffect(() => {
    const loadCatalogSnapshot = async () => {
      try {
        setCatalogError(null);
        setCatalogLoading(true);

        const dbRes = await fetch("/api/catalog");
        if (!dbRes.ok) throw new Error("Failed to load catalog dbs");
        const dbJson = (await dbRes.json()) as CatalogDbResponse;
        const dbs = dbJson.dbs || [];

        const snapshot: CatalogSchemaSnapshot[] = [];

        for (const db of dbs) {
          const tblRes = await fetch(
            `/api/catalog?db=${encodeURIComponent(db)}`,
          );
          if (!tblRes.ok) continue;
          const tblJson = (await tblRes.json()) as CatalogTablesResponse;
          const tables = tblJson.tables || [];

          const tableInfos: CatalogTableInfo[] = [];
          for (const table of tables) {
            const colRes = await fetch(
              `/api/catalog?db=${encodeURIComponent(
                db,
              )}&table=${encodeURIComponent(table)}`,
            );
            if (!colRes.ok) continue;
            const colJson = (await colRes.json()) as CatalogColumnsResponse;
            const columns = colJson.columns || [];
            tableInfos.push({ table, columns });
          }

          snapshot.push({ db, tables: tableInfos });
        }

        setCatalogSnapshot(snapshot);
      } catch (e) {
        console.error(e);
        setCatalogError(
          e instanceof Error ? e.message : "Failed to load catalog snapshot",
        );
      } finally {
        setCatalogLoading(false);
      }
    };

    void loadCatalogSnapshot();
  }, []);

  const handlePosterTypeChange = (type: PosterType) => {
    setPosterType(type);
    // config is reloaded by the effect above
  };

  const handleRender = async () => {
    if (!config) return;
    try {
      setError(null);
      setRendering(true);

      const res = await fetch(`${API_BASE}/poster/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as RenderResponse;

      if (!data.ok) {
        throw new Error("Render failed");
      }

      setImageBase64(data.image_base64);
      // Optionally: setConfig(data.config_used);
    } catch (e: any) {
      console.error(e);
      setError(e.message ?? "Failed to render poster");
    } finally {
      setRendering(false);
    }
  };

  const handleResetDefaults = () => {
    // Explicitly refetch defaults for current posterType
    (async () => {
      try {
        setError(null);
        setLoadingDefaults(true);
        setImageBase64(null);
        const res = await fetch(
          `${API_BASE}/poster/default?poster_type=${posterType}`,
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const cfg = (await res.json()) as PosterConfig;
        setConfig(ensureDualTimeRange(cfg));
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? "Failed to reload defaults");
      } finally {
        setLoadingDefaults(false);
      }
    })();
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1>Pine Poster Playground</h1>
            <p>
              Select a chart type, tweak its config, render via FastAPI, and
              download the PNG.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="app-main">
        <section className="controls-panel">
          <PosterTypeSelect
            value={posterType}
            onChange={handlePosterTypeChange}
          />

          <div className="buttons-row">
            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={loadingDefaults}
            >
              {loadingDefaults ? "Loading defaults..." : "Reset to defaults"}
            </button>
            <button
              type="button"
              onClick={handleRender}
              disabled={!config || rendering}
            >
              {rendering ? "Rendering..." : "Render poster"}
            </button>
          </div>

          {error && <div className="error-box">{error}</div>}

          {config && (
            <>
              <PosterBaseFields
                config={config}
                onChange={(updated) => setConfig(updated)}
              />

              {isPie(config) && (
                <PiePosterEditor
                  config={config}
                  binding={
                    binding && binding.kind === "pie"
                      ? (binding as PieDataBinding)
                      : null
                  }
                  onChange={(updated) => setConfig(updated)}
                  onBindingChange={(next) => setBinding(next)}
                />
              )}

              {isBar(config) && (
                <BarPosterEditor
                  config={config}
                  binding={
                    binding && binding.kind === "bar"
                      ? (binding as BarDataBinding)
                      : null
                  }
                  onChange={(updated) => setConfig(updated)}
                  onBindingChange={(next) => setBinding(next)}
                />
              )}

              {isDual(config) && (
                <DualPosterEditor
                  config={config}
                  binding={
                    binding && binding.kind === "dual"
                      ? (binding as DualDataBinding)
                      : null
                  }
                  onChange={(updated) => setConfig(updated)}
                  onBindingChange={(next) => setBinding(next)}
                />
              )}
            </>
          )}
        </section>

        <section className="preview-panel">
          <div className="preview-section">
            <PosterPreview
              imageBase64={imageBase64}
              rendering={rendering}
              posterType={posterType}
            />
          </div>

          <hr className="preview-ai-divider" />

          <div className="preview-ai-section">
            <ConfigChatPanel
              posterType={posterType}
              config={config}
              binding={binding}
              catalog={catalogSnapshot}
              onApplyAiUpdate={({
                posterType: nextType,
                config: nextCfg,
                binding: nextBinding,
              }) => {
                setPosterType(nextType);
                setConfig(ensureDualTimeRange(nextCfg));
                setBinding(nextBinding);
              }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
