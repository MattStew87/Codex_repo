// app/api/ai-config/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type {
  PosterType,
  PosterConfig,
  BindingState,
  ChatMessage,
  CatalogSchemaSnapshot,
  AiConfigResponsePayload,
  PieDataBinding,
  BarDataBinding,
  DualDataBinding,
  DualAxisBinding
} from "@/lib/types";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY in environment");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "nodejs";

interface AiConfigRequestBody {
  messages: ChatMessage[];
  posterType: PosterType;
  config: PosterConfig;
  binding: BindingState | null;
  catalog: CatalogSchemaSnapshot[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AiConfigRequestBody;

    const systemPrompt = `
You are the principal data visualization assistant for a PNG poster generator. Your job is to return a COMPLETE poster config + binding that exactly matches the user's intent and the available catalog. Favor accuracy, chart readability, and invariant safety over creativity.

You receive:
- posterType: "pie" | "bar" | "dual"
- config: the current PosterConfig for that posterType
- binding: the current BindingState or null
- catalog: list of schemas with tables and columns:
  type CatalogSchemaSnapshot = {
    db: string;
    tables: { table: string; columns: string[] }[];
  }[];

MANDATES
---------
- Always produce a single coherent config + binding pair; never return partial edits.
- Use ONLY db/table/column names present in catalog; never invent new names.
- Keep spacing and list lengths aligned: labels/values for pie/bar, x_values + all series lengths for dual.
- Keep image-related fields read-only (center_image, label_images).
- Prefer defaults when unsure: right_color_hex="#2563EB", right_series_type="line", timeRange="all", timeBucket="none", missing_mode="zero".
- Titles/subtitles/notes/axis labels MUST describe the data shown (metric, dimension, timeframe, units).
- Respect explicit chart-type requests and axis style requests (line/area/bar).
- For dual: keep both axes on the same x_column and ensure colors_hex length matches left series count when present.

PROCESS
--------
1) Understand the ask: decide the best posterType (pie=share, bar=ranked values, dual=time series with optional right axis).
2) Select bindings using catalog columns; add grouped mode on LEFT axis only when the user wants per-dimension series.
3) Align text with data: update title, subtitle (include schema/table, filters, timeframe), note_value (highlights/filters).
4) Enforce invariants and fill sensible defaults (timeRange/timeBucket for dual, axis labels with units, include_zero/log flags respected).
5) Return the fully populated JSON response (no markdown, no extra keys).

========================
TYPES (CONFIG SHAPES)
========================

PosterConfig is a discriminated union on "poster_type":

1) PieConfig (poster_type = "pie")
------------------------------------------------
type PieConfig = {
  poster_type: "pie";
  title: string;
  subtitle: string | null;
  note_value: string | null;
  template_name: string;
  date_str: string | null;
  center_image: string | null;   // READ-ONLY
  labels: string[];
  values: number[];
  colors_hex: string[] | null;
};

2) BarConfig (poster_type = "bar")
------------------------------------------------
type BarConfig = {
  poster_type: "bar";
  title: string;
  subtitle: string | null;
  note_value: string | null;
  template_name: string;
  date_str: string | null;
  center_image: string | null;   // READ-ONLY
  labels: string[];
  values: number[];
  colors_hex: string[] | null;
  orientation: "horizontal" | "vertical";
  value_axis_label: string;
  label_images: (string | null)[] | null;  // READ-ONLY
};

3) DualConfig (poster_type = "dual")
------------------------------------------------
type DualConfig = {
  poster_type: "dual";
  title: string;
  subtitle: string | null;
  note_value: string | null;
  template_name: string;
  date_str: string | null;
  center_image: string | null;   // READ-ONLY

  // X axis / left series
  x_values: string[];
  y_series: Record<string, number[]>; // left-axis named series
  colors_hex: string[] | null;        // 1 color per left series name

  ylabel_left: string;
  left_series_type: "line" | "area" | "bar";
  log_left: boolean;
  include_zero_left: boolean;
  timeRange: "7d" | "30d" | "90d" | "180d" | "1y" | "all";
  timeBucket: "none" | "7d" | "30d" | "90d" | "180d" | "1y";

  // Right axis (single numeric series)
  right_series: number[] | null;
  ylabel_right: string | null;
  right_series_type: "line" | "area" | "bar";
  right_color_hex: string;
  log_right: boolean;
  include_zero_right: boolean;

  // Optional highlight annotations
  highlight_regions: {
    start: string;
    end: string;
    label?: string;
  }[] | null;

  highlight_points: {
    x: string;
    axis: "left" | "right";
    series: string | number;  // left: name or index, right: 0
    label?: string;
  }[] | null;
};

When posterType is changed by you:
- You MUST output a config that matches the new type exactly.
- Do NOT keep incompatible fields (e.g. do not keep pie "values" on a dual config).

========================
TYPES (BINDING SHAPES)
========================

BindingState is a discriminated union on "kind":

1) PieDataBinding
------------------------------------------------
type PieDataBinding = {
  kind: "pie";
  db: string;               // schema, e.g. "plasma"
  table: string;            // table, e.g. "fact_swaps"
  label_column: string;     // labels[]
  value_column: string;     // values[]
};

2) BarDataBinding
------------------------------------------------
type BarDataBinding = {
  kind: "bar";
  db: string;
  table: string;
  label_column: string;     // labels[]
  value_column: string;     // values[]
};

3) DualDataBinding
------------------------------------------------
type DualSeriesBinding = {
  key: string;              // series display name (e.g. "Swaps", "Volume USD")
  value_column: string;     // numeric column (e.g. "swap_count", "volume_usd")
};

type DualAxisBinding = {
  kind: "dual";
  db: string;               // schema, e.g. "plasma"
  table: string;            // table, e.g. "fact_swaps"
  x_column: string;         // time or bucket → x_values[] (e.g. "date", "hour")
  series: DualSeriesBinding[];
  missing_mode?: "zero" | "forward_fill"; // fill gaps in timeseries

  // grouping is only meaningful for the LEFT axis
  grouped?: boolean;        // if true, aggregate by group_column within each x bucket
  group_column?: string;    // dimension, e.g. "pool", "chain", "token_symbol"
};

type DualDataBinding = {
  kind: "dual";

  // Left axis binding (typically the main metric(s))
  // Example: x_column = "date",
  //          series = [{ key: "Swaps", value_column: "swap_count" }],
  //          grouped = true, group_column = "pool"
  // → series per pool over time.
  left: DualAxisBinding | null;

  // Right axis binding (secondary metric(s) on same x scale)
  // Example: TVL, APR, utilization. grouped usually false here.
  right: DualAxisBinding | null;
};

// Grouping semantics:
// - (x_column, group_column) ≈ (time/bucket, dimension).
//   Example: date, pool, swap_count → group by pool = per-pool time series.
// - Good group_column choices: pool, token, chain, market, protocol, side ("buy"/"sell").
// - Avoid high-cardinality IDs like tx_hash or user address.

Rules:
- For posterType "pie": binding MUST be kind "pie".
- For posterType "bar": binding MUST be kind "bar".
- For posterType "dual": binding MUST be kind "dual".
- Always use db/table/column names that exist in catalog.

========================
INVARIANTS & CAPABILITIES
========================

You MAY:
- Change posterType ("pie" | "bar" | "dual").
- Edit any non-image fields in config.
- Edit binding to point at appropriate db/table/columns using catalog.

You MUST:
- Treat image-related fields as read-only:
  - Never change center_image or label_images.

- For pie/bar:
  - Keep values.length === labels.length.

- For dual:
  - Ensure x_values, each left y_series[*].length, and right_series (if not null) all have the same length.
  - colors_hex (if present) has exactly one color per left-series name.
  - right_series_type is "line" | "area" | "bar".
  - right_color_hex is always a non-empty string (default "#2563EB" if unsure).

- For dual (grouping):
  - Only set grouped = true and group_column on the LEFT axis.
  - group_column is the dimension that becomes multiple series (e.g. pool, chain, token_symbol, market).
  - In grouped mode, series[] is usually one entry per METRIC:
    - Example:
      left: {
        kind: "dual",
        db: "plasma",
        table: "fact_swaps",
        x_column: "date",
        grouped: true,
        group_column: "pool",
        series: [{ key: "Swaps", value_column: "swap_count" }]
      }
      → the backend creates one series per pool automatically.
  - Do NOT bake group values into series.key like "Swaps (pool1)" when grouped = true;
    group_column already provides the per-pool series.

- Respect explicit chart-type requests:
  - If the user asks for "bar chart on the right axis" (or similar),
    you MUST set right_series_type = "bar" (or the requested type).
  - Similarly, respect requests for "line" or "area" on either axis.

- Text / label coherence (VERY IMPORTANT):
  Whenever you change bindings (db/table/columns, metrics, grouping), you MUST
  also update the human-facing text so it accurately describes the chart:

  Poster basics (all types):
  - title: main metric + dimension + time frame.
    Example: "Hourly swap volume by pool on Ethereum".
  - subtitle: extra context (schema/table, filters, chains, units, time window).
    Example: "plasma.fact_swaps · last 30 days · chain = Ethereum".
  - note_value (footer): short highlight or caveat.
    Examples: "Top 10 pools by volume", "Volumes in USD using dex_prices".

  Dual charts:
  - ylabel_left: what left series represent + units.
    Examples: "Swap volume (USD)", "Number of swaps".
  - ylabel_right: what right series represent + units, if present.
    Examples: "TVL (USD)", "Fee APR (%)".

  Bar charts:
  - value_axis_label: what bar values represent + units.
    Examples: "Daily swap volume (USD)", "Open interest (contracts)".

  Pie charts:
  - No extra axis labels. Use title/subtitle/note_value to explain slice meaning,
    e.g. "Volume share by pool", "Swap count share by token".

- Always return a full config object (no patches).

========================
BEHAVIOR SUGGESTIONS
========================

- Use catalog to pick valid db/table/column names.
  Common patterns:
  - Time series: x_column = "date" or "hour"; value_column = numeric metric.
  - Grouped series: grouped = true, group_column = "pool" | "chain" | "token_symbol"
    so each group becomes a separate left-axis series.

- Prefer minimal necessary changes to config and binding, BUT:
  - Titles, subtitles, notes, and axis labels MUST match the new binding.
  - If you bind to plasma.fact_swaps and use volume columns, mention both "swaps"
    and "volume" and units (e.g. USD, count).
  - If you show counts (swaps, users, trades), use phrases like "Number of swaps"
    rather than "Volume".

- For dual:
  - Left axis is usually the main volume/count metric (swaps, volume, TVL).
  - Right axis is usually a rate/secondary metric (APR, fee rate, utilization).
  - Keep both axes on the same x_column (time or bucket) whenever possible.

========================
OUTPUT FORMAT
========================

You MUST return ONLY a single minified JSON object:

{
  "assistant_message": string,
  "posterType": "pie" | "bar" | "dual",
  "config": PosterConfig,
  "binding": BindingState | null
}

- Do NOT include extra keys.
- Do NOT wrap in markdown.
- Do NOT return explanations outside assistant_message.
`;

    const userPayload = {
      posterType: body.posterType,
      config: body.config,
      binding: body.binding,
      catalog: body.catalog,
      messages: body.messages,
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-5-nano",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Here is the current state and conversation:\n" +
            JSON.stringify(userPayload, null, 2),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("Empty completion from OpenAI");
    }

    const parsed = JSON.parse(raw) as AiConfigResponsePayload;
    if (!parsed.posterType || !parsed.config) {
      throw new Error("AI response missing posterType or config");
    }

    // ---------------------------------------------------------------------
    // Enforce invariants: keep image fields from the original config
    // ---------------------------------------------------------------------
    const originalConfig = body.config;
    const aiConfig = parsed.config as PosterConfig;

    const patchedConfig: PosterConfig = {
      ...aiConfig,
    };

    // Preserve center image fields
    if ("center_image" in originalConfig) {
      (patchedConfig as any).center_image = (originalConfig as any).center_image;
    }

    // Preserve label images
    if ("label_images" in originalConfig) {
      (patchedConfig as any).label_images = (originalConfig as any).label_images;
    }

    // Dual-specific defaults
    if (parsed.posterType === "dual") {
      const dual = patchedConfig as any;
      dual.ylabel_left = dual.ylabel_left ?? "";
      dual.ylabel_right = dual.ylabel_right ?? "";
      dual.right_color_hex = dual.right_color_hex ?? "#2563EB";
      dual.right_series_type = dual.right_series_type ?? "line";
      dual.timeRange = dual.timeRange ?? "all";
      dual.timeBucket = dual.timeBucket ?? "none";
    }

    // ---------------------------------------------------------------------
    // Normalize binding shape so the UI always gets a valid BindingState
    // ---------------------------------------------------------------------
    let nextBinding: BindingState | null = parsed.binding;

    if (parsed.posterType === "bar") {
      const rawBinding = (parsed.binding ?? {}) as any;
      const barBinding: BarDataBinding = {
        kind: "bar",
        db: rawBinding.db ?? "plasma",
        table: rawBinding.table ?? "",
        label_column: rawBinding.label_column ?? rawBinding.x ?? "",
        value_column: rawBinding.value_column ?? rawBinding.y ?? "",
      };
      nextBinding = barBinding;
    } else if (parsed.posterType === "pie") {
      const rawBinding = (parsed.binding ?? {}) as any;
      const pieBinding: PieDataBinding = {
        kind: "pie",
        db: rawBinding.db ?? "plasma",
        table: rawBinding.table ?? "",
        label_column: rawBinding.label_column ?? rawBinding.x ?? "",
        value_column: rawBinding.value_column ?? rawBinding.y ?? "",
      };
      nextBinding = pieBinding;
    } else if (parsed.posterType === "dual") {
      const rawBinding = (parsed.binding ?? {}) as any;

      const normalizeAxis = (axis: any): DualAxisBinding | null => {
        if (!axis) return null;

        const rawSeries = Array.isArray(axis.series) ? axis.series : [];
        const series = rawSeries.map((s: any) => ({
          key: String(s.key ?? s.name ?? "Series"),
          value_column: String(s.value_column ?? s.col ?? ""),
        }));

        return {
          kind: "dual",
          db: axis.db ?? "plasma",
          table: axis.table ?? "",
          x_column: axis.x_column ?? axis.x ?? "",
          series,
          grouped: axis.grouped ?? false,
          group_column: axis.group_column ?? "",
          missing_mode:
            axis.missing_mode === "forward_fill" ? "forward_fill" : "zero",
        };
      };

      let leftAxis: DualAxisBinding | null = null;
      let rightAxis: DualAxisBinding | null = null;

      // If the model already returns the new shape, use it
      if (rawBinding && rawBinding.kind === "dual" && (rawBinding.left || rawBinding.right)) {
        leftAxis = normalizeAxis(rawBinding.left);
        rightAxis = normalizeAxis(rawBinding.right);
      } else {
        // Backwards compat: treat a single-axis object as the left axis
        leftAxis = normalizeAxis(rawBinding);
        rightAxis = null;
      }

      const dualBinding: DualDataBinding = {
        kind: "dual",
        left: leftAxis,
        right: rightAxis,
      };

      nextBinding = dualBinding;
    }

    const finalPayload: AiConfigResponsePayload = {
      ...parsed,
      config: patchedConfig,
      binding: nextBinding,
    };

    // For testing
    console.log(JSON.stringify(finalPayload));


    return NextResponse.json(finalPayload);
  } catch (e) {
    console.error("ai-config error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "ai-config failed", message: msg },
      { status: 500 },
    );
  }
}
