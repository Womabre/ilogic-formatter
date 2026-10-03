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
    // Quote lookalikes VB does not treat as delimiters. Primes (′ ″) are not
    // listed: they are inch/foot marks, never paired quotes, and turning one
    // into " or ' opens a string or comment that swallows the rest of the line
    // or file. Left as written, the compiler points at them instead.
    ["„", "\"", "double low-9 quotation mark"],
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

type StackEntry =
    | { kind: "block"; keyword: string }
    // A multi-line lambda: the body indents from `level`, the paren depth of
    // the enclosing statement is set aside until its End Sub/End Function.
    | { kind: "lambda"; level: number; outerLevel: number; savedParenDepth: number }
    | { kind: "select"; level: number };
type LineClass = "opener" | "lambda" | "closer" | "end-select" | "select" | "case" | "else" | "catch" | "finally" | "none";

export function format(text: string, options: FormatOptions = {}): string {
    const result = formatLines(text.split(/\r?\n/), { ...DEFAULT_OPTIONS, ...options }).flat();
    while (result.length > 0 && result[result.length - 1] === "") {
        result.pop();
    }
    // An empty or all-blank document stays empty
    return result.length > 0 ? result.join("\n") + "\n" : "";
}

/**
 * Formats lines `startLine`..`endLine` (0-based, inclusive) of `text`.
 * Indentation, open blocks and blank-line state come from the whole document,
 * so a selection inside a Sub keeps its context. Returns the replacement for
 * exactly those full lines, without a trailing newline; when the range reaches
 * the last line it ends the way `format` ends the file.
 */
export function formatRange(text: string, startLine: number, endLine: number, options: FormatOptions = {}): string {
    const lines = text.split(/\r?\n/);
    const last = lines.length - 1;
    const start = Math.max(0, Math.min(startLine, last));
    const end = Math.max(start, Math.min(endLine, last));
    const result = formatLines(lines, { ...DEFAULT_OPTIONS, ...options }).slice(start, end + 1).flat();
    if (end === last) {
        while (result.length > 0 && result[result.length - 1] === "") {
            result.pop();
        }
        result.push("");
    }
    return result.join("\n");
}

/** True when line `line` (0-based) begins inside a multi-line string literal. */
export function startsInString(text: string, line: number): boolean {
    const lines = text.split(/\r?\n/);
    let state: LineState = INITIAL_STATE;
    for (let i = 0; i < line && i < lines.length; i++) {
        state = tokenizeLine(state.openString ? lines[i] : lines[i].trimStart(), state).endState;
    }
    return state.openString !== null;
}

/** A block structure problem: a closer without an opener, or a block that never closes. */
export interface BlockProblem {
    /** 0-based line of the problem */
    line: number;
    message: string;
    /** 0-based line of the other end (the opener, or the line that exposed it) */
    relatedLine?: number;
}

/**
 * Finds unbalanced blocks: End If without If, End Sub while an If is still
 * open, Else outside an If, Case outside a Select Case, blocks never closed.
 * Uses the same classification as the formatter, so it sees the code the
 * same way formatting does.
 */
export function checkBlocks(text: string, options: FormatOptions = {}): BlockProblem[] {
    const code = new BlockChecker();
    const directives = new BlockChecker();
    formatLines(text.split(/\r?\n/), { ...DEFAULT_OPTIONS, ...options }, { code, directives, branchStarts: [] });
    return [...code.finish(), ...directives.finish()].sort((a, b) => a.line - b.line);
}

/**
 * Tracks open blocks the way the compiler pairs them. A closer pops back to
 * its matching opener and reports every block it skips, so one missing
 * End If gives one warning instead of a cascade.
 */
class BlockChecker {
    private stack: { keyword: string; line: number }[] = [];
    private problems: BlockProblem[] = [];

    open(keyword: string, line: number): void {
        this.stack.push({ keyword, line });
    }

    /**
     * "End If", "Next", ...: closes the innermost block of one of `keywords`
     * (End Sub closes a Sub lambda or a Sub, whichever is innermost). The last
     * keyword names the block in messages.
     */
    close(keywords: string[], closer: string, line: number): void {
        const match = this.find(keywords);
        if (match < 0) {
            this.problems.push({ line, message: `${closer} has no matching ${blockName(keywords[keywords.length - 1])}` });
            return;
        }
        this.reportSkipped(match, closer, line);
        this.stack.length = match;
    }

    /** "Else", "Case", "Catch", ...: must sit directly inside one of `keywords`. */
    middle(keywords: string[], statement: string, line: number): void {
        const match = this.find(keywords);
        if (match < 0) {
            this.problems.push({ line, message: `${statement} has no matching ${blockName(keywords[0])}` });
            return;
        }
        this.reportSkipped(match, statement, line);
        this.stack.length = match + 1;
    }

    /** The open blocks, to rewind to at #Else (each #If branch starts from the same state). */
    snapshot(): { keyword: string; line: number }[] {
        return [...this.stack];
    }

    restore(snapshot: { keyword: string; line: number }[]): void {
        this.stack = [...snapshot];
    }

    finish(): BlockProblem[] {
        for (const open of this.stack) {
            this.problems.push({ line: open.line, message: `${blockName(open.keyword)} is never closed` });
        }
        this.stack = [];
        return this.problems;
    }

    private find(keywords: string[]): number {
        for (let k = this.stack.length - 1; k >= 0; k--) {
            if (keywords.includes(this.stack[k].keyword)) return k;
        }
        return -1;
    }

    private reportSkipped(match: number, statement: string, line: number): void {
        for (const open of this.stack.slice(match + 1)) {
            this.problems.push({
                line: open.line,
                message: `${blockName(open.keyword)} is not closed before the ${statement} on line ${line + 1}`,
                relatedLine: line,
            });
        }
    }
}

const BLOCK_NAMES: Record<string, string> = { select: "Select Case", lambda_sub: "Sub lambda", lambda_function: "Function lambda" };

function blockName(keyword: string): string {
    const directive = keyword.startsWith("#") ? "#" : "";
    const word = keyword.replace(/^#/, "");
    return directive + (BLOCK_NAMES[word] ?? VB_KEYWORDS[word] ?? word);
}

/** The statement as written in canonical casing, for messages ("end if" → "End If"). */
function statementName(statement: string): string {
    const s = stripAttributes(statement).trim();
    const directive = s.startsWith("#") ? "#" : "";
    const words = (s.match(/[a-z][a-z0-9_]*/g) ?? []).slice(0, 2);
    const first = words[0] ?? "";
    const shown = first === "end" || first === "select" || (first === "case" && words[1] === "else") ? words : [first];
    return directive + shown.map((w) => VB_KEYWORDS[w] ?? w).join(" ");
}

interface Checkers {
    code: BlockChecker;
    directives: BlockChecker;
    /** Code-block state at each open #If, innermost last */
    branchStarts: { keyword: string; line: number }[][];
}

/** Runs the formatter over every line; entry i holds the output lines for input line i (0, 1 or 2). */
function formatLines(lines: string[], opts: Required<FormatOptions>, checkers?: Checkers): string[][] {
    const out: string[][] = lines.map(() => []);
    // Classification text per line, computed once (used by lookaheads)
    const textCache: (string | undefined)[] = [];
    const lineText = (j: number) => (textCache[j] ??= classificationText(tokenizeLine(lines[j].trim()).tokens));
    let indentLevel = 0;
    let consecutiveBlanks = 0;
    let parenDepth = 0;
    let state: LineState = INITIAL_STATE;
    // The previous code line ended in "_", an operator or a comma, so this
    // line continues its statement
    let continuesStatement = false;
    // The previous code line closed an attribute ("<Attr> _"): the line after
    // it starts the real statement
    let afterAttribute = false;
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
            out[i].push(rawLine);
            consecutiveBlanks = 0;
            parenDepth = Math.max(0, parenDepth + countNetParens(tokenized.tokens));
            if (!state.openString) {
                const tail = codeOnly(tokenized.tokens).trim().toLowerCase();
                continuesStatement = endsWithContinuation(tail);
                afterAttribute = endsAttribute(tail);
            }
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
            continuesStatement = false;
            consecutiveBlanks++;
            if (consecutiveBlanks <= opts.maxBlankLines) {
                out[i].push("");
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
        const norm = classificationText(casedTokens);

        // Lookahead: the next line with code, for context-sensitive classification
        let nextNorm: string | null = null;
        for (let j = i + 1; j < lines.length; j++) {
            const t = lineText(j);
            if (t !== "") { nextNorm = t; break; }
        }

        // A continuation line is never the start of a statement, so it can only
        // open a multi-line lambda (e.g. "If(a, b, c)" here is the If operator).
        // Lines that can only start a statement (End If, Next, Else, ...) never
        // continue one: they also reset a paren count left open by unbalanced
        // code, so one bad line cannot shift the rest of the file. A comment-only
        // line ends a pending "_" or operator continuation, like a blank line.
        const startsStatement = STATEMENT_ONLY.test(norm);
        if (startsStatement) parenDepth = 0;
        const isContinuation = !startsStatement &&
            (parenDepth > 0 || (norm !== "" && continuesStatement && !afterAttribute));
        // A line can hold several statements separated by ":", e.g.
        // "Try : x = 1 : Catch : End Try". The line is drawn at the indent of its
        // first statement; every statement then updates the block state.
        const statements = isContinuation ? [norm] : splitStatements(norm);
        const head = statements[0] ?? "";
        // An If whose header continues on the next lines ("If a _" / "OrElse b Then x")
        // is single-line or a block depending on what follows its Then, so it
        // is classified on the whole statement.
        const headStatement = /^if\b/.test(head) && (endsWithContinuation(head) || countNetParens(casedTokens) > 0)
            ? joinContinuation(head, lineText, i + 1, lines.length)
            : head;
        const cls: LineClass = isContinuation
            ? (isLambdaOpener(norm) ? "lambda" : "none")
            : classifyLine(headStatement, nextNorm, innermostBlock(stack));

        // ── Pre-line dedent ──────────────────────────────────────────────────────
        const preDedent = (c: LineClass, statement: string): (StackEntry & { kind: "lambda" }) | null => {
            if (checkers) checkStatement(checkers, c, statement, i);
            switch (c) {
                case "closer": {
                    const top = stack.length > 0 ? stack[stack.length - 1] : null;
                    if (top?.kind === "lambda") {
                        stack.pop();
                        indentLevel = top.level - 1;
                        return top;
                    }
                    indentLevel = Math.max(0, indentLevel - 1);
                    for (let j = stack.length - 1; j >= 0; j--) {
                        if (stack[j].kind === "block") { stack.splice(j, 1); break; }
                    }
                    break;
                }
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
            return null;
        };
        const closedLambda = preDedent(cls, headStatement);

        // ── Emit line ────────────────────────────────────────────────────────────
        const continuationExtra = isContinuation ? 1 : 0;
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
        out[i].push(outputLine);

        // ── Track open parentheses for continuation-line indentation ─────────────
        if (closedLambda) {
            // Back in the enclosing statement, e.g. the ")" in "End Sub)"
            parenDepth = closedLambda.savedParenDepth;
            indentLevel = closedLambda.outerLevel;
        }
        parenDepth = Math.max(0, parenDepth + countNetParens(casedTokens));
        continuesStatement = norm !== "" && endsWithContinuation(norm);
        afterAttribute = norm !== "" && endsAttribute(norm);

        // ── Post-line indent ─────────────────────────────────────────────────────
        const postIndent = (c: LineClass, statement: string, extra: number) => {
            if (checkers) {
                const checker = stripAttributes(statement).startsWith("#") ? checkers.directives : checkers.code;
                if (c === "opener") {
                    const keyword = blockKeyword(statement);
                    if (keyword === "#if") checkers.branchStarts.push(checkers.code.snapshot());
                    checker.open(keyword, i);
                }
                else if (c === "lambda") checker.open("lambda_" + (lambdaKeyword(statement) ?? "sub"), i);
                else if (c === "select") checker.open("select", i);
            }
            switch (c) {
                case "opener":
                    stack.push({ kind: "block", keyword: blockKeyword(statement) });
                    indentLevel++;
                    break;
                case "lambda":
                    // The body indents one level past where the header was drawn
                    // (including any continuation indent); its parens start fresh.
                    stack.push({
                        kind: "lambda",
                        level: indentLevel + extra + 1,
                        outerLevel: indentLevel,
                        savedParenDepth: parenDepth,
                    });
                    indentLevel += extra + 1;
                    parenDepth = 0;
                    continuesStatement = false;
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
        };
        postIndent(cls, head, continuationExtra);

        // The other statements on the line ("... : Catch : End Try")
        for (const statement of statements.slice(1)) {
            const c = classifyLine(statement, nextNorm, innermostBlock(stack));
            const lambda = preDedent(c, statement);
            if (lambda) indentLevel = lambda.outerLevel;
            postIndent(c, statement, 0);
        }

        // ── Blank line after End Sub / End Function / End Property ───────────────
        const lastStatement = statements[statements.length - 1] ?? "";
        if (opts.blankLineAfterBlock && BLOCK_ENDERS.has(lastStatement) && !closedLambda) {
            const nextLine = lines[i + 1];
            if (nextLine !== undefined && nextLine.trim() !== "") {
                out[i].push("");
            }
        }
    }

    return out;
}

/** Reports what a closing or middle statement (End If, Else, Case, ...) does to the open blocks. */
function checkStatement(checkers: Checkers, c: LineClass, statement: string, line: number): void {
    const s = stripAttributes(statement).trim();
    const directive = s.startsWith("#");
    const checker = directive ? checkers.directives : checkers.code;
    const prefix = directive ? "#" : "";
    const words = s.match(/[a-z][a-z0-9_]*/g) ?? [];
    const name = statementName(statement);
    switch (c) {
        case "closer": {
            if (words[0] === "next") return checker.close(["for"], name, line);
            if (words[0] === "loop") return checker.close(["do"], name, line);
            if (directive && words[1] === "if") checkers.branchStarts.pop();
            // End Sub / End Function close a lambda of that kind too
            const keyword = prefix + (words[1] ?? "");
            const keywords = keyword === "sub" || keyword === "function" ? ["lambda_" + keyword, keyword] : [keyword];
            return checker.close(keywords, name, line);
        }
        case "end-select":
            return checker.close(["select"], name, line);
        case "case":
            return checker.middle(["select"], name, line);
        case "else":
            // #Else / #ElseIf: the code in this branch starts from the state at #If
            if (directive) {
                const start = checkers.branchStarts[checkers.branchStarts.length - 1];
                if (start) checkers.code.restore(start);
            }
            return checker.middle([prefix + "if"], name, line);
        case "catch":
        case "finally":
            return checker.middle(["try"], name, line);
    }
}

// ── Classifier ───────────────────────────────────────────────────────────────

// Modifiers that can appear before a block keyword,
// e.g. "Public Shared Function", "Protected Overrides Sub", "MustInherit Class"
const MODIFIERS = new Set([
    "public", "private", "protected", "friend", "shared", "static",
    "overrides", "overridable", "mustoverride", "notoverridable", "overloads",
    "mustinherit", "notinheritable", "shadows", "partial", "default",
    "readonly", "writeonly", "withevents", "async", "iterator",
    "widening", "narrowing",
]);
const BLOCK_OPENERS = new Set([
    "for", "while", "do", "sub", "function", "property", "get", "set",
    "with", "using", "synclock", "try", "class", "interface", "structure",
    "enum", "module", "namespace",
]);
// Members that have no body when declared MustOverride or inside an Interface
const MEMBER_KEYWORDS = new Set(["sub", "function", "property"]);

/**
 * Length of the attribute blocks at the start of a statement ("<A(x)> <B> "),
 * or 0. A block left open at the end of the line (a multi-line attribute)
 * is not counted, so that line still reads as an attribute line.
 */
function attributePrefixLength(text: string): number {
    let k = 0;
    while (text[k] === "<") {
        let depth = 0;
        let end = -1;
        for (let j = k + 1; j < text.length; j++) {
            const ch = text[j];
            if (ch === "(") depth++;
            else if (ch === ")") depth--;
            else if (ch === ">" && depth <= 0) { end = j; break; }
        }
        if (end < 0) return k;
        k = end + 1;
        while (text[k] === " " || text[k] === "\t") k++;
    }
    return k;
}

/** The statement without its leading attributes: "<Obsolete> Public Sub X()" → "Public Sub X()". */
function stripAttributes(text: string): string {
    return text.slice(attributePrefixLength(text));
}

/** The statement's keyword: its first word that isn't a modifier (e.g. "class" for "MustInherit Class A"). */
function blockKeyword(statement: string): string {
    const norm = stripAttributes(statement);
    if (norm.startsWith("#")) {
        const word = norm.match(/[a-z][a-z0-9_]*/)?.[0] ?? "";
        return "#" + word;
    }
    const words = norm.match(/[a-z][a-z0-9_]*/g) ?? [];
    return words.find((w) => !MODIFIERS.has(w)) ?? words[0] ?? "";
}

function innermostBlock(stack: StackEntry[]): string | null {
    for (let i = stack.length - 1; i >= 0; i--) {
        const entry = stack[i];
        if (entry.kind === "block") return entry.keyword;
    }
    return null;
}

/**
 * `container` is the keyword of the innermost open block (e.g. "interface"),
 * or null at file level. Needed because a member signature inside an
 * Interface looks exactly like the first line of a Sub/Function block.
 */
function classifyLine(statement: string, nextNorm: string | null = null, container: string | null = null): LineClass {
    // Attributes in front of a declaration don't change what it is
    const norm = stripAttributes(statement);
    // `norm` has every string literal blanked to "", so words inside strings
    // (e.g. "Do you want..." → "do") can never be read as keywords.
    // Extract identifier tokens, stripping parens/operators (e.g. "Set(value" → "set")
    const words: string[] = norm.match(/[a-z][a-z0-9_]*/g) ?? [];
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

    const effectiveKeyword = blockKeyword(norm);

    // "Sub(" / "Function(" with no name is a lambda, not a declaration
    if (isLambdaOpener(norm)) return "lambda";
    if (MEMBER_KEYWORDS.has(effectiveKeyword) && new RegExp("\\b" + effectiveKeyword + "\\s*\\(").test(norm)) return "none";

    if (BLOCK_OPENERS.has(effectiveKeyword)) {
        // Declarations without a body: MustOverride members, and member
        // signatures inside an Interface (nested types there still have a body).
        if (MEMBER_KEYWORDS.has(effectiveKeyword)) {
            if (container === "interface") return "none";
            if (words.slice(0, words.indexOf(effectiveKeyword)).includes("mustoverride")) return "none";
        }
        // Get/Set open a block only as property accessors ("Set(value As T)"),
        // not in a VBA-style assignment ("Set oTable = ...").
        if ((effectiveKeyword === "get" || effectiveKeyword === "set") &&
            !/^(?:(?:public|private|protected|friend)\s+)*(?:get|set)\s*(?:\(|$)/.test(norm)) return "none";
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

// Line endings after which VB continues the statement on the next line:
// explicit " _", and the implicit-continuation tokens (comma, open bracket,
// assignment/arithmetic/concatenation operators, logical keywords).
const CONTINUATION_END = /(?:(?:^|\s)_|[,({=&+\-*\/\\^]|\b(?:andalso|orelse|and|or|xor|not|is|isnot|like|mod))$/;

/**
 * The text the classifier reads: code only, strings blanked to "", lowercase,
 * and escaped identifiers ("[Property]", "[Date]") replaced by a plain name so
 * they are never taken for keywords.
 */
function classificationText(tokens: Token[]): string {
    return codeOnly(tokens).replace(/\[[^\]]*\]/g, "name").trim().toLowerCase();
}

/**
 * Joins a statement that continues onto the next lines (" _", trailing
 * operator or comma, open parenthesis) into one line of classification text.
 * Stops at a blank or comment-only line, and after 30 lines.
 */
function joinContinuation(first: string, lineText: (j: number) => string, from: number, count: number): string {
    let joined = first;
    let depth = netParens(first);
    let continues = endsWithContinuation(first);
    for (let j = from; j < count && j < from + 30 && (continues || depth > 0); j++) {
        const next = lineText(j);
        if (next === "") break;
        joined += " " + next;
        depth += netParens(next);
        continues = endsWithContinuation(next);
    }
    return joined;
}

function netParens(text: string): number {
    let depth = 0;
    for (const ch of text) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
    }
    return depth;
}

/**
 * Splits a line (strings blanked, comment removed) into its ":"-separated
 * statements. Colons inside parentheses (named arguments ":="), in date
 * literals (#12:00#) and in directives are not separators. An If statement
 * takes the rest of the line: "If x Then a : b" is one single-line If.
 */
function splitStatements(norm: string): string[] {
    if (norm.startsWith("#")) return norm === "" ? [] : [norm];
    const statements: string[] = [];
    let depth = 0;
    let inDate = false;
    let start = 0;
    // Not inside leading attributes: "<Assembly: AssemblyTitle(...)>" is one statement
    for (let k = attributePrefixLength(norm); k < norm.length; k++) {
        const ch = norm[k];
        // "#" opens a date literal unless it is a type character ("x#")
        if (ch === "#" && (inDate || !/\w/.test(norm[k - 1] ?? ""))) inDate = !inDate;
        else if (inDate) continue;
        else if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === ":" && depth <= 0 && norm[k + 1] !== "=") {
            const statement = norm.slice(start, k).trim();
            if (/^if\b/.test(statement)) break;
            statements.push(statement);
            start = k + 1;
        }
    }
    statements.push(norm.slice(start).trim());
    return statements.filter((st) => st !== "");
}

// Keywords that can only begin a statement, never continue one
const STATEMENT_ONLY = new RegExp("^(?:" + [
    "end\\s+(?:if|sub|function|property|get|set|class|interface|structure|enum|module|namespace|with|using|synclock|try|while|select)\\b",
    "(?:next|loop|else|elseif|case|catch|finally|dim|for|return|try|do|while|using|throw|exit)\\b",
    "select\\s+case\\b",
    "if\\b.*\\bthen\\b", // an If statement; the If() operator never has Then
].join("|") + ")");

function endsWithContinuation(norm: string): boolean {
    return CONTINUATION_END.test(norm.trimEnd());
}

/** The line closes an attribute ("<Attr()>" or "<Attr()> _"), so the next line starts the statement. */
function endsAttribute(norm: string): boolean {
    return /^<.*>\s*(_)?$/.test(norm.trim()) || /[^<>=]>\s*_$/.test(norm.trim());
}

/**
 * The line opens a multi-line lambda: a `Sub(...)` or `Function(...)` whose
 * parameter list (and optional "As Type") ends the line, so the body follows.
 */
/** "sub" or "function" for the lambda a line opens, or null. */
function lambdaKeyword(norm: string): string | null {
    if (!isLambdaOpener(norm)) return null;
    const headers = [...norm.matchAll(/\b(sub|function)\s*\(/g)];
    return headers.length > 0 ? headers[headers.length - 1][1] : null;
}

function isLambdaOpener(norm: string): boolean {
    const header = /\b(?:sub|function)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = header.exec(norm)) !== null) {
        let depth = 0;
        let close = -1;
        for (let k = m.index + m[0].length - 1; k < norm.length; k++) {
            if (norm[k] === "(") depth++;
            else if (norm[k] === ")" && --depth === 0) { close = k; break; }
        }
        if (close < 0) return false;
        const rest = norm.slice(close + 1);
        if (/^\s*(?:as\s+[a-z_][\w.]*(?:\s*\(\s*of\b[^)]*\))?)?\s*(?:_)?\s*$/.test(rest)) return true;
    }
    return false;
}

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
    // Escaped identifiers ("[property]") are names, not keywords: left as written
    const text = token.text.replace(/\[[^\]]*\]|\b([A-Za-z][A-Za-z0-9_]*)\b/g, (match, word) => {
        return word ? VB_KEYWORDS[word.toLowerCase()] ?? match : match;
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
