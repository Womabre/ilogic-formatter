import { VB_KEYWORDS } from "./keywords";
import { codeOnly, INITIAL_STATE, isDoubleQuote, isSingleQuote, LineState, Token, tokenizeLine } from "./tokenizer";

export interface FormatOptions {
    indentSize?: number;
    useTabs?: boolean;
    maxBlankLines?: number;
    blankLineAfterBlock?: boolean;
    normalizeKeywords?: boolean;
    normalizeComments?: boolean;
    normalizeUnicode?: boolean;
}

const DEFAULT_OPTIONS: Required<FormatOptions> = {
    indentSize: 4,
    useTabs: false,
    maxBlankLines: 1,
    blankLineAfterBlock: true,
    normalizeKeywords: true,
    normalizeComments: true,
    normalizeUnicode: true,
};

/**
 * Unicode characters that are visually similar to ASCII equivalents
 * but will cause compile errors in VB.NET / iLogic code.
 * Applied to code tokens only: string literals and comments keep their text.
 * Curly quote delimiters and comment markers are handled by the tokenizer.
 *
 * Each entry: [unicode char, replacement, description]
 */
const UNICODE_REPLACEMENTS: [string, string, string][] = [
    // Dashes → hyphen-minus
    ["–", "-", "en dash"],
    ["—", "-", "em dash"],
    ["−", "-", "minus sign"],
    // Quote lookalikes VB does not treat as delimiters
    ["„", "\"", "double low-9 quotation mark"],
    ["′", "'", "prime"],
    ["″", "\"", "double prime"],
    // Spaces → regular space
    [" ", " ", "non-breaking space"],
    [" ", " ", "narrow no-break space"],
    [" ", " ", "thin space"],
    ["​", "", "zero-width space"],
    ["﻿", "", "zero-width no-break space / BOM"],
    // Math / operators
    ["×", "*", "multiplication sign"],
    ["÷", "/", "division sign"],
    ["∕", "/", "division slash"],
    ["≠", "<>", "not equal to"],
    ["≤", "<=", "less-than or equal to"],
    ["≥", ">=", "greater-than or equal to"],
    ["²", "^2", "superscript two"],
    ["³", "^3", "superscript three"],
];

// Build a single regex from all replacements for efficiency
const UNICODE_REGEX = new RegExp(
    UNICODE_REPLACEMENTS.map(([ch]) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "g"
);
const UNICODE_MAP = new Map(UNICODE_REPLACEMENTS.map(([ch, rep]) => [ch, rep]));

function normalizeUnicode(text: string): string {
    return text.replace(UNICODE_REGEX, (ch) => UNICODE_MAP.get(ch) ?? ch);
}

/**
 * Replaces lookalikes in code tokens, and turns curly/fullwidth string
 * delimiters and comment markers into ASCII. VB already reads those as
 * delimiters, so this changes appearance only, never meaning. String content
 * (including doubled-quote escapes) and comment text are left alone.
 */
function normalizeLineUnicode(tokens: Token[]): Token[] {
    return tokens.map((t) => {
        if (t.kind === "code") return { ...t, text: normalizeUnicode(t.text) };
        if (t.kind === "comment") {
            // The leading run of markers (' or ''' doc comments); the text after stays as written.
            let n = 0;
            while (isSingleQuote(t.text[n])) n++;
            return { ...t, text: "'".repeat(n) + t.text.slice(n) };
        }
        let text = t.text;
        const open = text[0] === "$" ? 1 : 0;
        if (isDoubleQuote(text[open])) text = text.slice(0, open) + '"' + text.slice(open + 1);
        const last = text.length - 1;
        if (last > open && isDoubleQuote(text[last])) {
            text = text.slice(0, last) + '"';
        }
        return { ...t, text };
    });
}

const BLOCK_ENDERS = new Set(["end sub", "end function", "end property"]);

type StackEntry = { kind: "block" } | { kind: "select"; level: number };
type LineClass = "opener" | "closer" | "end-select" | "select" | "case" | "else" | "catch" | "finally" | "none";

export function format(text: string, options: FormatOptions = {}): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const lines = text.split(/\r?\n/);
    const result: string[] = [];
    let indentLevel = 0;
    let consecutiveBlanks = 0;
    let parenDepth = 0;
    let state: LineState = INITIAL_STATE;
    const indentChar = opts.useTabs ? "\t" : " ".repeat(opts.indentSize);
    const stack: StackEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];

        // ── Continuation of a multi-line string: emit verbatim ──────────────────
        // Trimming, re-indenting or dropping blank lines here would change the
        // string's value. Only the code after the closing quote is tracked.
        if (state.openString) {
            const tokenized = tokenizeLine(rawLine, state);
            state = tokenized.endState;
            result.push(rawLine);
            consecutiveBlanks = 0;
            parenDepth = Math.max(0, parenDepth + countNetParens(tokenized.tokens));
            continue;
        }

        // ── Tokenize (and normalize lookalikes in code only) ─────────────────────
        // A line that ends inside a string keeps its trailing whitespace: it is
        // part of the string value.
        const lineStart = state;
        let tokenized = tokenizeLine(rawLine.trimStart(), lineStart);
        if (opts.normalizeUnicode) {
            // Re-tokenize: a normalized lookalike (e.g. ″ → ") can open a string.
            const normalizedLine = normalizeLineUnicode(tokenized.tokens).map((t) => t.text).join("");
            tokenized = tokenizeLine(normalizedLine, lineStart);
        }
        state = tokenized.endState;
        const tokens = tokenized.tokens;
        const endsInString = state.openString !== null;

        // ── Blank lines ─────────────────────────────────────────────────────────
        if (tokens.every((t) => t.text.trim() === "")) {
            consecutiveBlanks++;
            if (consecutiveBlanks <= opts.maxBlankLines) {
                result.push("");
            }
            continue;
        }
        consecutiveBlanks = 0;

        // ── Split comment ────────────────────────────────────────────────────────
        const commentToken = tokens.find((t) => t.kind === "comment");
        let formattedComment = commentToken ? commentToken.text.trimEnd() : null;
        if (opts.normalizeComments && formattedComment !== null) {
            formattedComment = normalizeComment(formattedComment);
        }

        const codeTokens = tokens.filter((t) => t.kind !== "comment");
        const casedTokens = opts.normalizeKeywords ? codeTokens.map(applyKeywordCasing) : codeTokens;
        let formattedCode = casedTokens.map((t) => t.text).join("");
        formattedCode = endsInString ? formattedCode : formattedCode.trimEnd();

        // ── Classify (strings blanked, so their words never match keywords) ──────
        const norm = codeOnly(casedTokens).trim().toLowerCase();

        // Lookahead: find next non-blank line for context-sensitive classification
        let nextNorm: string | null = null;
        for (let j = i + 1; j < lines.length; j++) {
            const t = lines[j].trim();
            if (t !== "") { nextNorm = t.toLowerCase(); break; }
        }

        const cls = classifyLine(norm, nextNorm);

        // ── Pre-line dedent ──────────────────────────────────────────────────────
        switch (cls) {
            case "closer":
                indentLevel = Math.max(0, indentLevel - 1);
                if (stack.length > 0) {
                    for (let j = stack.length - 1; j >= 0; j--) {
                        if (stack[j].kind === "block") { stack.splice(j, 1); break; }
                    }
                }
                break;
            case "end-select": {
                const sel = findTopmostSelect(stack);
                if (sel) {
                    indentLevel = sel.level;
                    stack.splice(stack.lastIndexOf(sel), 1);
                } else {
                    indentLevel = Math.max(0, indentLevel - 1);
                }
                break;
            }
            case "case": {
                // Always snap to selectLevel + 1
                const sel = findTopmostSelect(stack);
                if (sel) {
                    indentLevel = sel.level + 1;
                } else {
                    indentLevel = Math.max(0, indentLevel - 1);
                }
                break;
            }
            case "else":
            case "catch":
            case "finally":
                indentLevel = Math.max(0, indentLevel - 1);
                break;
        }

        // ── Emit line ────────────────────────────────────────────────────────────
        const continuationExtra = parenDepth > 0 ? 1 : 0;
        const indent = indentChar.repeat(Math.max(0, indentLevel + continuationExtra));
        const codePart = formattedCode.trimStart();
        let outputLine: string;
        if (codePart === "" && formattedComment !== null) {
            outputLine = indent + formattedComment;
        } else if (formattedComment !== null) {
            outputLine = indent + codePart + " " + formattedComment;
        } else {
            outputLine = indent + codePart;
        }
        result.push(outputLine);

        // ── Track open parentheses for continuation-line indentation ─────────────
        parenDepth = Math.max(0, parenDepth + countNetParens(casedTokens));

        // ── Post-line indent ─────────────────────────────────────────────────────
        switch (cls) {
            case "opener":
                stack.push({ kind: "block" });
                indentLevel++;
                break;
            case "select":
                // Push with the current indent level so Case can snap back to level+1
                stack.push({ kind: "select", level: indentLevel });
                indentLevel++; // move to Case level; case body will be +1 more
                break;
            case "case":
                // Body of this case indents one more
                indentLevel++;
                break;
            case "else":
            case "catch":
            case "finally":
                indentLevel++;
                break;
        }

        // ── Blank line after End Sub / End Function / End Property ───────────────
        if (opts.blankLineAfterBlock && BLOCK_ENDERS.has(norm)) {
            const nextLine = lines[i + 1];
            if (nextLine !== undefined && nextLine.trim() !== "") {
                result.push("");
            }
        }
    }

    while (result.length > 0 && result[result.length - 1] === "") {
        result.pop();
    }
    return result.join("\n") + "\n";
}

// ── Classifier ───────────────────────────────────────────────────────────────

function classifyLine(norm: string, nextNorm: string | null = null): LineClass {
    // `norm` has every string literal blanked to "", so words inside strings
    // (e.g. "Do you want..." → "do") can never be read as keywords.
    // Extract identifier tokens, stripping parens/operators (e.g. "Set(value" → "set")
    const words = norm.match(/[a-z][a-z0-9_]*/g) ?? [];
    const first = words[0] ?? "";
    const two = words.slice(0, 2).join(" ");

    if (two === "end select") return "end-select";
    if (two === "end if" || two === "end sub" || two === "end function" ||
        two === "end property" || two === "end get" || two === "end set" ||
        two === "end class" || two === "end interface" || two === "end structure" ||
        two === "end enum" || two === "end module" || two === "end namespace" ||
        two === "end with" || two === "end using" || two === "end synclock" ||
        two === "end try" || two === "end while")
        return "closer";

    if (first === "next" || first === "loop") return "closer"; // "Next i" etc.
    if (two === "select case" || first === "select") return "select";
    if (first === "case") return "case";
    if (first === "else" || first === "elseif") return "else";
    if (first === "catch") return "catch";
    if (first === "finally") return "finally";
    if (first === "if") {
        return hasSingleLineBody(norm) ? "none" : "opener";
    }

    // Access modifiers / other prefixes that appear before the block keyword
    // e.g. "Public Shared Function", "Private Sub", "Protected Overrides Sub"
    const MODIFIERS = new Set([
        "public", "private", "protected", "friend", "shared", "static",
        "overrides", "overridable", "mustoverride", "notoverridable",
        "shadows", "partial", "readonly", "withevents", "async", "iterator",
    ]);
    const BLOCK_OPENERS = new Set([
        "for", "while", "do", "sub", "function", "property", "get", "set",
        "with", "using", "synclock", "try", "class", "interface", "structure",
        "enum", "module", "namespace",
    ]);

    // Find the first word that isn't a modifier — that's the real keyword
    const effectiveKeyword = words.find(w => !MODIFIERS.has(w)) ?? first;

    if (BLOCK_OPENERS.has(effectiveKeyword)) {
        // Auto-properties are single-line and have no Get/Set/End Property block.
        // Only treat Property as a block opener when the next non-blank line
        // is Get, Set, or End Property.
        if (effectiveKeyword === "property") {
            const nw = nextNorm ? nextNorm.match(/[a-z][a-z0-9_]*/g) ?? [] : [];
            const nFirst = nw[0] ?? "";
            const nTwo = nw.slice(0, 2).join(" ");
            const isBlockProperty = nFirst === "get" || nFirst === "set" || nTwo === "end property";
            if (!isBlockProperty) return "none";
        }
        return "opener";
    }
    return "none";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findTopmostSelect(stack: StackEntry[]): (StackEntry & { kind: "select" }) | null {
    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === "select") return stack[i] as StackEntry & { kind: "select" };
    }
    return null;
}

function normalizeComment(comment: string): string {
    // Only apostrophe comments; REM comments are left as written.
    if (!isSingleQuote(comment[0]) || comment.length <= 1) return comment;
    const after = comment.slice(1);
    if (["!", "#", "'", "=", "-"].includes(after[0])) return comment;
    if (after.startsWith(" ")) return comment;
    return comment[0] + " " + after;
}

function applyKeywordCasing(token: Token): Token {
    if (token.kind !== "code") return token;
    const text = token.text.replace(/\b([A-Za-z][A-Za-z0-9_]*)\b/g, (match) => {
        return VB_KEYWORDS[match.toLowerCase()] ?? match;
    });
    return { ...token, text };
}

function countNetParens(tokens: Token[]): number {
    let depth = 0;
    for (const t of tokens) {
        if (t.kind !== "code") continue;
        for (const ch of t.text) {
            if (ch === "(") depth++;
            else if (ch === ")") depth--;
        }
    }
    return depth;
}

function hasSingleLineBody(norm: string): boolean {
    const match = norm.match(/\bthen\s+(.+)/i);
    return match !== null && match[1].trim() !== "";
}
