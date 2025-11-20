// app/api/poster/default/route.ts

import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE =
  process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const posterType = url.searchParams.get("poster_type");

  if (!posterType) {
    return NextResponse.json(
      { error: "poster_type query param is required" },
      { status: 400 }
    );
  }

  const backendUrl = `${BACKEND_BASE}/poster/default?poster_type=${encodeURIComponent(
    posterType
  )}`;

  const res = await fetch(backendUrl, {
    method: "GET",
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
