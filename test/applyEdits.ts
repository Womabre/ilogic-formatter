import { FixEdit } from "../src/edits";

/** The text after the edits (single-line edits, applied from the end so columns stay valid). */
export function applyEdits(text: string, edits: FixEdit[]): string {
    const starts = [0];
    for (const newline of text.matchAll(/\r?\n/g)) starts.push(newline.index! + newline[0].length);
    return edits
        .map((e) => ({ start: starts[e.line] + e.start, end: starts[e.line] + e.end, text: e.text }))
        .sort((a, b) => b.start - a.start)
        .reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text);
}
