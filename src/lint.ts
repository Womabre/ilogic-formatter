// Convention checks for iLogic rules (.iLogicVb), following the iLogic coding
// standard: no string interpolation, no empty Catch, Logger instead of MsgBox
// for notifications, Option Strict On, and two compile errors that look fine:
// If(ThisApplication, ThisServer) and short BCL names that Inventor also uses.

import { analyzeBlocks } from "./formatter";
import { ScannedLine, scanLines } from "./tokenizer";

export const LINT_RULES = ["interpolation", "empty-catch", "msgbox", "option-strict", "thisserver-fallback", "ambiguous-name"] as const;
export type LintRule = (typeof LINT_RULES)[number];

export interface LintOptions {
    /** A Catch that holds only a comment (saying why nothing is done) is not reported as empty. */
    allowCommentedCatch?: boolean;
}

export interface LintProblem {
    rule: LintRule;
    severity: "warning" | "information";
    line: number;
    start: number;
    end: number;
    message: string;
}

/** A scanned line plus its code in lowercase, which every check here matches against. */
interface Line extends ScannedLine {
    readonly lower: string;
}

function lines(text: string): Line[] {
    return scanLines(text).map((l) => ({ ...l, lower: l.code.toLowerCase() }));
}

export function lint(text: string, disabled: readonly LintRule[] = [], options: LintOptions = {}): LintProblem[] {
    const all = lines(text);
    const problems: LintProblem[] = [];
    const on = (rule: LintRule) => !disabled.includes(rule);

    all.forEach((l, i) => {
        // $"..." strings
        if (on("interpolation")) {
            let column = 0;
            for (const [k, token] of l.tokens.entries()) {
                // The string continued from the line above was reported where it opened
                if (token.kind === "string" && token.text.startsWith("$") && !(k === 0 && l.startsInString)) {
                    problems.push({
                        rule: "interpolation", severity: "warning", line: i, start: column, end: column + token.text.length,
                        message: "iLogic does not support string interpolation ($\"...\"); join with & instead.",
                    });
                }
                column += token.text.length;
            }
        }
        // `masked` has strings and the comment blanked at the same length, so columns stay put
        const masked = l.masked;
        if (on("thisserver-fallback") || on("ambiguous-name")) {
            if (on("thisserver-fallback")) {
                for (const span of ifCalls(masked)) {
                    const inside = masked.slice(span.start, span.end).toLowerCase();
                    if (/\bthisapplication\b/.test(inside) && /\bthisserver\b/.test(inside)) {
                        problems.push({
                            rule: "thisserver-fallback", severity: "warning", line: i, start: span.start, end: span.end,
                            message: "ThisServer is not an Inventor.Application, so If() finds no common type and the rule does not compile. Check both for Nothing: If ThisApplication Is Nothing AndAlso ThisServer Is Nothing Then ...",
                        });
                    }
                }
            }
            if (on("ambiguous-name")) {
                const name = /(?<![.\w])(file|environment)\s*\./gi;
                let m: RegExpExecArray | null;
                while ((m = name.exec(masked)) !== null) {
                    const word = m[1];
                    const full = word.toLowerCase() === "file" ? "System.IO.File" : "System.Environment";
                    problems.push({
                        rule: "ambiguous-name", severity: "warning", line: i, start: m.index, end: m.index + word.length,
                        message: `Inventor also has a type called ${word}, so iLogic reports it as ambiguous or misses the member. Write ${full} in full.`,
                    });
                }
            }
        }
        // MsgBox / MessageBox.Show as a statement: a notification, not a decision.
        // A statement starts the line, or follows ":", Then or Else.
        if (on("msgbox")) {
            const call = /(?:^|:|\b(?:then|else)\s)\s*(?:call\s+)?(msgbox|messagebox\.show)\s*\(/gi;
            let m: RegExpExecArray | null;
            while ((m = call.exec(masked)) !== null) {
                const start = m.index + m[0].toLowerCase().lastIndexOf(m[1].toLowerCase());
                problems.push({
                    rule: "msgbox", severity: "information", line: i, start, end: start + m[1].length,
                    message: "Use Logger (Info, Warn, Error, ...) for messages; keep message boxes for decisions the user must make.",
                });
            }
        }
    });

    // Catch with nothing in it: block analysis knows each section's kind and whether it holds code
    if (on("empty-catch")) {
        for (const span of analyzeBlocks(text).spans.filter((s) => s.keyword === "try")) {
            span.middles.forEach((middle, k) => {
                if (middle.kind !== "catch" || !middle.empty) return;
                const next = span.middles[k + 1]?.line ?? span.end;
                if (options.allowCommentedCatch && all.slice(middle.line, Math.max(next, middle.line + 1)).some((l) => l.hasComment)) return;
                // The nth Catch of this block on its line ("Try : a : Catch : b : Catch e As E : End Try"),
                // found in the masked line, so a "catch" in a string or comment, a member
                // or an escaped name (x.[Catch]()) is never taken
                const nth = span.middles.slice(0, k).filter((m) => m.kind === "catch" && m.line === middle.line).length;
                const found = [...all[middle.line].masked.matchAll(/(?<![.\[])\bcatch\b/gi)];
                const start = (found[nth] ?? found[0])?.index ?? 0;
                problems.push({
                    rule: "empty-catch", severity: "warning", line: middle.line, start, end: start + 5,
                    message: "This Catch discards the exception. Log it, e.g. Logger.Error(\"...: \" & ex.Message).",
                });
            });
        }
    }

    // Option Strict On
    if (on("option-strict") && all.some((l) => l.code !== "") && !all.some((l) => /^option\s+strict\s+on\b/.test(l.lower))) {
        problems.push({
            rule: "option-strict", severity: "information", line: 0, start: 0, end: all[0].raw.length,
            message: "Option Strict On is not set; it catches type mistakes at compile time.",
        });
    }
    return problems.sort((a, b) => a.line - b.line || a.start - b.start);
}

/** Spans of If(...) operator calls on a masked line, from "If" to the closing parenthesis. An If
 *  statement ("If (a) Then", also after ":", Then, Else or #) is not an operator and is skipped. */
function ifCalls(masked: string): { start: number; end: number }[] {
    const spans: { start: number; end: number }[] = [];
    const open = /\bif\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = open.exec(masked)) !== null) {
        const before = masked.slice(0, m.index).trimEnd();
        if (before === "" || /(:|#|\b(then|else))$/i.test(before)) continue;
        let depth = 0;
        for (let j = m.index + m[0].length - 1; j < masked.length; j++) {
            if (masked[j] === "(") depth++;
            else if (masked[j] === ")" && --depth === 0) {
                spans.push({ start: m.index, end: j + 1 });
                break;
            }
        }
    }
    return spans;
}
