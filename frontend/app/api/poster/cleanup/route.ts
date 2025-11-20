// app/api/poster/cleanup/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  const body = await req.text();

  const res = await fetch(`${BACKEND_BASE}/poster/cleanup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { detail: text || "Invalid JSON from backend" };
  }

  return NextResponse.json(json, { status: res.status });
}

