"use client";

import Image from "next/image";
import type { PosterType } from "@/lib/types";

interface Props {
  imageBase64: string | null;
  rendering: boolean;
  posterType: PosterType;
}

export function PosterPreview({ imageBase64, rendering, posterType }: Props) {
  const hasImage = !!imageBase64;

  const dataUrl = hasImage
    ? `data:image/png;base64,${imageBase64}`
    : undefined;

  return (
    <>
      {/* Header row: title on left, download on right */}
      <div className="preview-header-row">
        <h2 className="preview-title">Preview</h2>

        {hasImage && dataUrl && (
          <a
            href={dataUrl}
            download={`pine_poster_${posterType}.png`}
            className="preview-download-link"
          >
            <button type="button">Download PNG</button>
          </a>
        )}
      </div>

      {/* Main box for image / placeholder */}
      <div className="preview-box">
        {!hasImage && (
          <div className="preview-placeholder">
            {rendering
              ? "Rendering poster..."
              : "Render to see the PNG preview here."}
          </div>
        )}

        {hasImage && dataUrl && (
          <Image
            src={dataUrl}
            alt="Poster preview"
            className="preview-image"
            width={1200}
            height={675}
            sizes="(max-width: 768px) 100vw, 1200px"
            unoptimized
          />
        )}
      </div>
    </>
  );
}
