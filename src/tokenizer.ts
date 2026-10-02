// Line tokenizer for VB.NET / iLogic.
//
// Splits a line into code, string and comment tokens so every formatter rule
// can work on code only and leave string and comment content untouched.
// Quote and apostrophe characters follow Roslyn's VB scanner
// (CharacterInfo.IsDoubleQuote / IsSingleQuote): the curly and fullwidth forms
// are real delimiters in VB, not lookalikes.

export type TokenKind = "code" | "string" | "comment";

export interface Token {
    kind: TokenKind;
    text: string;
}

/** Tokenizer state carried from one line to the next (VB 14 multi-line strings). */
export interface LineState {
    /** Non-null while a string literal is still open at the end of a line. */
    openString: { interpolated: boolean; braceDepth: number } | null;
}

export const INITIAL_STATE: LineState = { openString: null };

export interface TokenizedLine {
    tokens: Token[];
    /** The line began inside a string literal opened on an earlier line. */
    startsInString: boolean;
    endState: LineState;
}

export function isDoubleQuote(ch: string | undefined): boolean {
    return ch === '"' || ch === "“" || ch === "”" || ch === "＂";
}

export function isSingleQuote(ch: string | undefined): boolean {
    return ch === "'" || ch === "‘" || ch === "’" || ch === "＇";
}

/**
 * Scans string content starting at `start` (just after the opening quote, or
 * at the start of a continuation line). Returns the index just past the
 * closing quote, or -1 when the string is still open at the end of the line.
 */
function scanString(
    line: string,
    start: number,
    interpolated: boolean,
    braceDepth: number
): { end: number; braceDepth: number } {
    let i = start;
    while (i < line.length) {
        const ch = line[i];
        if (braceDepth > 0) {
            // Inside an interpolation hole: code with possibly nested strings.
            if (ch === "$" && isDoubleQuote(line[i + 1])) {
                const inner = scanString(line, i + 2, true, 0);
                if (inner.end < 0) return { end: -1, braceDepth };
                i = inner.end;
                continue;
            }
            if (isDoubleQuote(ch)) {
                const inner = scanString(line, i + 1, false, 0);
                if (inner.end < 0) return { end: -1, braceDepth };
                i = inner.end;
                continue;
            }
            if (ch === "{") braceDepth++;
            else if (ch === "}") braceDepth--;
            i++;
            continue;
        }
        if (isDoubleQuote(ch)) {
            if (isDoubleQuote(line[i + 1])) { i += 2; continue; } // escaped ""
            return { end: i + 1, braceDepth: 0 };
        }
        if (interpolated && ch === "{") {
            if (line[i + 1] === "{") { i += 2; continue; } // escaped {{
            braceDepth = 1;
        }
        i++;
    }
    return { end: -1, braceDepth };
}

/** True when `REM` at index `i` starts a comment (statement start, whole word). */
function isRemComment(line: string, i: number, codeSoFar: string): boolean {
    if (!/^rem(\s|$)/i.test(line.slice(i, i + 4))) return false;
    const before = codeSoFar.trimEnd();
    return before === "" || before.endsWith(":");
}

export function tokenizeLine(line: string, state: LineState = INITIAL_STATE): TokenizedLine {
    const tokens: Token[] = [];
    let code = "";
    const flushCode = () => {
        if (code !== "") {
            tokens.push({ kind: "code", text: code });
            code = "";
        }
    };

    let i = 0;
    const startsInString = state.openString !== null;
    if (state.openString) {
        const { interpolated, braceDepth } = state.openString;
        const res = scanString(line, 0, interpolated, braceDepth);
        if (res.end < 0) {
            tokens.push({ kind: "string", text: line });
            return { tokens, startsInString, endState: { openString: { interpolated, braceDepth: res.braceDepth } } };
        }
        tokens.push({ kind: "string", text: line.slice(0, res.end) });
        i = res.end;
    }

    while (i < line.length) {
        const ch = line[i];
        const interpolated = ch === "$" && isDoubleQuote(line[i + 1]);
        if (interpolated || isDoubleQuote(ch)) {
            flushCode();
            const contentStart = i + (interpolated ? 2 : 1);
            const res = scanString(line, contentStart, interpolated, 0);
            if (res.end < 0) {
                tokens.push({ kind: "string", text: line.slice(i) });
                return { tokens, startsInString, endState: { openString: { interpolated, braceDepth: res.braceDepth } } };
            }
            tokens.push({ kind: "string", text: line.slice(i, res.end) });
            i = res.end;
        } else if (isSingleQuote(ch) || ((ch === "r" || ch === "R") && isRemComment(line, i, code) && !/[A-Za-z0-9_]/.test(line[i - 1] ?? ""))) {
            flushCode();
            tokens.push({ kind: "comment", text: line.slice(i) });
            return { tokens, startsInString, endState: INITIAL_STATE };
        } else {
            code += ch;
            i++;
        }
    }
    flushCode();
    return { tokens, startsInString, endState: INITIAL_STATE };
}

/** The line's code with every string literal replaced by `""` and comments dropped. */
export function codeOnly(tokens: Token[]): string {
    return tokens
        .filter((t) => t.kind !== "comment")
        .map((t) => (t.kind === "string" ? '""' : t.text))
        .join("");
}
