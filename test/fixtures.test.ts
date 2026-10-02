// Golden-file tests. Each folder under test/fixtures holds:
//   input.iLogicVb     - what the user wrote
//   expected.iLogicVb  - what the formatter must produce
//   options.json       - optional FormatOptions overrides
//   todo.md            - optional: a known bug; the fixture holds the desired output
// Every passing fixture must also be idempotent: format(expected) === expected.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { format, FormatOptions } from "../src/formatter";

const root = join(import.meta.dir, "fixtures");
const read = (dir: string, file: string) => readFileSync(join(root, dir, file), "utf8");

describe("fixtures", () => {
    for (const name of readdirSync(root).sort()) {
        const has = (file: string) => existsSync(join(root, name, file));
        const options: FormatOptions = has("options.json") ? JSON.parse(read(name, "options.json")) : {};
        const input = read(name, "input.iLogicVb");
        const expected = read(name, "expected.iLogicVb");

        if (has("todo.md")) {
            test.todo(`${name} (${read(name, "todo.md").split("\n")[0]})`);
            continue;
        }
        test(name, () => {
            expect(format(input, options)).toBe(expected);
        });
        test(`${name} is idempotent`, () => {
            expect(format(expected, options)).toBe(expected);
        });
    }
});
