// lib/types.ts

// ===================
// Poster base types
// ===================
export type PosterType = "pie" | "bar" | "dual";

export type TimeRange = "7d" | "30d" | "90d" | "180d" | "1y" | "all";

export interface BasePosterConfig {
  poster_type: PosterType;
  title: string;
  subtitle?: string;
  note_value?: string;
  template_name?: string;
  date_str?: string | null;
  center_image?: string | null; // backend file path
}

// Pie
export interface PieConfig extends BasePosterConfig {
  poster_type: "pie";
  labels: string[];
  values: number[];
  colors_hex?: string[] | null;
}

// Bar
export type Orientation = "horizontal" | "vertical";

export interface BarConfig extends BasePosterConfig {
  poster_type: "bar";
  labels: string[];
  values: number[];
  colors_hex?: string[] | null;
  orientation: Orientation;
  value_axis_label: string;
  // important: allow “holes” and 0..labels.length
  label_images?: (string | null)[] | null;
}

// Dual highlight structures used by backend
export type HighlightRegion = {
  start: string | number;
  end: string | number;
  label?: string;
};

export type HighlightPoint = {
  x: string | number;
  series?: string | number; // left: label or index; right: index 0
  label?: string;
  axis?: "left" | "right";
};

// Dual config used by Python renderer
export interface DualConfig extends BasePosterConfig {
  poster_type: "dual";
  x_values: string[];
  y_series: Record<string, number[]>;
  colors_hex?: string[] | null;

  ylabel_left: string;
  log_left: boolean;
  include_zero_left: boolean;
  left_series_type: "line" | "area" | "bar";

  right_series?: number[] | null;
  right_color_hex: string;
  ylabel_right?: string | null;
  right_series_type: "line" | "area" | "bar";
  log_right: boolean;
  include_zero_right: boolean;

  highlight_regions?: HighlightRegion[] | null;
  highlight_points?: HighlightPoint[] | null;

  // trailing time window for the datetime axis
  timeRange: TimeRange;
}

export type PosterConfig = PieConfig | BarConfig | DualConfig;

export interface RenderResponse {
  ok: boolean;
  image_base64: string;
  config_used: PosterConfig;
}

// ===================
// Highlight UI types
// ===================
export interface UiRegion {
  id: string;
  startIndex: number | null; // index into x_values
  endIndex: number | null;   // index into x_values
  label: string;
}

export interface UiPoint {
  id: string;
  xIndex: number | null;     // index into x_values
  axis: "left" | "right";
  seriesKey: string;         // left: y_series key; right: "right"
  label: string;
}

// ===================
// Data binding types
// ===================
export interface DualSeriesBinding {
  key: string;
  value_column: string;
}

export interface DualAxisBinding {
  kind: "dual";
  db: string;
  table: string;
  x_column: string;
  series: DualSeriesBinding[];
  grouped?: boolean;      // only used for left, ignored for right
  group_column?: string;  // only used for left
}

export interface DualDataBinding {
  kind: "dual"; 
  left: DualAxisBinding | null;
  right: DualAxisBinding | null;
}

export interface TimeseriesQueryResponse {
  x_values: string[];
  y_series: Record<string, number[]>; // all arrays same length
}

export interface BarDataBinding {
  kind: "bar";
  db: string;
  table: string;
  label_column: string;
  value_column: string;
}

export interface BarQueryResponse {
  labels: string[];
  values: number[];
}

export interface PieDataBinding {
  kind: "pie";
  db: string;
  table: string;
  label_column: string;
  value_column: string;
}

export interface PieQueryResponse {
  labels: string[];
  values: number[];
}

export type QueryBinding = DualAxisBinding | BarDataBinding | PieDataBinding;
export type BindingState = PieDataBinding | BarDataBinding | DualDataBinding;

// ===================
// Types for ChatGPT
// ===================

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// Snapshot of all schemas/tables/columns for the AI
export interface CatalogTableInfo {
  table: string;
  columns: string[];
}

export interface CatalogSchemaSnapshot {
  db: string; // schema name, e.g., "plasma"
  tables: CatalogTableInfo[];
}

export interface AiConfigResponsePayload {
  assistant_message: string;
  posterType: PosterType;
  config: PosterConfig;
  binding: BindingState | null;
}
