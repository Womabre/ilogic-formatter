#!/usr/bin/env node
// ilogic-format: the iLogic Formatter outside VS Code (CI, pre-commit hooks,
// bulk formatting). Wraps the same format/checkBlocks/lint the extension uses.
// Run with: bun src/cli.ts ...   or   node out/cli.js ...

import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { dirname, resolve } from "path";
import { CONFIG_FILE, ConfigError, configFor, FileConfig, formatOptionsOf, readConfigFile } from "./config";
import { checkBlocks, format, FormatOptions } from "./formatter";
import { lint, LINT_RULES, LintRule } from "./lint";

const HELP = `ilogic-format [options] <file | directory>...

Formats Autodesk Inventor iLogic rules. Directories are searched (recursively)
for *.iLogicVb and *.vb files: a .vb file is taken for an iLogic rule, unless
--no-vb or a settings file says otherwise.

Modes (default: print the formatted rule to stdout; one file only)
  --check            List files that are not formatted; exit 1 if any
  --write            Format files in place (keeps CRLF line endings and BOM)
                     Files must be UTF-8; others are reported and left alone
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

Hints (with --lint)
  --disable-hint RULE   Turn a convention hint off; repeat for several
                        (${LINT_RULES.join(", ")})
  --allow-commented-catch   An empty Catch that holds a comment is fine

Settings file
  A ${CONFIG_FILE} in the folder of a rule, or in a folder above it, sets the
  same options for every rule below it, in the editor and here alike. Options
  given on the command line win over the file.
  --config FILE      Use this settings file for every rule
  --no-config        Ignore settings files

Other
  --no-vb            .vb files are regular VB.NET: skip them in directories, and
                     give a .vb file named on the command line no convention hints
  --include-vb       .vb files are iLogic rules, also where a settings file says not
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
    /** .vb files are iLogic rules: set by --include-vb / --no-vb; undefined follows the settings file (default yes) */
    vb?: boolean;
    options: FormatOptions;
    disabledHints: LintRule[];
    allowCommentedCatch?: boolean;
    /** A settings file for every rule, or false for none; undefined looks one up per rule */
    config?: string | false;
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Args | "help" | "version" {
    const args: Args = { paths: [], check: false, write: false, lint: false, stdin: false, json: false, options: {}, disabledHints: [] };
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
            case "--include-vb": args.vb = true; break;
            case "--no-vb": args.vb = false; break;
            case "--use-tabs": args.options.useTabs = true; break;
            case "--indent-size": args.options.indentSize = number(a, argv[++i], 1); break;
            case "--max-blank-lines": args.options.maxBlankLines = number(a, argv[++i], 0); break;
            case "--no-blank-line-after-block": args.options.blankLineAfterBlock = false; break;
            case "--no-normalize-keywords": args.options.normalizeKeywords = false; break;
            case "--no-normalize-comments": args.options.normalizeComments = false; break;
            case "--no-normalize-unicode": args.options.normalizeUnicode = false; break;
            case "--allow-commented-catch": args.allowCommentedCatch = true; break;
            case "--disable-hint": {
                const rule = argv[++i];
                if (!(LINT_RULES as readonly (string | undefined)[]).includes(rule)) throw new UsageError(`--disable-hint needs one of: ${LINT_RULES.join(", ")}`);
                args.disabledHints.push(rule as LintRule);
                break;
            }
            case "--no-config": args.config = false; break;
            case "--config":
                if (argv[i + 1] === undefined) throw new UsageError("--config needs a file");
                args.config = argv[++i];
                break;
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
function collectFiles(paths: string[], vbIsILogic: (path: string) => boolean): string[] {
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.ilogicvb$/i.test(entry.name) || (/\.vb$/i.test(entry.name) && vbIsILogic(full))) files.push(full);
        }
    };
    for (const p of paths) {
        if (statSync(p).isDirectory()) walk(p);
        else files.push(p);
    }
    return [...new Set(files)].sort();
}

/**
 * Decodes a file as UTF-8, keeping a BOM as its first character. Throws for
 * anything else (UTF-16, Windows-1252, ...): decoding those loosely would turn
 * every non-ASCII character into U+FFFD, and --write would then save that.
 */
function decodeUtf8(bytes: Uint8Array): string {
    if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
        throw new Error("is UTF-16; save it as UTF-8 first (left unchanged)");
    }
    try {
        return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
        throw new Error("is not valid UTF-8 (probably ANSI / Windows-1252); save it as UTF-8 first (left unchanged)");
    }
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

/** The settings for one rule: its settings file (if any), then the command line on top. */
function settingsFor(dir: string, args: Args): Required<Pick<FileConfig, "disabledHints">> & FileConfig {
    const file = args.config === false ? {} : args.config !== undefined ? readConfigFile(resolve(args.config)) : configFor(resolve(dir)).config;
    return {
        ...file,
        ...args.options,
        disabledHints: [...new Set([...(file.disabledHints ?? []), ...args.disabledHints])],
        allowCommentedCatch: args.allowCommentedCatch ?? file.allowCommentedCatch,
        vbFilesAreILogic: args.vb ?? file.vbFilesAreILogic ?? true,
    };
}

/** Whether a .vb file found in a directory is a rule. A settings file that cannot be read is reported when the file is processed. */
function vbIsILogic(path: string, args: Args): boolean {
    try {
        return settingsFor(dirname(path), args).vbFilesAreILogic !== false;
    } catch (e) {
        if (e instanceof ConfigError) return true;
        throw e;
    }
}

function findings(raw: string, path: string, settings: FileConfig): Finding[] {
    const text = raw.replace(/^﻿/, "");
    const options = formatOptionsOf(settings);
    const blocks: Finding[] = checkBlocks(text, options).map((p) => ({ line: p.line + 1, severity: "warning", rule: "blocks", message: p.message }));
    const isRule = /\.ilogicvb$/i.test(path) || path === "<stdin>" || (/\.vb$/i.test(path) && settings.vbFilesAreILogic !== false);
    const hints: Finding[] = isRule
        ? lint(text, settings.disabledHints, settings).map((p) => ({ line: p.line + 1, severity: p.severity, rule: p.rule, message: p.message }))
        : []; // convention hints are for iLogic rules; $"..." is valid in regular VB.NET
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
        let raw: string;
        try {
            raw = decodeUtf8(readFileSync(0));
        } catch (e) {
            process.stderr.write(`ilogic-format: <stdin> ${(e as Error).message}\n`);
            return 2;
        }
        let settings: FileConfig;
        try {
            settings = settingsFor(process.cwd(), args);
        } catch (e) {
            if (!(e instanceof ConfigError)) throw e;
            process.stderr.write(`ilogic-format: ${e.message}\n`);
            return 2;
        }
        const options = formatOptionsOf(settings);
        const found = args.lint ? findings(raw, "<stdin>", settings) : [];
        if (args.json) process.stdout.write(JSON.stringify({ formatted: formatFileText(raw, options).text, findings: found }, null, 2) + "\n");
        else if (args.lint) printFindings("<stdin>", found);
        else process.stdout.write(formatFileText(raw, options).text);
        return found.length > 0 ? 1 : 0;
    }

    let files: string[];
    try {
        const given = args;
        files = collectFiles(args.paths, (path) => vbIsILogic(path, given));
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
        let settings: FileConfig;
        try {
            raw = decodeUtf8(readFileSync(path));
            settings = settingsFor(dirname(path), args);
        } catch (e) {
            ioError = true;
            results.push({ path, error: (e as Error).message });
            if (!args.json) process.stderr.write(`ilogic-format: ${path}: ${(e as Error).message}\n`);
            continue;
        }
        const { text, changed } = formatFileText(raw, formatOptionsOf(settings));
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
            result.findings = findings(args.write ? text : raw, path, settings);
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
