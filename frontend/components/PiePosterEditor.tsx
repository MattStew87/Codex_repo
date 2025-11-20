// app/components/PiePosterEditor.tsx
"use client";

import type { PieConfig, PieDataBinding } from "@/lib/types";
import { PieFields } from "@/components/PieFields";
import { PieDataBindingSection } from "@/components/PieDataBindingSection";

interface Props {
  config: PieConfig;
  binding: PieDataBinding | null;
  onChange: (cfg: PieConfig) => void;
  onBindingChange: (b: PieDataBinding) => void;
}

/**
 * Combines:
 *  - Pie data binding (schema/table/columns → /api/query)
 *  - Pie fields (labels/values/colors text editor)
 */
export function PiePosterEditor({
  config,
  binding,
  onChange,
  onBindingChange,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <PieDataBindingSection
        config={config}
        binding={binding}
        onConfigChange={onChange}
        onBindingChange={onBindingChange}
      />
      <PieFields config={config} onChange={onChange} />
    </div>
  );
}
