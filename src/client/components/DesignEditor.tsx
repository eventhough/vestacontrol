import { useRef, useState } from "react";
import { BLANK, COLOR_HEX, Layout, PALETTE, boardTypeOf, charToCode, glyph } from "../../shared/characters";
import { Board } from "./Board";
import { Segmented } from "./ui";

type Mode = "paint" | "type";
type PaletteTab = "colors" | "letters" | "digits" | "symbols";

const COLOR_NAMES: Record<number, string> = { 63: "Red", 64: "Orange", 65: "Yellow", 66: "Green", 67: "Blue", 68: "Violet", 69: "White", 70: "Black" };

export function DesignEditor({ layout, onChange, boardColor }: { layout: Layout; onChange: (l: Layout) => void; boardColor: "black" | "white" }) {
  const [mode, setMode] = useState<Mode>("paint");
  const [brush, setBrush] = useState<number>(63);
  const [tab, setTab] = useState<PaletteTab>("colors");
  const [cursor, setCursor] = useState<{ r: number; c: number } | null>(null);
  const [undo, setUndo] = useState<Layout[]>([]);
  const typeInput = useRef<HTMLInputElement>(null);
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  const board = boardTypeOf(layout);

  const commit = (next: Layout, snapshot = true) => {
    if (snapshot) setUndo((u) => [...u.slice(-30), layout]);
    onChange(next);
  };

  const paint = (r: number, c: number, snapshot: boolean) => {
    if (layout[r][c] === brush) return;
    const next = layout.map((row) => [...row]);
    next[r][c] = brush;
    commit(next, snapshot);
  };

  const onTileDown = (r: number, c: number) => {
    if (mode === "paint") paint(r, c, true);
    else {
      setCursor({ r, c });
      typeInput.current?.focus();
    }
  };

  const advance = (pos: { r: number; c: number }, delta: number) => {
    let i = pos.r * cols + pos.c + delta;
    i = Math.max(0, Math.min(rows * cols - 1, i));
    return { r: Math.floor(i / cols), c: i % cols };
  };

  const typeChars = (text: string) => {
    if (!cursor) return;
    const next = layout.map((row) => [...row]);
    let pos = cursor;
    for (const ch of Array.from(text)) {
      const code = charToCode(ch, board);
      if (code === undefined) continue;
      next[pos.r][pos.c] = code;
      pos = advance(pos, 1);
    }
    commit(next);
    setCursor(pos);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!cursor) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      const pos = advance(cursor, -1);
      const next = layout.map((row) => [...row]);
      next[pos.r][pos.c] = BLANK;
      commit(next);
      setCursor(pos);
    } else if (e.key === "Enter") {
      e.preventDefault();
      setCursor({ r: Math.min(rows - 1, cursor.r + 1), c: 0 });
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key] ?? 0;
      setCursor(advance(cursor, d));
    }
  };

  return (
    <div className="stack">
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          if (m === "type") {
            setCursor(cursor ?? { r: 0, c: 0 });
            setTimeout(() => typeInput.current?.focus(), 0);
          } else setCursor(null);
        }}
        options={[
          { value: "paint", label: "🖌️ Paint" },
          { value: "type", label: "⌨️ Type" },
        ]}
      />

      <Board layout={layout} color={boardColor} onTileDown={onTileDown} onTileEnter={mode === "paint" ? (r, c) => paint(r, c, false) : undefined} cursor={cursor} />

      {mode === "type" ? (
        <div className="stack-sm">
          <input
            ref={typeInput}
            className="input type-capture"
            placeholder="Tap a tile, then type here…"
            value=""
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => typeChars(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <p className="muted small">Tip: type 🟥🟦 emoji to place colors{board === "note" ? ", or ❤️ for a heart" : ""}. Enter jumps to the next row.</p>
        </div>
      ) : (
        <div className="palette">
          <div className="palette-tabs">
            {(
              [
                ["colors", "Colors"],
                ["letters", "ABC"],
                ["digits", "123"],
                ["symbols", "#?!"],
              ] as [PaletteTab, string][]
            ).map(([t, label]) => (
              <button key={t} type="button" className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
            <button type="button" className={`eraser${brush === BLANK ? " active" : ""}`} onClick={() => setBrush(BLANK)} title="Eraser">
              ⌫ Erase
            </button>
          </div>
          <div className="palette-grid">
            {PALETTE[tab].map((code) => (
              <button
                key={code}
                type="button"
                className={`swatch${brush === code ? " active" : ""}`}
                style={COLOR_HEX[code] ? { background: COLOR_HEX[code] } : undefined}
                title={COLOR_NAMES[code] ?? glyph(code, board)}
                aria-label={COLOR_NAMES[code] ?? glyph(code, board)}
                onClick={() => setBrush(code)}
              >
                {COLOR_HEX[code] ? "" : glyph(code, board)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="row wrap">
        <button type="button" className="btn btn-sm" disabled={undo.length === 0} onClick={() => {
          const prev = undo[undo.length - 1];
          setUndo((u) => u.slice(0, -1));
          onChange(prev);
        }}>
          ↶ Undo
        </button>
        <button type="button" className="btn btn-sm" onClick={() => commit(layout.map((row) => row.map(() => brush)))}>
          Fill with brush
        </button>
        <button type="button" className="btn btn-sm" onClick={() => commit(layout.map((row) => row.map(() => BLANK)))}>
          Clear
        </button>
      </div>
    </div>
  );
}
