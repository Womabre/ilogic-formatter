// Document structure for folding and the outline, built on the formatter's
// block pairing (analyzeBlocks), so folding follows the same blocks that
// formatting indents and that block warnings check.

import { analyzeBlocks } from "./formatter";
import { ScannedLine, scanLines } from "./tokenizer";

export interface FoldRange {
    start: number;
    end: number;
    kind?: "comment" | "region" | "imports";
}

export type SymbolKind =
    | "class" | "module" | "struct" | "interface" | "enum" | "namespace"
    | "method" | "function" | "constructor" | "property" | "event" | "operator";

export interface OutlineSymbol {
    name: string;
    kind: SymbolKind;
    /** Parameters and return type, e.g. "(x As Double) As Integer" */
    detail: string;
    start: number;
    end: number;
    /** The declaration line (where the name is) */
    nameLine: number;
    nameStart: number;
    children: OutlineSymbol[];
}

/** Folding: blocks (split at Else/Case/Catch), #Region, comment runs and Imports runs. */
export function foldingRanges(text: string): FoldRange[] {
    const lines = scanLines(text);
    const ranges: FoldRange[] = [];

    // Blocks keep their closing line visible, like indentation-based folding:
    // "If x Then ..." / "Else ..." / "End If"
    for (const span of analyzeBlocks(text).spans) {
        const bounds = [span.start, ...span.middles.map((middle) => middle.line), span.end];
        for (let k = 0; k + 1 < bounds.length; k++) {
            if (bounds[k + 1] - 1 > bounds[k]) ranges.push({ start: bounds[k], end: bounds[k + 1] - 1 });
        }
        // Select Case: the first section is empty, so also fold the whole block
        if (bounds.length > 2 && bounds[1] - 1 <= bounds[0] && span.end - 1 > span.start) {
            ranges.push({ start: span.start, end: span.end - 1 });
        }
    }

    // #Region ... #End Region folds including its end marker
    const regions: number[] = [];
    lines.forEach((l, i) => {
        if (/^#region\b/i.test(l.code)) regions.push(i);
        else if (/^#end\s+region\b/i.test(l.code) && regions.length > 0) {
            ranges.push({ start: regions.pop()!, end: i, kind: "region" });
        }
    });

    // Runs of 2+ comment-only lines, and of 2+ Imports lines
    const runs = (test: (l: ScannedLine) => boolean, kind: FoldRange["kind"]) => {
        let start = -1;
        lines.forEach((l, i) => {
            if (test(l)) {
                if (start < 0) start = i;
            } else {
                if (start >= 0 && i - 1 > start) ranges.push({ start, end: i - 1, kind });
                start = -1;
            }
        });
        if (start >= 0 && lines.length - 1 > start) ranges.push({ start, end: lines.length - 1, kind });
    };
    runs((l) => l.commentOnly, "comment");
    runs((l) => /^imports\b/i.test(l.code), "imports");

    return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

const MODIFIERS = "Public|Private|Protected|Friend|Shared|Static|Overrides|Overridable|MustOverride|NotOverridable|" +
    "Overloads|MustInherit|NotInheritable|Shadows|Partial|Default|ReadOnly|WriteOnly|Async|Iterator|Widening|Narrowing|Custom";
const DECLARATION = new RegExp(
    "^(?:<[^>]*>\\s*)*(?:(?:" + MODIFIERS + ")\\s+)*" +
    "(Class|Module|Structure|Interface|Enum|Namespace|Sub|Function|Property|Event|Operator|" +
    "Delegate\\s+(?:Sub|Function)|Declare\\s+(?:(?:Ansi|Unicode|Auto)\\s+)?(?:Sub|Function))" +
    "\\s+(\\[[^\\]]+\\]|[A-Za-z_][\\w.]*|[^\\s(]+)(.*)$",
    "i"
);
const CONTAINERS = new Set(["class", "module", "struct", "interface"]);

/** Column of the declared name: the word right after the keyword, not an earlier match ("F" in "Function F"). */
function nameColumn(line: ScannedLine, keyword: string, name: string): number {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // `masked` blanks string and comment contents at the same length, so columns stay put
    const m = new RegExp("\\b" + keyword + "\\s+(" + escaped + ")", "i").exec(line.masked);
    return m ? m.index + m[0].length - m[1].length : Math.max(0, line.raw.indexOf(name));
}

/** Outline: declarations nested by containment (Class > Sub, Namespace > Class, ...). */
export function outline(text: string): OutlineSymbol[] {
    const lines = scanLines(text);
    const spans = analyzeBlocks(text).spans;
    const flat: OutlineSymbol[] = [];

    lines.forEach((l, i) => {
        // On a line that starts inside a string, `code` is what follows the
        // closing quote: the declaration, if any, comes after the ":" there
        const code = l.startsInString ? l.code.replace(/^(?::\s*)+/, "") : l.code;
        if (code === "") return;
        const m = DECLARATION.exec(code);
        if (!m) return;
        const word = m[1].toLowerCase().split(/\s+/);
        const keyword = word[word.length - 1]; // "delegate sub" -> "sub"
        const name = m[2];
        // The matching block, if this declaration has a body
        const span = spans.find((s) => s.start === i && (s.keyword === keyword || s.keyword === "lambda_" + keyword));
        const kind: SymbolKind =
            keyword === "class" ? "class" : keyword === "module" ? "module" : keyword === "structure" ? "struct" :
            keyword === "interface" ? "interface" : keyword === "enum" ? "enum" : keyword === "namespace" ? "namespace" :
            keyword === "property" ? "property" : keyword === "event" ? "event" : keyword === "operator" ? "operator" :
            "function";
        flat.push({
            name,
            kind,
            detail: m[3].trim().replace(/\s*_$/, "").slice(0, 80),
            start: i,
            end: span ? span.end : i,
            nameLine: i,
            nameStart: nameColumn(l, keyword, name),
            children: [],
        });
    });

    // Nest by containment; Sub/Function inside a type is a method (or constructor)
    const roots: OutlineSymbol[] = [];
    const stack: OutlineSymbol[] = [];
    for (const symbol of flat) {
        while (stack.length > 0 && stack[stack.length - 1].end < symbol.start) stack.pop();
        const parent = stack[stack.length - 1];
        if (symbol.kind === "function" && parent && CONTAINERS.has(parent.kind)) {
            symbol.kind = /^new$/i.test(symbol.name) ? "constructor" : "method";
        }
        (parent ? parent.children : roots).push(symbol);
        if (symbol.end > symbol.start) stack.push(symbol);
    }
    return roots;
}

