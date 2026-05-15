"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.format = format;
const keywords_1 = require("./keywords");
const DEFAULT_OPTIONS = {
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
 * but will cause compile errors in VB.NET / iLogic.
 *
 * Each entry: [unicode char, replacement, description]
 */
const UNICODE_REPLACEMENTS = [
    // Dashes → hyphen-minus
    ["–", "-", "en dash"],
    ["—", "-", "em dash"],
    ["−", "-", "minus sign"],
    // Quotes → straight quotes
    ["‘", "'", "left single quotation mark"],
    ["’", "'", "right single quotation mark"],
    ["“", "\"", "left double quotation mark"],
    ["”", "\"", "right double quotation mark"],
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
const UNICODE_REGEX = new RegExp(UNICODE_REPLACEMENTS.map(([ch]) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
const UNICODE_MAP = new Map(UNICODE_REPLACEMENTS.map(([ch, rep]) => [ch, rep]));
function normalizeUnicode(text) {
    return text.replace(UNICODE_REGEX, (ch) => UNICODE_MAP.get(ch) ?? ch);
}
const BLOCK_ENDERS = new Set(["end sub", "end function", "end property"]);
function format(text, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    // ── Unicode normalization (whole-file pass before line processing) ─────────
    const normalized = opts.normalizeUnicode ? normalizeUnicode(text) : text;
    const lines = normalized.split(/\r?\n/);
    const result = [];
    let indentLevel = 0;
    let consecutiveBlanks = 0;
    let parenDepth = 0;
    const indentChar = opts.useTabs ? "\t" : " ".repeat(opts.indentSize);
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();
        // ── Blank lines ─────────────────────────────────────────────────────────
        if (trimmed === "") {
            consecutiveBlanks++;
            if (consecutiveBlanks <= opts.maxBlankLines) {
                result.push("");
            }
            continue;
        }
        consecutiveBlanks = 0;
        // ── Split comment ────────────────────────────────────────────────────────
        const { code, comment } = splitCodeAndComment(trimmed);
        let formattedComment = comment;
        if (opts.normalizeComments && comment !== null) {
            formattedComment = normalizeComment(comment);
        }
        let formattedCode = code;
        if (opts.normalizeKeywords && code.trim() !== "") {
            formattedCode = applyKeywordCasing(code);
        }
        // ── Classify ─────────────────────────────────────────────────────────────
        const norm = formattedCode.trim().toLowerCase();
        // Lookahead: find next non-blank line for context-sensitive classification
        let nextNorm = null;
        for (let j = i + 1; j < lines.length; j++) {
            const t = lines[j].trim();
            if (t !== "") {
                nextNorm = t.toLowerCase();
                break;
            }
        }
        const cls = classifyLine(norm, nextNorm);
        // ── Pre-line dedent ──────────────────────────────────────────────────────
        switch (cls) {
            case "closer":
                indentLevel = Math.max(0, indentLevel - 1);
                if (stack.length > 0) {
                    for (let j = stack.length - 1; j >= 0; j--) {
                        if (stack[j].kind === "block") {
                            stack.splice(j, 1);
                            break;
                        }
                    }
                }
                break;
            case "end-select": {
                const sel = findTopmostSelect(stack);
                if (sel) {
                    indentLevel = sel.level;
                    stack.splice(stack.lastIndexOf(sel), 1);
                }
                else {
                    indentLevel = Math.max(0, indentLevel - 1);
                }
                break;
            }
            case "case": {
                // Always snap to selectLevel + 1
                const sel = findTopmostSelect(stack);
                if (sel) {
                    indentLevel = sel.level + 1;
                }
                else {
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
        const codePart = formattedCode.trim();
        let outputLine;
        if (codePart === "" && formattedComment !== null) {
            outputLine = indent + formattedComment;
        }
        else if (formattedComment !== null) {
            outputLine = indent + codePart + " " + formattedComment;
        }
        else {
            outputLine = indent + codePart;
        }
        result.push(outputLine);
        // ── Track open parentheses for continuation-line indentation ─────────────
        parenDepth = Math.max(0, parenDepth + countNetParens(codePart));
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
function classifyLine(norm, nextNorm = null) {
    // Only classify the code that appears before the first string literal —
    // keywords are always at the start of the statement, and pulling words
    // from inside strings causes false matches (e.g. "Do you want..." → "do").
    const firstQuote = norm.indexOf('"');
    const codeHead = firstQuote >= 0 ? norm.slice(0, firstQuote) : norm;
    // Extract identifier tokens, stripping parens/operators (e.g. "Set(value" → "set")
    const words = codeHead.match(/[a-z][a-z0-9_]*/g) ?? [];
    const first = words[0] ?? "";
    const two = words.slice(0, 2).join(" ");
    if (two === "end select")
        return "end-select";
    if (two === "end if" || two === "end sub" || two === "end function" ||
        two === "end property" || two === "end get" || two === "end set" ||
        two === "end class" || two === "end interface" || two === "end structure" ||
        two === "end enum" || two === "end module" || two === "end namespace" ||
        two === "end with" || two === "end using" || two === "end synclock" ||
        two === "end try" || two === "end while")
        return "closer";
    if (first === "next" || first === "loop")
        return "closer"; // "Next i" etc.
    if (two === "select case" || first === "select")
        return "select";
    if (first === "case")
        return "case";
    if (first === "else" || first === "elseif")
        return "else";
    if (first === "catch")
        return "catch";
    if (first === "finally")
        return "finally";
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
            if (!isBlockProperty)
                return "none";
        }
        return "opener";
    }
    return "none";
}
// ── Helpers ──────────────────────────────────────────────────────────────────
function findTopmostSelect(stack) {
    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].kind === "select")
            return stack[i];
    }
    return null;
}
function splitCodeAndComment(line) {
    let inString = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inString && line[i + 1] === '"') {
                i++;
            }
            else {
                inString = !inString;
            }
        }
        else if (ch === "'" && !inString) {
            return { code: line.slice(0, i).trimEnd(), comment: line.slice(i) };
        }
    }
    return { code: line, comment: null };
}
function normalizeComment(comment) {
    if (comment.length <= 1)
        return comment;
    const after = comment.slice(1);
    if (["!", "#", "'", "=", "-"].includes(after[0]))
        return comment;
    if (after.startsWith(" "))
        return comment;
    return "' " + after;
}
function applyKeywordCasing(code) {
    let result = "";
    let i = 0;
    while (i < code.length) {
        if (code[i] === '"') {
            // Inside a string literal — copy verbatim without keyword replacement
            result += '"';
            i++;
            while (i < code.length) {
                if (code[i] === '"') {
                    result += '"';
                    i++;
                    if (code[i] === '"') {
                        result += '"';
                        i++;
                    } // escaped ""
                    else
                        break;
                }
                else {
                    result += code[i++];
                }
            }
        }
        else {
            // Outside a string — find next " and apply keyword casing to this segment
            let j = i;
            while (j < code.length && code[j] !== '"')
                j++;
            result += code.slice(i, j).replace(/\b([A-Za-z][A-Za-z0-9_]*)\b/g, (match) => {
                return keywords_1.VB_KEYWORDS[match.toLowerCase()] ?? match;
            });
            i = j;
        }
    }
    return result;
}
function countNetParens(code) {
    let depth = 0;
    let inString = false;
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (ch === '"') {
            if (inString && code[i + 1] === '"') {
                i++;
            }
            else {
                inString = !inString;
            }
        }
        else if (!inString) {
            if (ch === '(')
                depth++;
            else if (ch === ')')
                depth--;
        }
    }
    return depth;
}
function hasSingleLineBody(norm) {
    const match = norm.match(/\bthen\s+(.+)/i);
    return match !== null && match[1].trim() !== "";
}
//# sourceMappingURL=formatter.js.map