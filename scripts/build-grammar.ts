// Writes syntaxes/ilogicvb.tmLanguage.json. Keyword lists come from
// src/keywords.ts so highlighting and keyword casing cannot drift apart.
// Run: bun run grammar   (test/grammar.test.ts fails when the file is stale)
import { writeFileSync } from "fs";
import { join } from "path";
import { ILOGIC_OBJECTS } from "../src/ilogicApi";
import { KEYWORD_GROUPS } from "../src/keywords";

export const GRAMMAR_PATH = join(import.meta.dir, "..", "syntaxes", "ilogicvb.tmLanguage.json");

export function buildGrammar(): object {
    return {
        $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
        name: "iLogic VB",
        scopeName: "source.ilogicvb",
        fileTypes: ["iLogicVb"],
        patterns: [
            { include: "#comments" },
            { include: "#strings" },
            { include: "#ilogic" },
            { include: "#keywords" },
            { include: "#numbers" },
            { include: "#operators" },
        ],
        repository: {
            comments: {
                patterns: [{ name: "comment.line.apostrophe.ilogicvb", match: "'.*$" }],
            },
            strings: {
                name: "string.quoted.double.ilogicvb",
                begin: '"',
                end: '"',
                patterns: [{ name: "constant.character.escape.ilogicvb", match: '""' }],
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
            numbers: {
                name: "constant.numeric.ilogicvb",
                match: "\\b\\d+(\\.\\d+)?([eE][+-]?\\d+)?\\b",
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
