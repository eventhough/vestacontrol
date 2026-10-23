import { CODE_TO_CHAR, COLOR_HEX, Layout, isColor } from "../../shared/characters";

interface Props {
  layout: Layout;
  color?: "black" | "white";
  size?: "lg" | "sm";
  /** Makes tiles tappable (design editor). */
  onTileDown?: (r: number, c: number) => void;
  onTileEnter?: (r: number, c: number) => void;
  cursor?: { r: number; c: number } | null;
}

export function tileStyle(code: number, board: "black" | "white"): { background?: string; color?: string } {
  if (code === 71) return { background: board === "black" ? COLOR_HEX[69] : COLOR_HEX[70] };
  if (isColor(code)) return { background: COLOR_HEX[code] };
  return {};
}

export function Board({ layout, color = "black", size = "lg", onTileDown, onTileEnter, cursor }: Props) {
  const cols = layout[0]?.length ?? 0;
  return (
    <div
      className={`board board-${color} board-${size}${onTileDown ? " board-edit" : ""}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {layout.flatMap((row, r) =>
        row.map((code, c) => (
          <div
            key={`${r}-${c}`}
            className={`tile${cursor && cursor.r === r && cursor.c === c ? " tile-cursor" : ""}`}
            style={tileStyle(code, color)}
            data-r={r}
            data-c={c}
            onPointerDown={
              onTileDown
                ? (e) => {
                    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                    onTileDown(r, c);
                  }
                : undefined
            }
            onPointerEnter={onTileEnter ? (e) => e.buttons === 1 && onTileEnter(r, c) : undefined}
          >
            {!isColor(code) && code !== 0 ? <span>{CODE_TO_CHAR[code] ?? ""}</span> : null}
          </div>
        )),
      )}
    </div>
  );
}
