import { scanLines } from "./tokenizer";

export interface FixEdit {
    line: number;
    start: number;
    end: number;
    text: string;
}

/**
 * Enable the options in place, preserving comments and existing declarations.
 * Missing options go next to an existing Option statement, or else in front of
 * the first line of code: below a header comment, but above a doc comment
 * (''') that belongs to that first line.
 */
export function optionStrictEdits(text: string): FixEdit[] {
    const missing = new Set(["strict", "explicit"]);
    const edits: FixEdit[] = [];
    const lines = scanLines(text);
    let firstOption = -1;
    let firstCode = -1;
    lines.forEach((l, line) => {
        if (l.startsInString) return;
        if (firstCode < 0 && l.code !== "") firstCode = line;
        // Columns in `masked` are columns in the line
        const m = /^(\s*Option\s+(Strict|Explicit))(?:[ \t]+(On|Off))?\b/i.exec(l.masked);
        if (!m) return;
        if (firstOption < 0) firstOption = line;
        missing.delete(m[2].toLowerCase());
        if (m[3]?.toLowerCase() === "off") {
            const start = m[0].length - m[3].length;
            edits.push({ line, start, end: start + m[3].length, text: "On" });
        } else if (!m[3]) {
            // VB defaults a bare Option declaration to On. Make it explicit
            // so the convention diagnostic clears without adding a duplicate.
            edits.push({ line, start: m[0].length, end: m[0].length, text: " On" });
        }
    });
    if (missing.size > 0) {
        const eol = text.includes("\r\n") ? "\r\n" : "\n";
        const declarations = [...missing].map((option) => `Option ${option === "strict" ? "Strict" : "Explicit"} On`);
        let line = firstOption >= 0 ? firstOption : Math.max(0, firstCode);
        if (firstOption < 0) while (line > 0 && /^\s*'''/.test(lines[line - 1].raw)) line--;
        edits.push({ line, start: 0, end: 0, text: declarations.join(eol) + eol });
    }
    return edits;
}
