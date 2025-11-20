// app/api/poster/upload/label-images/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_BASE =
  process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  const incoming = await req.formData();

  const backendForm = new FormData();
  const files = incoming.getAll("files");

  for (const f of files) {
    if (f instanceof File) {
      backendForm.append("files", f, f.name);
    }
  }

  const res = await fetch(`${BACKEND_BASE}/poster/upload/label-images`, {
    method: "POST",
    body: backendForm,
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Backend did not return JSON", raw: text },
      { status: 500 },
    );
  }

  return NextResponse.json(json, { status: res.status });
}
