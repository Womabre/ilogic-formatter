import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { format, FormatOptions, formatRange } from "../src/formatter";

const root = join(import.meta.dir, "fixtures");
const fixtures = readdirSync(root)
    .filter((name) => !existsSync(join(root, name, "todo.md")))
    .map((name) => {
        const read = (file: string) => readFileSync(join(root, name, file), "utf8");
        const options: FormatOptions = existsSync(join(root, name, "options.json")) ? JSON.parse(read("options.json")) : {};
        return { name, input: read("input.iLogicVb"), expected: read("expected.iLogicVb"), options };
    });

/** Replaces lines start..end of `text` the way the extension does. */
function applyRange(text: string, start: number, end: number, options: FormatOptions = {}): string {
    const lines = text.split("\n");
    return [...lines.slice(0, start), formatRange(text, start, end, options), ...lines.slice(end + 1)].join("\n");
}

describe("formatRange", () => {
    test("keeps the enclosing indentation of a selection inside a Sub", () => {
        const doc = "Sub Main()\n    Dim a = 1\nx = 1\n  If a Then\nb = 2\n      End If\n    Dim z = 3\nEnd Sub\n";
        expect(formatRange(doc, 2, 5)).toBe("    x = 1\n    If a Then\n        b = 2\n    End If");
        expect(applyRange(doc, 2, 5)).toBe(format(doc));
    });

    test("leaves lines outside the range untouched", () => {
        const doc = "sub main()\nx=1\n  y = 2\nend sub\n";
        expect(applyRange(doc, 2, 2)).toBe("sub main()\nx=1\n    y = 2\nend sub\n");
    });

    test("a range ending at the last line ends the file like format does", () => {
        const doc = "x = 1\n\n\n";
        expect(applyRange(doc, 0, 3)).toBe(format(doc));
        expect(applyRange("x = 1", 0, 0)).toBe("x = 1\n");
    });

    test("an empty or all-blank document stays empty, in format and formatRange alike", () => {
        expect(format("")).toBe("");
        expect(format("\n\n  \n")).toBe("");
        expect(formatRange("", 0, 0)).toBe("");
        expect(applyRange("\n\n", 0, 2)).toBe(format("\n\n"));
    });

    for (const f of fixtures) {
        test(`${f.name}: the full range equals format()`, () => {
            const last = f.input.split("\n").length - 1;
            expect(applyRange(f.input, 0, last, f.options)).toBe(format(f.input, f.options));
        });

        test(`${f.name}: every range of the formatted output is a no-op`, () => {
            const lines = f.expected.split("\n");
            for (let s = 0; s < lines.length; s++) {
                for (let e = s; e < lines.length; e++) {
                    const got = applyRange(f.expected, s, e, f.options);
                    if (got !== f.expected) {
                        throw new Error(`range ${s}..${e} changed the document:\n${got}`);
                    }
                }
            }
        });
    }
});
