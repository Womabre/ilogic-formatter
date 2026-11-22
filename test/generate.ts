// Generated rules for the property tests and scripts/diff-refs.ts. The
// generator is seeded, so a seed names the rule it produced.
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/** Small seeded generator (mulberry32). */
export function random(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Every line of every fixture and sample: real VB, in every shape the formatter knows
const root = join(import.meta.dir, "..");
const corpus = [
    ...readdirSync(join(root, "test", "fixtures")).map((name) => join(root, "test", "fixtures", name, "input.iLogicVb")),
    ...readdirSync(join(root, "sample")).filter((f) => /vb$/i.test(f)).map((f) => join(root, "sample", f)),
].flatMap((path) => readFileSync(path, "utf8").split(/\r?\n/));

/** A rule of 5-60 lines drawn at random: blocks rarely balance, strings may stay open. */
export function generate(seed: number): string {
    const next = random(seed);
    const pick = () => corpus[Math.floor(next() * corpus.length)];
    const indent = () => " ".repeat(Math.floor(next() * 9));
    const count = 5 + Math.floor(next() * 56);
    return Array.from({ length: count }, () => (next() < 0.1 ? "" : next() < 0.5 ? indent() + pick().trim() : pick())).join("\n") + "\n";
}

// Multi-line strings whose closing line carries code: what follows the closing
// quote belongs to the statement the string sits in, and is easy to get wrong.
const BEFORE = ["", "Dim q = From a In b", "If a Then", "Try", "Sub A()", "For i = 1 To 3"];
const OPENERS = ['x = "abc', 'Where a.s = "x', 'If s = "abc', 'Foo("abc', 'Dim s = $"a {x}', 'Return "abc'];
const TAILS = [
    "", " _", ")", " & _", ", 2)", " ' c", " And a.t = 1", " AndAlso b", " Then", " : End If", " : Else", " : Catch",
    " : Sub Foo()", " : Next", " : End Sub : Sub B()", " : lbl:", ' : y = "abc',
];
const AFTER = ["", "Select a", "Order By a.t", "End If", "End Try", "End Sub", "Next", "z = 1"];

/** A generated rule with such strings woven in, each between a line that may open a block or query and one that may continue or close it. */
export function generateWithStrings(seed: number): string {
    const next = random(seed ^ 0x5bd1e995);
    const from = (pool: readonly string[]) => pool[Math.floor(next() * pool.length)];
    const lines = generate(seed).replace(/\n$/, "").split("\n");
    for (let blocks = 1 + Math.floor(next() * 4); blocks > 0; blocks--) {
        const block = [from(BEFORE), from(OPENERS), `def"${from(TAILS)}`, from(AFTER)].filter((line) => line !== "");
        lines.splice(Math.floor(next() * (lines.length + 1)), 0, ...block);
    }
    return lines.join("\n") + "\n";
}
