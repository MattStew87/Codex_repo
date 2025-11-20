// app/api/poster/upload/center-image/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_BASE = "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const res = await fetch(`${API_BASE}/poster/upload/center-image`, {
    method: "POST",
    body: formData,
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
