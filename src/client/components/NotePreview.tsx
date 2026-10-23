import { Layout, normalizeLayout } from "../../shared/characters";
import { formatText } from "../../shared/formatter";
import type { NoteContent } from "../../shared/types";
import { WIDGETS } from "../../shared/types";
import { Board } from "./Board";

/** Layout for content that can be rendered on the device (text and designs). Widgets render on the server. */
export function localLayout(content: NoteContent, size: { rows: number; cols: number }): Layout | null {
  if (content.type === "design") return normalizeLayout(content.layout, size.rows, size.cols);
  if (content.type === "text") return formatText(content.text, { ...size, align: content.align, valign: content.valign, abbreviate: content.abbreviate ?? 2 }).layout;
  return null;
}

export function contentSummary(content: NoteContent): string {
  if (content.type === "text") return content.text.replace(/\{[a-z0-9]+\}/gi, "■").replace(/\s+/g, " ").trim();
  if (content.type === "design") return "Custom design";
  const w = WIDGETS[content.widget];
  if (content.widget === "countdown" && content.config.label) return `Countdown: ${content.config.label}`;
  if (content.widget === "ai" && content.config.prompt) return `Claude: ${content.config.prompt}`;
  return w.label;
}

export function NotePreview({ content, size, boardColor }: { content: NoteContent; size: { rows: number; cols: number }; boardColor: "black" | "white" }) {
  const layout = localLayout(content, size);
  if (layout) return <Board layout={layout} size="sm" color={boardColor} />;
  if (content.type !== "widget") return null;
  const w = WIDGETS[content.widget];
  return (
    <div className="widget-thumb">
      <span className="widget-icon">{w.icon}</span>
      <span>{contentSummary(content)}</span>
    </div>
  );
}
