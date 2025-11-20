// app/components/BarPosterEditor.tsx
"use client";

import type { BarConfig, BarDataBinding } from "@/lib/types";
import { BarFields } from "@/components/BarFields";
import { BarDataBindingSection } from "@/components/BarDataBindingSection";

interface Props {
  config: BarConfig;
  binding: BarDataBinding | null;
  onChange: (cfg: BarConfig) => void;
  onBindingChange: (b: BarDataBinding) => void; 
}

/**
 * Thin wrapper that combines:
 *  - Data binding (schema/table/columns -> bar labels/values from S3)
 *  - Bar form fields (orientation, axis label, label images, manual overrides)
 *
 * It does NOT talk to the Python backend. Your "Render poster" button
 * still sends the current config elsewhere, same as before.
 */
export function BarPosterEditor({ 
  config,
  binding,
  onChange,
  onBindingChange,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <BarDataBindingSection 
        config={config}
        binding={binding}
        onConfigChange={onChange}
        onBindingChange={onBindingChange}
      />
      <BarFields config={config} onChange={onChange} />
    </div>
  );
}
