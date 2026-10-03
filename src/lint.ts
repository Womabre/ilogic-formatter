// Convention checks for iLogic rules (.iLogicVb), following the iLogic coding
// standard: no string interpolation, no empty Catch, Logger instead of MsgBox
// for notifications, Option Strict On.

import { analyzeBlocks, splitStatements } from "./formatter";
import { codeOnly, INITIAL_STATE, LineState, Token, tokenizeLine } from "./tokenizer";

export type LintRule = "interpolation" | "empty-catch" | "msgbox" | "option-strict";

export interface LintProblem {
    rule: LintRule;
    severity: "warning" | "information";
    line: number;
    start: number;
    end: number;
    message: string;
}

interface Line {
    raw: string;
    tokens: Token[];
    /** code with strings blanked to "" and no comment, lowercase, trimmed */
    code: string;
    inString: boolean;
}

function lines(text: string): Line[] {
    let state: LineState = INITIAL_STATE;
    return text.split(/\r?\n/).map((raw) => {
        const inString = state.openString !== null;
        const tokenized = tokenizeLine(raw, state);
        state = tokenized.endState;
        return { raw, tokens: tokenized.tokens, code: inString ? "" : codeOnly(tokenized.tokens).trim().toLowerCase(), inString };
    });
}

export function lint(text: string, disabled: LintRule[] = []): LintProblem[] {
    const all = lines(text);
    const problems: LintProblem[] = [];
    const on = (rule: LintRule) => !disabled.includes(rule);

    all.forEach((l, i) => {
        // $"..." strings
        if (on("interpolation") && !l.inString) {
            let column = 0;
            for (const token of l.tokens) {
                if (token.kind === "string" && token.text.startsWith("$")) {
                    problems.push({
                        rule: "interpolation", severity: "warning", line: i, start: column, end: column + token.text.length,
                        message: "iLogic does not support string interpolation ($\"...\"); join with & instead.",
                    });
                }
                column += token.text.length;
            }
        }
        // MsgBox / MessageBox.Show as a statement: a notification, not a decision
        if (on("msgbox")) {
            const m = /^(\s*)(?:call\s+)?(msgbox|messagebox\.show)\s*\(/i.exec(codeOnly(l.tokens));
            if (m && !l.inString) {
                const start = l.raw.toLowerCase().indexOf(m[2].toLowerCase());
                problems.push({
                    rule: "msgbox", severity: "information", line: i, start, end: start + m[2].length,
                    message: "Use Logger (Info, Warn, Error, ...) for messages; keep message boxes for decisions the user must make.",
                });
            }
        }
    });

    // Catch with nothing in it
    if (on("empty-catch")) {
        for (const span of analyzeBlocks(text).spans.filter((s) => s.keyword === "try")) {
            const bounds = [...span.middles, span.end];
            for (let k = 0; k < span.middles.length; k++) {
                const catchLine = span.middles[k];
                if (!/^catch\b/.test(lastStatementStarting(all[catchLine].code, "catch"))) continue;
                const next = bounds[k + 1];
                if (!catchIsEmpty(all, catchLine, next)) continue;
                const start = all[catchLine].raw.toLowerCase().indexOf("catch");
                problems.push({
                    rule: "empty-catch", severity: "warning", line: catchLine, start, end: start + 5,
                    message: "This Catch discards the exception. Log it, e.g. Logger.Error(\"...: \" & ex.Message).",
                });
            }
        }
    }

    // Option Strict On
    if (on("option-strict") && all.some((l) => l.code !== "") && !all.some((l) => /^option\s+strict\s+on\b/.test(l.code))) {
        problems.push({
            rule: "option-strict", severity: "information", line: 0, start: 0, end: all[0].raw.length,
            message: "Option Strict On is not set; it catches type mistakes at compile time.",
        });
    }
    return problems.sort((a, b) => a.line - b.line || a.start - b.start);
}

/** The ":"-separated statement on the line that starts with `word` (or ""). */
function lastStatementStarting(code: string, word: string): string {
    return splitStatements(code).find((s) => s.startsWith(word)) ?? "";
}

/** Nothing runs between this Catch and the next Catch/Finally/End Try. */
function catchIsEmpty(all: Line[], catchLine: number, nextBound: number): boolean {
    // Statements after the Catch on its own line ("Catch : x = 0 : End Try")
    const statements = splitStatements(all[catchLine].code);
    const after = statements.slice(statements.findIndex((s) => s.startsWith("catch")) + 1);
    const ownLine = after.filter((s) => !/^(catch|finally|end\s+try)\b/.test(s));
    if (ownLine.length > 0) return false;
    if (nextBound === catchLine) return true;
    for (let j = catchLine + 1; j < nextBound; j++) if (all[j].code !== "") return false;
    // The closing line itself may start with statements ("x = 1 : End Try" is rare but valid)
    const closing = splitStatements(all[nextBound].code);
    return closing.length <= 1 || /^(catch|finally|end\s+try)\b/.test(closing[0]);
}
