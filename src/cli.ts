#!/usr/bin/env node
// ilogic-format: the iLogic Formatter outside VS Code (CI, pre-commit hooks,
// bulk formatting). Wraps the same format/checkBlocks/lint the extension uses.
// Run with: bun src/cli.ts ...   or   node out/cli.js ...

import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { checkBlocks, format, FormatOptions } from "./formatter";
import { lint } from "./lint";

const HELP = `ilogic-format [options] <file | directory>...

Formats Autodesk Inventor iLogic rules. Directories are searched (recursively)
for *.iLogicVb files; add --include-vb to also pick up *.vb files.

Modes (default: print the formatted rule to stdout; one file only)
  --check            List files that are not formatted; exit 1 if any
  --write            Format files in place (keeps CRLF line endings and BOM)
  --lint             Report unbalanced blocks and iLogic convention hints; exit 1 if any
  --stdin            Read a rule from stdin and print it formatted

Output
  --json             Machine-readable results on stdout

Formatting
  --indent-size N    Spaces per indent level (default 4)
  --use-tabs         Indent with tabs
  --max-blank-lines N  Consecutive blank lines kept (default 1)
  --no-blank-line-after-block   No blank line after End Sub / Function / Property
  --no-normalize-keywords       Keep keyword casing as written
  --no-normalize-comments       Keep comments as written
  --no-normalize-unicode        Keep lookalike characters in code

Other
  --include-vb       Also format *.vb files found in directories
  -h, --help         Show this help
  -v, --version      Show the version

Exit codes: 0 all good, 1 --check or --lint found something, 2 usage or file error.

Examples
  ilogic-format "My Rule.iLogicVb"                 print formatted
  ilogic-format --write rules/                     format a folder in place
  ilogic-format --check --lint rules/ --json       CI: report, fail on findings
`;

interface Args {
    paths: string[];
    check: boolean;
    write: boolean;
    lint: boolean;
    stdin: boolean;
    json: boolean;
    includeVb: boolean;
    options: FormatOptions;
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Args | "help" | "version" {
    const args: Args = { paths: [], check: false, write: false, lint: false, stdin: false, json: false, includeVb: false, options: {} };
    const number = (flag: string, value: string | undefined, min: number): number => {
        const n = Number(value);
        if (value === undefined || !Number.isInteger(n) || n < min) throw new UsageError(`${flag} needs a whole number of at least ${min}`);
        return n;
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case "-h": case "--help": return "help";
            case "-v": case "--version": return "version";
            case "--check": args.check = true; break;
            case "--write": args.write = true; break;
            case "--lint": args.lint = true; break;
            case "--stdin": args.stdin = true; break;
            case "--json": args.json = true; break;
            case "--include-vb": args.includeVb = true; break;
            case "--use-tabs": args.options.useTabs = true; break;
            case "--indent-size": args.options.indentSize = number(a, argv[++i], 1); break;
            case "--max-blank-lines": args.options.maxBlankLines = number(a, argv[++i], 0); break;
            case "--no-blank-line-after-block": args.options.blankLineAfterBlock = false; break;
            case "--no-normalize-keywords": args.options.normalizeKeywords = false; break;
            case "--no-normalize-comments": args.options.normalizeComments = false; break;
            case "--no-normalize-unicode": args.options.normalizeUnicode = false; break;
            default:
                if (a.startsWith("-")) throw new UsageError(`Unknown option ${a} (see --help)`);
                args.paths.push(a);
        }
    }
    if (args.stdin && args.paths.length > 0) throw new UsageError("--stdin does not take file arguments");
    if (!args.stdin && args.paths.length === 0) throw new UsageError("No files given (see --help)");
    if (args.stdin && (args.write || args.check)) throw new UsageError("--stdin cannot be combined with --write or --check");
    return args;
}

/** Files to process: explicit files as given, directories searched for rules. */
function collectFiles(paths: string[], includeVb: boolean): string[] {
    const pattern = includeVb ? /\.(ilogicvb|vb)$/i : /\.ilogicvb$/i;
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (pattern.test(entry.name)) files.push(full);
        }
    };
    for (const p of paths) {
        if (statSync(p).isDirectory()) walk(p);
        else files.push(p);
    }
    return [...new Set(files)].sort();
}

/** Formats a file's text, keeping its BOM and dominant line ending. */
function formatFileText(raw: string, options: FormatOptions): { text: string; changed: boolean } {
    const bom = raw.startsWith("﻿") ? "﻿" : "";
    const body = bom ? raw.slice(1) : raw;
    const crlf = (body.match(/\r\n/g) ?? []).length > (body.match(/(?<!\r)\n/g) ?? []).length;
    const formatted = format(body, options);
    const text = bom + (crlf ? formatted.replace(/\n/g, "\r\n") : formatted);
    return { text, changed: text !== raw };
}

interface Finding {
    line: number;
    severity: "warning" | "information";
    rule: string;
    message: string;
}

function findings(raw: string, path: string, options: FormatOptions): Finding[] {
    const text = raw.replace(/^﻿/, "");
    const blocks: Finding[] = checkBlocks(text, options).map((p) => ({ line: p.line + 1, severity: "warning", rule: "blocks", message: p.message }));
    const hints: Finding[] = /\.ilogicvb$/i.test(path) || path === "<stdin>"
        ? lint(text).map((p) => ({ line: p.line + 1, severity: p.severity, rule: p.rule, message: p.message }))
        : []; // convention hints are for iLogic rules; $"..." is valid in ordinary VB.NET
    return [...blocks, ...hints].sort((a, b) => a.line - b.line);
}

function main(argv: string[]): number {
    let args: Args | "help" | "version";
    try {
        args = parseArgs(argv);
    } catch (e) {
        if (e instanceof UsageError) {
            process.stderr.write(`ilogic-format: ${e.message}\n`);
            return 2;
        }
        throw e;
    }
    if (args === "help") {
        process.stdout.write(HELP);
        return 0;
    }
    if (args === "version") {
        const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
        process.stdout.write(`${pkg.version}\n`);
        return 0;
    }

    if (args.stdin) {
        const raw = readFileSync(0, "utf8");
        const found = args.lint ? findings(raw, "<stdin>", args.options) : [];
        if (args.json) process.stdout.write(JSON.stringify({ formatted: formatFileText(raw, args.options).text, findings: found }, null, 2) + "\n");
        else if (args.lint) printFindings("<stdin>", found);
        else process.stdout.write(formatFileText(raw, args.options).text);
        return found.length > 0 ? 1 : 0;
    }

    let files: string[];
    try {
        files = collectFiles(args.paths, args.includeVb);
    } catch (e) {
        process.stderr.write(`ilogic-format: ${(e as Error).message}\n`);
        return 2;
    }
    const printMode = !args.check && !args.write && !args.lint;
    if (printMode && files.length !== 1) {
        process.stderr.write("ilogic-format: printing works on one file; use --write or --check for several\n");
        return 2;
    }

    let failed = false;
    let ioError = false;
    const results: { path: string; changed?: boolean; written?: boolean; findings?: Finding[]; error?: string }[] = [];
    for (const path of files) {
        let raw: string;
        try {
            raw = readFileSync(path, "utf8");
        } catch (e) {
            ioError = true;
            results.push({ path, error: (e as Error).message });
            if (!args.json) process.stderr.write(`ilogic-format: ${path}: ${(e as Error).message}\n`);
            continue;
        }
        const { text, changed } = formatFileText(raw, args.options);
        const result: (typeof results)[number] = { path };
        if (printMode) {
            if (!args.json) process.stdout.write(text);
            result.changed = changed;
        }
        if (args.check) {
            result.changed = changed;
            if (changed) {
                failed = true;
                if (!args.json) process.stdout.write(`not formatted: ${path}\n`);
            }
        }
        if (args.write && changed) {
            try {
                writeFileSync(path, text);
            } catch (e) {
                ioError = true;
                result.error = (e as Error).message;
                results.push(result);
                if (!args.json) process.stderr.write(`ilogic-format: ${path}: ${(e as Error).message}\n`);
                continue;
            }
            result.written = true;
            if (!args.json) process.stdout.write(`formatted: ${path}\n`);
        }
        if (args.lint) {
            // After --write, report on the written text
            result.findings = findings(args.write ? text : raw, path, args.options);
            if (result.findings.length > 0) failed = true;
            if (!args.json) printFindings(path, result.findings);
        }
        results.push(result);
    }
    if (args.json) {
        const summary = {
            files: results.length,
            notFormatted: results.filter((r) => r.changed && !r.written).length,
            written: results.filter((r) => r.written).length,
            findings: results.reduce((n, r) => n + (r.findings?.length ?? 0), 0),
            errors: results.filter((r) => r.error).length,
        };
        process.stdout.write(JSON.stringify({ results, summary }, null, 2) + "\n");
    }
    return ioError ? 2 : failed ? 1 : 0;
}

function printFindings(path: string, found: Finding[]) {
    for (const f of found) process.stdout.write(`${path}:${f.line}: ${f.severity} [${f.rule}] ${f.message}\n`);
}

process.exitCode = main(process.argv.slice(2));
