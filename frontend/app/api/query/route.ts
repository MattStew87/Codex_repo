// app/api/query/route.ts
import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createGunzip } from "zlib";
import split2 from "split2";
import type {
  DualAxisBinding,
  TimeseriesQueryResponse,
  BarDataBinding,
  BarQueryResponse,
  QueryBinding,
  PieDataBinding,
  PieQueryResponse,
} from "@/lib/types";

export const runtime = "nodejs";

const AWS_REGION = "us-east-1";
const S3_BUCKET = "pinevisionarycloudstorage";

const s3 = new S3Client({ region: AWS_REGION });

// ---------- helpers ----------

// Use 0 for missing points unless forward-fill is requested
const ZERO_FILL_DEFAULT = 0;

type MissingMode = DualAxisBinding["missing_mode"];

const normalizeMissingMode = (mode: MissingMode): MissingMode =>
  mode === "forward_fill" ? "forward_fill" : "zero";

const buildSeriesWithMissingMode = (
  x_keys: string[],
  getVal: (x: string) => number | undefined,
  mode: MissingMode,
): number[] => {
  let last: number | null = null;

  return x_keys.map((x) => {
    const raw = getVal(x);

    if (raw == null || Number.isNaN(raw)) {
      if (mode === "forward_fill" && last !== null) {
        return last;
      }
      return ZERO_FILL_DEFAULT;
    }

    last = raw;
    return raw;
  });
};

function sortKeys(xs: string[]): string[] {
  const copy = [...xs];
  copy.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return na - nb;
    }

    const da = Date.parse(a);
    const db = Date.parse(b);
    if (!Number.isNaN(da) && !Number.isNaN(db)) {
      return da - db;
    }

    return a.localeCompare(b);
  });
  return copy;
}


function isDualBinding(body: QueryBinding): body is DualAxisBinding {
  return body.kind === "dual";
}

function isBarBinding(body: QueryBinding): body is BarDataBinding {
  return body.kind === "bar";
}

function isPieBinding(body: QueryBinding): body is PieDataBinding {
  return body.kind === "pie";
}

// ---------- dual timeseries handler ----------
async function handleDual(binding: DualAxisBinding) {
  const { db, table, x_column, series, grouped, group_column } = binding;
  const fillMode = normalizeMissingMode(binding.missing_mode);

  if (!db || !table || !x_column || !series || series.length === 0) {
    return NextResponse.json(
      { error: "db, table, x_column, and at least one series are required" },
      { status: 400 },
    );
  }

  if (grouped && !group_column) {
    return NextResponse.json(
      {
        error: "group_column is required when grouped=true for dual timeseries",
      },
      { status: 400 },
    );
  }

  const key = `${db}/${table}.jsonl.gz`;
  const resp = await s3.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }),
  );

  // ========== NON-GROUPED MODE (current behavior) ==========
  if (!grouped) {
    // Map<xKey, { seriesKey: value }>
    const byX = new Map<string, Record<string, number>>();

    await new Promise<void>((resolve, reject) => {
      const gunzip = createGunzip();

      (resp.Body as any)
        .pipe(gunzip)
        .pipe(split2())
        .on("data", (line: string) => {
          if (!line) return;

          let obj: any;
          try {
            obj = JSON.parse(line);
          } catch {
            return;
          }

          const rawX = obj?.[x_column];
          if (rawX == null) return;

          const xKey = String(rawX);
          let bucket = byX.get(xKey);
          if (!bucket) {
            bucket = {};
            byX.set(xKey, bucket);
          }

          for (const s of series) {
            const rawVal = obj?.[s.value_column];
            if (rawVal == null) continue;
            const vNum = Number(rawVal);
            if (Number.isNaN(vNum)) continue;

            bucket[s.key] = (bucket[s.key] ?? 0) + vNum;
          }
        })
        .on("end", () => resolve())
        .on("error", reject);
    });

    const x_keys = sortKeys(Array.from(byX.keys()));
    const y_series: Record<string, number[]> = {};

    for (const s of series) {
      y_series[s.key] = buildSeriesWithMissingMode(
        x_keys,
        (x) => byX.get(x)?.[s.key],
        fillMode,
      );
    }

    const payload: TimeseriesQueryResponse = {
      x_values: x_keys,
      y_series,
    };
    return NextResponse.json(payload);
  }

  // ========== GROUPED MODE ==========
  // Map<xKey, Map<groupKey, { seriesKey: value }>>
  const byXGroup = new Map<string, Map<string, Record<string, number>>>();
  const groupSet = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    const gunzip = createGunzip();

    (resp.Body as any)
      .pipe(gunzip)
      .pipe(split2())
      .on("data", (line: string) => {
        if (!line) return;

        let obj: any;
        try {
          obj = JSON.parse(line);
        } catch {
          return;
        }

        const rawX = obj?.[x_column];
        const rawGroup = group_column ? obj?.[group_column] : undefined;
        if (rawX == null || rawGroup == null) return;

        const xKey = String(rawX);
        const groupKey = String(rawGroup);
        groupSet.add(groupKey);

        let groupMap = byXGroup.get(xKey);
        if (!groupMap) {
          groupMap = new Map<string, Record<string, number>>();
          byXGroup.set(xKey, groupMap);
        }

        let bucket = groupMap.get(groupKey);
        if (!bucket) {
          bucket = {};
          groupMap.set(groupKey, bucket);
        }

        for (const s of series) {
          const rawVal = obj?.[s.value_column];
          if (rawVal == null) continue;
          const vNum = Number(rawVal);
          if (Number.isNaN(vNum)) continue;

          bucket[s.key] = (bucket[s.key] ?? 0) + vNum;
        }
      })
      .on("end", () => resolve())
      .on("error", reject);
  });

  const x_keys = sortKeys(Array.from(byXGroup.keys()));
  const groups = Array.from(groupSet).sort((a, b) => a.localeCompare(b));

  const y_series: Record<string, number[]> = {};

  if (series.length === 1) {
    // Simple case: 1 metric → each group is its own series
    const s0 = series[0];
    for (const g of groups) {
      const seriesName = g;
      y_series[seriesName] = buildSeriesWithMissingMode(
        x_keys,
        (x) => byXGroup.get(x)?.get(g)?.[s0.key],
        fillMode,
      );
    }
  } else {
    // General case: multiple metrics → flatten (group, series) to unique names
    for (const g of groups) {
      for (const s of series) {
        const seriesName = `${g} – ${s.key}`;
        y_series[seriesName] = buildSeriesWithMissingMode(
          x_keys,
          (x) => byXGroup.get(x)?.get(g)?.[s.key],
          fillMode,
        );
      }
    }
  }

  const payload: TimeseriesQueryResponse = {
    x_values: x_keys,
    y_series,
  };
  return NextResponse.json(payload);
}


// ---------- bar handler ----------
async function handleBar(binding: BarDataBinding) {
  const { db, table, label_column, value_column } = binding;

  if (!db || !table || !label_column || !value_column) {
    return NextResponse.json(
      {
        error:
          "db, table, label_column, and value_column are required for bar queries",
      },
      { status: 400 },
    );
  }

  const key = `${db}/${table}.jsonl.gz`;
  const resp = await s3.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }),
  );

  // Map<label, sum(value)>
  const buckets = new Map<string, number>();

  await new Promise<void>((resolve, reject) => {
    const gunzip = createGunzip();

    (resp.Body as any)
      .pipe(gunzip)
      .pipe(split2())
      .on("data", (line: string) => {
        if (!line) return;

        let obj: any;
        try {
          obj = JSON.parse(line);
        } catch {
          return;
        }

        const rawLabel = obj?.[label_column];
        if (rawLabel == null) return;

        const rawVal = obj?.[value_column];
        if (rawVal == null) return;

        const vNum = Number(rawVal);
        if (Number.isNaN(vNum)) return;

        const labelKey = String(rawLabel);
        buckets.set(labelKey, (buckets.get(labelKey) ?? 0) + vNum);
      })
      .on("end", () => resolve())
      .on("error", reject);
  });

  const labels = sortKeys(Array.from(buckets.keys()));
  const values = labels.map((lbl) => buckets.get(lbl) ?? 0);

  const payload: BarQueryResponse = { labels, values };
  return NextResponse.json(payload);
}

// ---------- Pie handler ----------
async function handlePie(binding: PieDataBinding) {
  const { db, table, label_column, value_column } = binding;

  if (!db || !table || !label_column || !value_column) {
    return NextResponse.json(
      {
        error:
          "db, table, label_column, and value_column are required for pie queries",
      },
      { status: 400 },
    );
  }

  const key = `${db}/${table}.jsonl.gz`;
  const resp = await s3.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }),
  );

  // Map<label, sum(value)>
  const sums = new Map<string, number>();

  await new Promise<void>((resolve, reject) => {
    const gunzip = createGunzip();

    (resp.Body as any)
      .pipe(gunzip)
      .pipe(split2())
      .on("data", (line: string) => {
        if (!line) return;

        let obj: any;
        try {
          obj = JSON.parse(line);
        } catch {
          return;
        }

        const rawLabel = obj?.[label_column];
        const rawVal = obj?.[value_column];
        if (rawLabel == null || rawVal == null) return;

        const label = String(rawLabel);
        const vNum = Number(rawVal);
        if (Number.isNaN(vNum)) return;

        const prev = sums.get(label) ?? 0;
        sums.set(label, prev + vNum);
      })
      .on("end", () => resolve())
      .on("error", reject);
  });

  const labels = Array.from(sums.keys()).sort((a, b) => a.localeCompare(b));
  const values = labels.map((label) => sums.get(label) ?? 0);

  const payload: PieQueryResponse = { labels, values };
  return NextResponse.json(payload);
}




// ---------- dispatcher ----------
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as QueryBinding;

    if (isDualBinding(body)) {
      return await handleDual(body);
    }

    if (isBarBinding(body)) {
      return await handleBar(body);
    }

    if (isPieBinding(body)) {
      return await handlePie(body);
    }

    return NextResponse.json(
      { error: "Unsupported query kind" },
      { status: 400 },
    );
  } catch (e) {
    console.error("query error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "query failed", message: msg },
      { status: 500 },
    );
  }
}

