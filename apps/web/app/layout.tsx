import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

// One typeface, app-wide (design handoff): Geist, self-hosted via Vercel's
// `geist` package (no build-time Google fetch). It publishes --font-geist-sans,
// which --font-sans points at in globals.css. Variable font — no explicit
// weights; the lighter-weight scale lives in globals.css, not here.

export const metadata: Metadata = {
  title: "Servo",
  description: "A personal secretary: capture, sort, recur, and brief.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Servo",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // NOTE: theme-color is deliberately NOT set here. It is owned solely by the
  // inline THEME_SCRIPT below, which sets a single RESOLVED color (so a manually
  // chosen theme that differs from the OS shows the right browser chrome). If
  // React also rendered media-based theme-color metas here, the script would be
  // detaching React-managed <head> nodes — and any later React head reconcile
  // (navigation/prefetch) would crash with "Cannot read properties of null
  // (reading 'removeChild')". One owner = no conflict.
};

// Resolve the saved Appearance + Text-weight + Density preferences and stamp
// them on <html> before the first paint, so none of them flash their defaults
// on load. Mirrors the logic in account-menu.tsx; keep them in sync. Defaults:
// theme "system" (follows the OS), weight offset 0, density comfortable.
// Also set the browser-chrome theme-color to the RESOLVED theme (not just the
// OS): a manually chosen theme differing from the OS would otherwise leave the
// status/address bar the wrong color. This script is the SOLE owner of the
// theme-color meta (viewport above intentionally renders none), so it only ever
// upserts a single non-media meta — it never removes a React-managed node, which
// is what previously crashed head reconciliation with a null removeChild.
const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');var w=localStorage.getItem('fontWeight');if(w!==null&&w!==''&&!isNaN(+w)){document.documentElement.style.setProperty('--fw-offset',w);}if(localStorage.getItem('density')==='compact'){document.documentElement.setAttribute('data-density','compact');}var c=d?'#1b1b1f':'#ffffff';function sc(){var k=document.querySelector('meta[name="theme-color"]:not([media])');if(!k){k=document.createElement('meta');k.setAttribute('name','theme-color');document.head.appendChild(k);}k.setAttribute('content',c);}sc();document.addEventListener('DOMContentLoaded',sc);}catch(e){}})();`;

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
