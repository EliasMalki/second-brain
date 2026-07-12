import type { MetadataRoute } from "next";

/**
 * PWA manifest (served at /manifest.webmanifest). display:standalone gives the
 * chrome-less home-screen launch; theme/background match the light surface.
 * No service worker — offline capture is handled by the IndexedDB queue (§6),
 * and CLAUDE.md keeps service workers out of scope.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Second Brain",
    short_name: "Brain",
    description: "Capture, sort, recur, and brief — your personal secretary.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
