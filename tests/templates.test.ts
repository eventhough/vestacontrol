import { describe, expect, it } from "vitest";
import { BOARD_SIZES, type BoardType } from "../src/shared/characters";
import { formatText } from "../src/shared/formatter";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "../src/shared/templates";
import { validateContent } from "../src/worker/validate";

const boards: BoardType[] = ["note", "flagship"];

describe("templates", () => {
  it("have unique ids and known categories", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    const categories = TEMPLATE_CATEGORIES.map((c) => c.id);
    for (const t of TEMPLATES) expect(categories, t.id).toContain(t.category);
  });

  it("striped templates (all holidays) fit and load as designs on both boards", () => {
    for (const board of boards)
      for (const t of TEMPLATES.filter((t) => t.category === "holidays")) expect(t.build(board).type, `${t.id} on ${board}`).toBe("design");
  });

  for (const board of boards) {
    it(`all fit the ${board} without shortening and pass validation`, () => {
      const size = BOARD_SIZES[board];
      for (const t of TEMPLATES) {
        const content = t.build(board);
        expect(() => validateContent(content), t.id).not.toThrow();
        if (content.type === "text") {
          expect(formatText(content.text, { board, ...size, abbreviate: 0 }).fits, `${t.id} on ${board}`).toBe(true);
        } else if (content.type === "design") {
          expect(content.layout.length, t.id).toBe(size.rows);
          expect(content.layout.every((row) => row.length === size.cols), t.id).toBe(true);
        }
      }
    });
  }
});
