import * as React from "react";
import { T } from "./client";

/**
 * Translates plain text passed to shared components (labels, titles, button text) while leaving
 * elements such as icons untouched. Surrounding spaces are kept, e.g. `<Send /> Submit`.
 * Text without a translation renders unchanged, so data (names, titles) passes through safely.
 */
export function trText(text: string): React.ReactNode {
  const core = text.trim();
  if (!core) return text;
  const lead = text.slice(0, text.indexOf(core));
  const trail = text.slice(text.indexOf(core) + core.length);
  return (
    <>
      {lead}
      <T>{core}</T>
      {trail}
    </>
  );
}

export function trChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") return trText(children);
  if (Array.isArray(children)) return children.map((c, i) => (typeof c === "string" ? <React.Fragment key={`t${i}`}>{trText(c)}</React.Fragment> : c));
  return children;
}
