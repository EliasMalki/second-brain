import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

// One typeface, app-wide (design handoff): Geist, self-hosted via Vercel's
// `geist` package (no build-time Google fetch). It publishes --font-geist-sans,
// which --font-sans points at in globals.css. Variable font — no explicit
// weights; the lighter-weight scale lives in globals.css, not here.

export const metadata: Metadata = {
  title: "Second Brain",
  description: "A personal secretary: capture, sort, recur, and brief.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Second Brain",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1b1f" },
  ],
};

// Resolve the saved Appearance + Text-weight preferences and stamp them on <html>
// before the first paint, so neither a Dark choice nor a custom weight flashes on
// load. Mirrors the logic in account-menu.tsx; keep them in sync. Default theme
// "system" follows the OS; default weight offset 0 is the CSS default.
const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');var w=localStorage.getItem('fontWeight');if(w!==null&&w!==''&&!isNaN(+w)){document.documentElement.style.setProperty('--fw-offset',w);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
