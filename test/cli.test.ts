import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const dir = mkdtempSync(join(tmpdir(), "ilogic-format-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const cli = join(import.meta.dir, "..", "src", "cli.ts");
function run(args: string[], stdin?: string) {
    const p = Bun.spawnSync(["bun", cli, ...args], { stdin: stdin === undefined ? undefined : Buffer.from(stdin) });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}
function file(name: string, content: string) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
    return path;
}

const messy = "sub main()\nif x then\ny = 1\nend if\nend sub\n";
const clean = "Sub main()\n    If x Then\n        y = 1\n    End If\nEnd Sub\n";

describe("ilogic-format", () => {
    test("prints a formatted file", () => {
        expect(run([file("a.iLogicVb", messy)])).toEqual({ code: 0, out: clean, err: "" });
    });

    test("--check lists unformatted files and exits 1; 0 when clean", () => {
        const bad = file("check/bad.iLogicVb", messy);
        file("check/good.iLogicVb", clean);
        const r = run(["--check", join(dir, "check")]);
        expect(r.code).toBe(1);
        expect(r.out).toBe(`not formatted: ${bad}\n`);
        expect(run(["--check", join(dir, "check", "good.iLogicVb")]).code).toBe(0);
    });

    test("--write keeps CRLF line endings and the BOM", () => {
        const path = file("crlf.iLogicVb", "﻿" + messy.replace(/\n/g, "\r\n"));
        expect(run(["--write", path]).code).toBe(0);
        expect(readFileSync(path, "utf8")).toBe("﻿" + clean.replace(/\n/g, "\r\n"));
        expect(run(["--check", path]).code).toBe(0); // and it is now stable
    });

    test.skipIf(process.platform === "win32" || process.getuid?.() === 0)("write errors produce JSON, exit 2 and do not skip later files", () => {
        const bad = file("write-error/a.iLogicVb", messy);
        const good = file("write-error/b.iLogicVb", messy);
        chmodSync(bad, 0o444);
        try {
            const r = run(["--write", "--json", bad, good]);
            expect(r.code).toBe(2);
            expect(r.err).toBe("");
            const output = JSON.parse(r.out);
            expect(output.results[0]).toMatchObject({ path: bad, error: expect.stringContaining("EACCES") });
            expect(output.results[0].written).toBeUndefined();
            expect(output.results[1]).toEqual({ path: good, written: true });
            expect(output.summary).toMatchObject({ files: 2, written: 1, errors: 1 });
            expect(readFileSync(bad, "utf8")).toBe(messy);
            expect(readFileSync(good, "utf8")).toBe(clean);

            writeFileSync(good, messy);
            const plain = run(["--write", bad, good]);
            expect(plain.code).toBe(2);
            expect(plain.err).toContain(`ilogic-format: ${bad}:`);
            expect(plain.out).toBe(`formatted: ${good}\n`);
            expect(readFileSync(good, "utf8")).toBe(clean);
        } finally {
            chmodSync(bad, 0o644);
        }
    });

    test("--lint reports block problems and hints, exit 1", () => {
        const path = file("lint.iLogicVb", "Sub Main()\nEnd If\nEnd Sub\n");
        const r = run(["--lint", path]);
        expect(r.code).toBe(1);
        expect(r.out).toContain(`${path}:2: warning [blocks] End If has no matching If`);
        expect(r.out).toContain(`${path}:1: information [option-strict]`);
    });

    test("directories pick up .iLogicVb only, unless --include-vb", () => {
        file("tree/sub/one.iLogicVb", clean);
        file("tree/two.vb", messy);
        expect(JSON.parse(run(["--check", "--json", join(dir, "tree")]).out).summary.files).toBe(1);
        expect(JSON.parse(run(["--check", "--json", "--include-vb", join(dir, "tree")]).out).summary).toMatchObject({ files: 2, notFormatted: 1 });
    });

    test("--stdin and formatting options", () => {
        expect(run(["--stdin", "--indent-size", "2"], messy).out).toBe(clean.replace(/    /g, "  "));
    });

    test("usage errors exit 2", () => {
        expect(run([]).code).toBe(2);
        expect(run(["--bogus", "x"]).code).toBe(2);
        expect(run(["--indent-size", "0", "x"]).code).toBe(2);
        expect(run([join(dir, "missing.iLogicVb")]).code).toBe(2);
        expect(run(["--help"]).out).toContain("Exit codes");
    });

    test("--version matches package.json", () => {
        const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"));
        expect(run(["--version"]).out.trim()).toBe(pkg.version);
    });
});
