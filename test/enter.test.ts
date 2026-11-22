import { describe, expect, test } from "bun:test";
import { enterEdits } from "../src/formatter";
import { applyEdits } from "./applyEdits";

const enter = (text: string, line: number) => applyEdits(text, enterEdits(text, line));

describe("Enter", () => {
    test("the finished line gets its indent and casing, the new line the indent of the next statement", () => {
        expect(enter("Sub Main()\nif a then\n", 2)).toBe("Sub Main()\n    If a Then\n        ");
    });

    test("a closer moves back out, and the next line starts at its level", () => {
        expect(enter("Sub Main()\n    If a Then\n        x = 1\n        end if\n", 4)).toBe("Sub Main()\n    If a Then\n        x = 1\n    End If\n    ");
    });

    test("a line that continues a multi-line string is left as typed", () => {
        expect(enterEdits('Sub Main()\nDim s = "abc\n', 2).filter((e) => e.line === 2)).toEqual([]);
        expect(enterEdits('Dim s = "abc\n  def\n', 2).filter((e) => e.line === 1)).toEqual([]);
    });

    test("nothing changes for the first line, or when the lines are already right", () => {
        expect(enterEdits("x = 1\n", 0)).toEqual([]);
        expect(enterEdits("Sub Main()\n    x = 1\n    ", 2)).toEqual([]);
    });

    test("the options decide the indent", () => {
        expect(applyEdits("Sub Main()\nx = 1\n", enterEdits("Sub Main()\nx = 1\n", 2, { useTabs: true }))).toBe("Sub Main()\n\tx = 1\n\t");
    });
});
