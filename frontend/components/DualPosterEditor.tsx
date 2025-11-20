// app/components/DualPosterEditor.tsx
"use client";

import type { DualConfig, DualDataBinding } from "@/lib/types";
import { DualFields } from "@/components/DualFields";
import { DualDataBindingSection } from "@/components/DualDataBindingSection";

interface Props {
  config: DualConfig;
  binding: DualDataBinding | null;
  onChange: (cfg: DualConfig) => void;
  onBindingChange: (b: DualDataBinding) => void;
}

/**
 * Combines:
 *  - DualDataBindingSection (db/table/columns → timeseries)
 *  - DualFields (axes, highlights, etc.)
 *
 * All state for the binding lives in the parent (page.tsx).
 */
export function DualPosterEditor({
  config,
  binding,
  onChange,
  onBindingChange,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <DualDataBindingSection
        config={config}
        binding={binding}
        onConfigChange={onChange}
        onBindingChange={onBindingChange}
      />
      <DualFields config={config} onChange={onChange} />
    </div>
  );
}
