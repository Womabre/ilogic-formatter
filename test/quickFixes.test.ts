import { describe, expect, test } from "bun:test";
import { lint } from "../src/lint";
import { logExceptionEdits, optionStrictEdits } from "../src/quickFixes";
import { applyEdits } from "./applyEdits";

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
        expect(applyFix(input)).toBe("' Option Strict On\nOption Strict On\nOption Explicit On\nDim s = \"first\nOption Strict Off\nOption Explicit On\nlast\"\n");
    });

    test("inserts below a header comment, above a doc comment, and next to an existing option", () => {
        expect(applyFix("' Rule: Flange\n' Author: W\n\nImports System\nSub Main()\nEnd Sub\n"))
            .toBe("' Rule: Flange\n' Author: W\n\nOption Strict On\nOption Explicit On\nImports System\nSub Main()\nEnd Sub\n");
        expect(applyFix("' Header\n\n''' <summary>Entry</summary>\nSub Main()\nEnd Sub\n"))
            .toBe("' Header\n\nOption Strict On\nOption Explicit On\n''' <summary>Entry</summary>\nSub Main()\nEnd Sub\n");
        expect(applyFix("' Header\nImports System\nOption Explicit On\nx = 1\n"))
            .toBe("' Header\nImports System\nOption Strict On\nOption Explicit On\nx = 1\n");
        expect(applyFix("' only a comment\n")).toBe("Option Strict On\nOption Explicit On\n' only a comment\n");
    });
});

describe("Log the exception quick fix", () => {
    const fix = (text: string, line: number, unit = "    ") => {
        const edits = logExceptionEdits(text, line, unit);
        return edits && applyEdits(text, edits);
    };
    const logged = (indent: string, unit: string, variable = "ex") => `${indent}${unit}Logger.Error("Failed: " & ${variable}.Message)`;

    test("names the exception and logs it on the next line", () => {
        expect(fix("Try\nx()\nCatch\nEnd Try\n", 2)).toBe(`Try\nx()\nCatch ex As Exception\n${logged("", "    ")}\nEnd Try\n`);
    });

    test("keeps a named exception, and indents from the Catch with the unit given", () => {
        expect(fix("    Try\n        x()\n    Catch e As IOException\n    End Try\n", 2, "\t"))
            .toBe(`    Try\n        x()\n    Catch e As IOException\n${logged("    ", "\t", "e")}\n    End Try\n`);
    });

    test("keeps a When filter, also one with a string in it", () => {
        expect(fix("Try\nx()\nCatch When n > 0\nEnd Try\n", 2)).toBe(`Try\nx()\nCatch ex As Exception When n > 0\n${logged("", "    ")}\nEnd Try\n`);
        expect(fix('Try\nx()\nCatch err As Exception When err.Message <> "a : b"\nEnd Try\n', 2))
            .toBe(`Try\nx()\nCatch err As Exception When err.Message <> "a : b"\n${logged("", "    ", "err")}\nEnd Try\n`);
    });

    test("keeps a trailing comment", () => {
        expect(fix("Try\nx()\nCatch ' nothing to do\nEnd Try\n", 2)).toBe(`Try\nx()\nCatch ex As Exception ' nothing to do\n${logged("", "    ")}\nEnd Try\n`);
    });

    test("on the last line of a file without a final line break", () => {
        expect(fix("Try\nx()\nCatch", 2)).toBe(`Try\nx()\nCatch ex As Exception\n${logged("", "    ")}`);
    });

    test("in the file's own line ending", () => {
        expect(fix("Try\r\nx()\r\nCatch\r\nEnd Try\r\n", 2)).toBe(`Try\r\nx()\r\nCatch ex As Exception\r\n${logged("", "    ")}\r\nEnd Try\r\n`);
    });

    test("no fix for a Catch that shares its line with other statements", () => {
        expect(logExceptionEdits("Try : x() : Catch : End Try\n", 0, "    ")).toBeNull();
        expect(logExceptionEdits("Catch : n = 0\n", 0, "    ")).toBeNull();
    });
});
