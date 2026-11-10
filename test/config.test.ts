import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CONFIG_FILE, CONFIG_KEYS, ConfigError, configFor, findConfigFile, formatOptionsOf, parseConfig } from "../src/config";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "ilogic-config-")));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe(".ilogicformat.json", () => {
    test("accepts every documented setting, and $schema", () => {
        const text = JSON.stringify({
            $schema: "x", indentSize: 2, useTabs: true, maxBlankLines: 0, blankLineAfterBlock: false, normalizeKeywords: false,
            normalizeComments: false, normalizeUnicode: false, disabledHints: ["msgbox", "option-strict"], allowCommentedCatch: true, vbFilesAreILogic: false,
        });
        const config = parseConfig(text, "f");
        expect(Object.keys(config).sort()).toEqual(Object.keys(CONFIG_KEYS).sort());
        expect(formatOptionsOf(config)).toEqual({ indentSize: 2, useTabs: true, maxBlankLines: 0, blankLineAfterBlock: false, normalizeKeywords: false, normalizeComments: false, normalizeUnicode: false });
    });

    test("says what is wrong with a file it cannot use", () => {
        const message = (text: string) => {
            try { parseConfig(text, "cfg"); return null; } catch (e) { return e instanceof ConfigError ? e.message : "other error"; }
        };
        expect(message("{ nope")).toStartWith("cfg: not valid JSON");
        expect(message("[]")).toBe("cfg: must be a JSON object");
        expect(message('{"indentsize": 2}')).toStartWith('cfg: unknown setting "indentsize"');
        expect(message('{"indentSize": 0}')).toBe('cfg: "indentSize" must be a whole number from 1 to 16');
        expect(message('{"indentSize": "4"}')).toBe('cfg: "indentSize" must be a whole number from 1 to 16');
        expect(message('{"useTabs": 1}')).toBe('cfg: "useTabs" must be true or false');
        expect(message('{"disabledHints": ["msgbox", "typo"]}')).toStartWith('cfg: "disabledHints" must be a list of: interpolation');
        expect(message("{}")).toBeNull();
    });

    test("the nearest file at or above the rule's folder applies; none gives an empty config", () => {
        const deep = join(dir, "a", "b", "c");
        mkdirSync(deep, { recursive: true });
        expect(findConfigFile(deep)?.startsWith(dir)).not.toBe(true);
        writeFileSync(join(dir, CONFIG_FILE), '{"indentSize": 2}');
        expect(configFor(deep)).toEqual({ path: join(dir, CONFIG_FILE), config: { indentSize: 2 } });
        writeFileSync(join(dir, "a", "b", CONFIG_FILE), '{"indentSize": 8}');
        expect(configFor(deep).config).toEqual({ indentSize: 8 });
        expect(configFor(join(dir, "a")).config).toEqual({ indentSize: 2 });
    });

    test("an edited file is read again", () => {
        const path = join(dir, "a", "b", CONFIG_FILE);
        expect(configFor(join(dir, "a", "b")).config).toEqual({ indentSize: 8 });
        writeFileSync(path, '{"indentSize": 3, "useTabs": false}');
        utimesSync(path, new Date(), new Date(Date.now() + 5000));
        expect(configFor(join(dir, "a", "b")).config).toEqual({ indentSize: 3, useTabs: false });
    });

    test("the JSON schema offers exactly the settings the code accepts", () => {
        const schema = JSON.parse(readFileSync(join(import.meta.dir, "..", "schemas", "ilogicformat.schema.json"), "utf8"));
        expect(Object.keys(schema.properties).filter((k) => k !== "$schema").sort()).toEqual(Object.keys(CONFIG_KEYS).sort());
        expect(schema.additionalProperties).toBe(false);
        const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"));
        expect(pkg.contributes.jsonValidation[0]).toEqual({ fileMatch: CONFIG_FILE, url: "./schemas/ilogicformat.schema.json" });
        expect(schema.properties.disabledHints.items.enum).toEqual(pkg.contributes.configuration.properties["ilogicFormatter.disabledHints"].items.enum);
    });
});
