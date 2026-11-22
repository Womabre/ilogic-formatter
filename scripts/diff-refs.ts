// Did behaviour change between two commits? Runs both versions of src/ over
// the same generated rules and reports every surface whose result differs,
// each with the smallest rule that shows it.
//
//   bun scripts/diff-refs.ts <base> [<head>] [--rules N] [--examples N]
//
// <head> defaults to the working tree. Exit code 0 when nothing differs, 1
// when something does: for a refactor that is the answer, for an intended
// change it is the list to read, and every example in it should be one you
// meant. The rules come from test/generate.ts: seed 12 is generate(12), the
// rule the property tests use, and s12 is generateWithStrings(12).
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { generate, generateWithStrings } from "../test/generate";

const root = join(import.meta.dir, "..");

// The modules are loaded from another commit, so their shape is whatever that commit exported
type Loaded = Record<string, any>;
interface Version {
    label: string;
    formatter: Loaded;
    lint: Loaded;
    structure: Loaded;
    quickFixes: Loaded;
}
type Surface = (text: string) => unknown;

const AS_WRITTEN = { normalizeKeywords: false, normalizeComments: false, normalizeUnicode: false };

/** What is compared. A surface a version does not have is skipped, and said so. */
const SURFACES: Record<string, (v: Version) => Surface | undefined> = {
    "formatted output": (v) => v.formatter.format && ((text) => v.formatter.format(text)),
    "formatted output, normalizations off": (v) => v.formatter.format && ((text) => v.formatter.format(text, AS_WRITTEN)),
    "block warnings": (v) => v.formatter.analyzeBlocks && ((text) => v.formatter.analyzeBlocks(text).problems),
    "block spans": (v) => v.formatter.analyzeBlocks && ((text) => v.formatter.analyzeBlocks(text).spans),
    "convention hints": (v) => v.lint.lint && ((text) => v.lint.lint(text)),
    "folding": (v) => v.structure.foldingRanges,
    "outline": (v) => v.structure.outline,
    "Option Strict fix": (v) => v.quickFixes.optionStrictEdits,
};

class UnknownRef extends Error {
    constructor(ref: string) {
        super(`"${ref}" is not a commit in this repository`);
    }
}

/** src/ as it was at `ref`, in a directory of its own. */
function exportRef(ref: string, into: string): string {
    let commit: string;
    try {
        commit = execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: root, encoding: "utf8" }).trim();
    } catch {
        throw new UnknownRef(ref);
    }
    const tar = execFileSync("git", ["archive", "--format=tar", commit, "src"], { cwd: root, maxBuffer: 1 << 28 });
    execFileSync("tar", ["-x", "-C", into], { input: tar });
    return join(into, "src");
}

async function load(label: string, src: string): Promise<Version> {
    const module = async (name: string): Promise<Loaded> => (existsSync(join(src, `${name}.ts`)) ? await import(join(src, `${name}.ts`)) : {});
    return { label, formatter: await module("formatter"), lint: await module("lint"), structure: await module("structure"), quickFixes: await module("quickFixes") };
}

/** A result as comparable text; a throw is a result too. */
function run(surface: Surface, text: string): string {
    try {
        const result = surface(text);
        return typeof result === "string" ? result : JSON.stringify(result, null, 1);
    } catch (error) {
        return `threw: ${error instanceof Error ? error.message : String(error)}`;
    }
}

/** The fewest lines of `text` that still differ: drop ever smaller runs of lines while the difference stays. */
function minimize(text: string, differs: (text: string) => boolean): string {
    let lines = text.replace(/\n$/, "").split("\n");
    const join_ = (kept: string[]) => kept.join("\n") + "\n";
    for (let size = Math.ceil(lines.length / 2); size >= 1; size = size === 1 ? 0 : Math.ceil(size / 2)) {
        for (let at = 0; at < lines.length; ) {
            const without = [...lines.slice(0, at), ...lines.slice(at + size)];
            if (without.length > 0 && differs(join_(without))) lines = without;
            else at += size;
        }
    }
    // Indentation rarely matters to the difference; drop it where it does not
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines.map((line, k) => (k === i ? line.trim() : line));
        if (differs(join_(trimmed))) lines = trimmed;
    }
    return join_(lines);
}

/** Half the rules are the property tests' own, half have multi-line strings with code after the closing quote. */
const rule = (n: number) => (n % 2 === 1 ? generate((n + 1) / 2) : generateWithStrings(n / 2));
const seedOf = (n: number) => (n % 2 === 1 ? `${(n + 1) / 2}` : `s${n / 2}`);

const indented = (text: string) => text.replace(/\n$/, "").split("\n").map((line) => `    | ${line}`).join("\n");

async function main(): Promise<number> {
    const args = process.argv.slice(2);
    const count = (flag: string, fallback: number) => (args.includes(flag) ? Number(args.splice(args.indexOf(flag), 2)[1]) : fallback);
    const rules = count("--rules", 4000);
    const examples = count("--examples", 5);
    const [baseRef, headRef] = args;
    if (!baseRef || args.length > 2 || ![rules, examples].every((n) => Number.isInteger(n) && n >= 1)) {
        console.error("Usage: bun scripts/diff-refs.ts <base> [<head>] [--rules N] [--examples N]");
        return 2;
    }

    const scratch = mkdtempSync(join(tmpdir(), "ilogic-diff-refs-"));
    try {
        const exported = (ref: string, name: string) => {
            mkdirSync(join(scratch, name));
            return exportRef(ref, join(scratch, name));
        };
        const base = await load(baseRef, exported(baseRef, "base"));
        const head = headRef ? await load(headRef, exported(headRef, "head")) : await load("the working tree", join(root, "src"));
        console.log(`${base.label} against ${head.label}, ${rules} generated rules\n`);

        let different = 0;
        for (const [name, pick] of Object.entries(SURFACES)) {
            const [before, after] = [pick(base), pick(head)];
            if (!before || !after) {
                console.log(`${name}: skipped, ${before ? head.label : base.label} does not have it\n`);
                continue;
            }
            const differs = (text: string) => run(before, text) !== run(after, text);
            const differing = Array.from({ length: rules }, (_, i) => i + 1).filter((n) => differs(rule(n)));
            if (differing.length === 0) {
                console.log(`${name}: the same`);
                continue;
            }
            different++;
            console.log(`\n${name}: ${differing.length} of ${rules} rules differ`);
            // One change shows up in many rules. Cut each down and show the distinct
            // ones, shortest first: a regression is in that list beside the intended change.
            const shown = new Map<string, number>();
            for (const n of differing) {
                const example = minimize(rule(n), differs);
                if (!shown.has(example)) shown.set(example, n);
            }
            const distinct = [...shown].sort(([a], [b]) => a.length - b.length);
            for (const [example, n] of distinct.slice(0, examples)) {
                console.log(`  cut down from seed ${seedOf(n)}:\n${indented(example)}`);
                console.log(`  ${base.label}:\n${indented(run(before, example))}`);
                console.log(`  ${head.label}:\n${indented(run(after, example))}\n`);
            }
            if (distinct.length > examples) console.log(`  ${distinct.length - examples} more distinct example(s): --examples ${distinct.length} shows them all\n`);
        }
        console.log(different === 0 ? "\nNo difference found." : `\n${different} surface(s) differ.`);
        return different === 0 ? 0 : 1;
    } catch (error) {
        if (!(error instanceof UnknownRef)) throw error;
        console.error(error.message);
        return 2;
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

if (import.meta.main) process.exit(await main());
