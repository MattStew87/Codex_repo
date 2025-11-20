// app/api/catalog/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { createGunzip } from "zlib";
import split2 from "split2";

export const runtime = "nodejs";

const AWS_REGION = "us-east-1";
const S3_BUCKET = "pinevisionarycloudstorage";

const s3 = new S3Client({
  region: AWS_REGION,
});

// List "dbs" = prefix folders in bucket
async function listDbs() {
  const dbs: string[] = [];
  let token: string | undefined;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Delimiter: "/",
        ContinuationToken: token,
      }),
    );
    for (const p of out.CommonPrefixes || []) {
      const name = (p.Prefix || "").replace(/\/$/, "");
      if (name) dbs.push(name);
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return dbs.sort();
}

// List tables (jsonl.gz files) under a db folder
async function listTables(db: string) {
  const tables: string[] = [];
  let token: string | undefined;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: `${db}/`,
        ContinuationToken: token,
      }),
    );
    for (const o of out.Contents || []) {
      const Key = o.Key!;
      if (Key.endsWith(".jsonl.gz")) {
        const name = Key.slice(db.length + 1).replace(/\.jsonl\.gz$/, "");
        tables.push(name);
      }
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return Array.from(new Set(tables)).sort();
}

// Infer top-level columns by sampling some rows
async function inferColumns(db: string, table: string, maxRows = 50) {
  const cols = new Set<string>();

  const resp = await s3.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: `${db}/${table}.jsonl.gz`,
    }),
  );

  await new Promise<void>((resolve, reject) => {
    const gunzip = createGunzip();
    let seen = 0;

    (resp.Body as any)
      .pipe(gunzip)
      .pipe(split2())
      .on("data", (line: string) => {
        if (!line) return;
        try {
          const obj = JSON.parse(line);
          Object.keys(obj).forEach((k) => cols.add(k));
          if (++seen >= maxRows) {
            resolve();
          }
        } catch {
          // ignore parse errors
        }
      })
      .on("end", () => resolve())
      .on("error", reject);
  });

  return Array.from(cols).sort();
}

// GET /api/catalog
//   -> { dbs: [...] }
// GET /api/catalog?db=plasma
//   -> { db: "plasma", tables: [...] }
// GET /api/catalog?db=plasma&table=fact_transactions
//   -> { db: "plasma", table: "fact_transactions", columns: [...] }
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const db = searchParams.get("db");
    const table = searchParams.get("table");

    if (db && table) {
      const columns = await inferColumns(db, table);
      return NextResponse.json({ db, table, columns });
    }
    if (db) {
      const tables = await listTables(db);
      return NextResponse.json({ db, tables });
    }
    const dbs = await listDbs();
    return NextResponse.json({ dbs });
  } catch (e) {
    console.error("catalog error:", e);
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const errorDetails = {
      error: "catalog failed",
      message: errorMessage,
      type: e instanceof Error ? e.constructor.name : typeof e,
    };
    return NextResponse.json(errorDetails, { status: 500 });
  }
}
