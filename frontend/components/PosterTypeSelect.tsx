// app/components/PosterTypeSelect.tsx
"use client";

import type { PosterType } from "@/lib/types";

interface Props {
  value: PosterType;
  onChange: (value: PosterType) => void;
}

export function PosterTypeSelect({ value, onChange }: Props) {
  return (
    <div className="poster-type-row">
      <div className="poster-type-header">
        <span className="poster-type-label">Chart type</span>
        <span className="poster-type-tag">Start here</span>
      </div>

      <select
        className="poster-type-select"
        value={value}
        onChange={(e) => onChange(e.target.value as PosterType)}
      >
        <option value="pie">Pie</option>
        <option value="bar">Bar</option>
        <option value="dual">Dual (time series)</option>
      </select>
    </div>
  );
}
