import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { LineEdit, minimalLineEdit } from "../src/edits";
import { format } from "../src/formatter";

/** Applies an edit the way an editor does: by line and character positions. */
function apply(text: string, edit: LineEdit): string {
    const lines = text.split("\n");
    const offset = (line: number, character: number) =>
        lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + character;
    return text.slice(0, offset(edit.startLine, edit.startCharacter)) + edit.text + text.slice(offset(edit.endLine, edit.endCharacter));
}

describe("minimalLineEdit", () => {
    test("no edit when nothing changes", () => {
        expect(minimalLineEdit("a\nb\n", "a\nb\n")).toBeNull();
    });

    test("touches only the lines that differ", () => {
        expect(minimalLineEdit("a\nb\nc\nd\n", "a\nB\nc\nd\n")).toEqual(
            { startLine: 1, startCharacter: 0, endLine: 2, endCharacter: 0, text: "B\n" });
        expect(minimalLineEdit("a\nd\n", "a\nb\nc\nd\n")).toEqual(
            { startLine: 1, startCharacter: 0, endLine: 1, endCharacter: 0, text: "b\nc\n" });
        expect(minimalLineEdit("a\nb\nc\nd\n", "a\nd\n")).toEqual(
            { startLine: 1, startCharacter: 0, endLine: 3, endCharacter: 0, text: "" });
    });

    test("every pair of small texts round-trips, including changes at either end", () => {
        const texts = ["", "a", "a\n", "a\nb", "a\nb\n", "b\na\n", "a\n\n\nb\n", "\n\na", "x\na\nb\ny", "a\na\na\n", "a\na\n"];
        for (const before of texts) {
            for (const after of texts) {
                const edit = minimalLineEdit(before, after);
                expect(edit === null ? before : apply(before, edit)).toBe(after);
            }
        }
    });

    test("formatting every fixture through an edit gives the formatted text", () => {
        const root = join(import.meta.dir, "fixtures");
        for (const name of readdirSync(root).filter((n) => !existsSync(join(root, n, "todo.md")))) {
            const options = existsSync(join(root, name, "options.json")) ? JSON.parse(readFileSync(join(root, name, "options.json"), "utf8")) : {};
            const input = readFileSync(join(root, name, "input.iLogicVb"), "utf8").replace(/\r\n/g, "\n");
            const formatted = format(input, options);
            const edit = minimalLineEdit(input, formatted);
            expect(edit === null ? input : apply(input, edit)).toBe(formatted);
        }
    });
});
