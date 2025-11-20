// app/api/poster/render/route.ts

import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE =
  process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  const body = await req.text();

  const backendUrl = `${BACKEND_BASE}/poster/render`;
  const res = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: text || `Backend error ${res.status}` },
      { status: res.status }
    );
  }

  return new NextResponse(text, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
