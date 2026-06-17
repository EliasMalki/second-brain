import { projectColorVars } from "@/lib/colors";

/**
 * The little project pill shown on tasks / notes / records. Pale tint background
 * + colored text + a small color dot, all derived from the project's one base
 * color (via --proj). With no color it falls back to neutral gray, so it's a
 * drop-in for the old `<span className="tag">`. Purely presentational — safe in
 * both server and client components.
 */
export function ProjectTag({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  return (
    <span className="ptag" style={projectColorVars(color)}>
      <span className="ptag-dot" aria-hidden="true" />
      {name}
    </span>
  );
}
