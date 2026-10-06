import { describe, expect, test } from "bun:test";
import { lint } from "../src/lint";
import { optionStrictEdits } from "../src/quickFixes";

function applyFix(text: string): string {
    const starts = [0];
    for (const newline of text.matchAll(/\r?\n/g)) starts.push(newline.index! + newline[0].length);
    const edits = optionStrictEdits(text).map((edit) => ({
        start: starts[edit.line] + edit.start, end: starts[edit.line] + edit.end, text: edit.text,
    })).sort((a, b) => b.start - a.start);
    for (const edit of edits) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    return text;
}

describe("Option Strict quick fix", () => {
    test("changes existing Off options in place, preserving comments and CRLF", () => {
        const input = "option strict off ' keep this\r\nOption Explicit Off\r\nSub Main()\r\nEnd Sub\r\n";
        const fixed = applyFix(input);
        expect(fixed).toBe(input.replace(/off/gi, "On"));
        expect(lint(fixed).some((p) => p.rule === "option-strict")).toBe(false);
        expect(optionStrictEdits(fixed)).toEqual([]);
    });

    test("inserts only the missing option and changes Explicit Off", () => {
        expect(applyFix("Option Explicit Off\nx = 1\n")).toBe("Option Strict On\nOption Explicit On\nx = 1\n");
        expect(applyFix("Option Strict Off\nx = 1\n")).toBe("Option Explicit On\nOption Strict On\nx = 1\n");
        expect(applyFix("Option Explicit On\nx = 1\n")).toBe("Option Strict On\nOption Explicit On\nx = 1\n");
    });

    test("adds absent options and makes implicit On explicit without duplicates", () => {
        expect(applyFix("Sub Main()\nEnd Sub\n")).toBe("Option Strict On\nOption Explicit On\nSub Main()\nEnd Sub\n");
        const fixed = applyFix("Option Strict ' strict types\nOption Explicit\nx = 1\n");
        expect(fixed).toBe("Option Strict On ' strict types\nOption Explicit On\nx = 1\n");
        expect(lint(fixed).some((p) => p.rule === "option-strict")).toBe(false);
        expect(optionStrictEdits(fixed)).toEqual([]);
    });

    test("does not mistake comments or multiline string contents for declarations", () => {
        const input = "' Option Strict On\nDim s = \"first\nOption Strict Off\nOption Explicit On\nlast\"\n";
        expect(applyFix(input)).toBe("Option Strict On\nOption Explicit On\n" + input);
    });
});
