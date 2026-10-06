import { codeOnly, INITIAL_STATE, LineState, tokenizeLine } from "./tokenizer";

export interface FixEdit {
    line: number;
    start: number;
    end: number;
    text: string;
}

/** Enable the options in place, preserving comments and existing declarations. */
export function optionStrictEdits(text: string): FixEdit[] {
    const missing = new Set(["strict", "explicit"]);
    const edits: FixEdit[] = [];
    let state: LineState = INITIAL_STATE;
    text.split(/\r?\n/).forEach((raw, line) => {
        const inString = state.openString !== null;
        const tokenized = tokenizeLine(raw, state);
        state = tokenized.endState;
        if (inString) return;
        const m = /^(\s*Option\s+(Strict|Explicit))(?:[ \t]+(On|Off))?\b/i.exec(codeOnly(tokenized.tokens));
        if (!m) return;
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
        edits.push({ line: 0, start: 0, end: 0, text: declarations.join(eol) + eol });
    }
    return edits;
}
