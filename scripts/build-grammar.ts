// Writes syntaxes/ilogicvb.tmLanguage.json. Keyword lists come from
// src/keywords.ts so highlighting and keyword casing cannot drift apart.
// Run: bun run grammar   (test/grammar.test.ts fails when the file is stale)
import { writeFileSync } from "fs";
import { join } from "path";
import { ILOGIC_OBJECTS } from "../src/ilogicApi";
import { KEYWORD_GROUPS } from "../src/keywords";

// VB reads the curly and fullwidth quotes as string delimiters too
const QUOTE = '["\u201C\u201D\uFF02]';

// A quote ends the string unless it is the first of a doubled quote (an escape).
// TextMate tries the end before the patterns inside, so the end itself must refuse it.
const STRING_END = QUOTE + "(?!" + QUOTE + ")";

export const GRAMMAR_PATH = join(import.meta.dir, "..", "syntaxes", "ilogicvb.tmLanguage.json");

export function buildGrammar(): object {
    return {
        $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
        name: "iLogic VB",
        scopeName: "source.ilogicvb",
        fileTypes: ["iLogicVb"],
        patterns: [
            { include: "#comments" },
            { include: "#directives" },
            { include: "#interpolated" },
            { include: "#strings" },
            { include: "#ilogic" },
            { include: "#keywords" },
            { include: "#numbers" },
            { include: "#operators" },
        ],
        repository: {
            // Apostrophe comments (the curly and fullwidth apostrophes start one
            // too, as in the tokenizer), and REM at the start of a statement
            comments: {
                patterns: [
                    { name: "comment.line.apostrophe.ilogicvb", match: "['\u2018\u2019\uFF07].*$" },
                    { name: "comment.line.rem.ilogicvb", match: "(?i)(?:^|(?<=:))\\s*REM(?=\\s|$).*$" },
                ],
            },
            // #If / #Region / #Const ...: the directive word; the rest of the line is ordinary code
            directives: {
                name: "keyword.control.directive.ilogicvb",
                match: "(?i)^\\s*#\\s*(?:End\\s+(?:If|Region|ExternalSource)|ElseIf|If|Else|Region|Const|ExternalSource|Disable|Enable)\\b",
            },
            strings: {
                name: "string.quoted.double.ilogicvb",
                begin: QUOTE,
                end: STRING_END,
                patterns: [{ name: "constant.character.escape.ilogicvb", match: QUOTE + QUOTE }],
            },
            // $"...{expression}...": the holes are code again
            interpolated: {
                name: "string.quoted.double.interpolated.ilogicvb",
                begin: "\\$" + QUOTE,
                end: STRING_END,
                patterns: [
                    { name: "constant.character.escape.ilogicvb", match: QUOTE + QUOTE + "|\\{\\{|\\}\\}" },
                    {
                        name: "meta.interpolation.ilogicvb",
                        begin: "\\{",
                        end: "\\}",
                        beginCaptures: { 0: { name: "punctuation.section.interpolation.begin.ilogicvb" } },
                        endCaptures: { 0: { name: "punctuation.section.interpolation.end.ilogicvb" } },
                        patterns: [{ include: "$self" }],
                    },
                ],
            },
            // Predefined iLogic objects (ThisDoc, Logger, ...): as written, not after a "."
            ilogic: {
                name: "support.class.ilogicvb",
                match: "(?<![\\w.])(" + ILOGIC_OBJECTS.map((o) => o.name).sort((a, b) => b.length - a.length).join("|") + ")\\b",
            },
            keywords: {
                patterns: KEYWORD_GROUPS.map((group) => ({
                    name: group.scope,
                    // Longest first, so "OrElse" is tried before "Or"
                    match: "(?i)\\b(" + [...group.words].sort((a, b) => b.length - a.length).join("|") + ")\\b",
                })),
            },
            // &HFF, &O17, &B1010, then decimals; each with an optional type suffix
            numbers: {
                patterns: [
                    { name: "constant.numeric.hex.ilogicvb", match: "(?i)&H[0-9A-F_]+(?:US|UI|UL|[SIL])?\\b" },
                    { name: "constant.numeric.octal.ilogicvb", match: "(?i)&O[0-7_]+(?:US|UI|UL|[SIL])?\\b" },
                    { name: "constant.numeric.binary.ilogicvb", match: "(?i)&B[01_]+(?:US|UI|UL|[SIL])?\\b" },
                    { name: "constant.numeric.ilogicvb", match: "(?i)\\b\\d[\\d_]*(\\.\\d+)?(E[+-]?\\d+)?(?:US|UI|UL|[SILDFR])?\\b" },
                ],
            },
            operators: {
                name: "keyword.operator.ilogicvb",
                match: "\\+|-|\\*|\\/|\\\\|\\^|&|=|<>|<=|>=|<|>|\\.",
            },
        },
    };
}

export function grammarText(): string {
    return JSON.stringify(buildGrammar(), null, 2) + "\n";
}

if (import.meta.main) {
    writeFileSync(GRAMMAR_PATH, grammarText());
    console.log("wrote " + GRAMMAR_PATH);
}
