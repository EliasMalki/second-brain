import { ImageResponse } from "next/og";

// iOS home-screen icon (must be raster). Generated at build via ImageResponse
// so no binary asset is needed — a white monogram on the app's dark accent.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          color: "#ffffff",
          fontSize: 92,
          fontWeight: 600,
          letterSpacing: -2,
        }}
      >
        SB
      </div>
    ),
    { ...size },
  );
}
