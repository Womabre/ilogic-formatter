import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CONFIG_FILE, CONFIG_KEYS, ConfigError, configFor, findConfigFile, isRuleFile, parseConfig, resolveSettings } from "../src/config";

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
        expect(resolveSettings(config)).toEqual({
            format: { indentSize: 2, useTabs: true, maxBlankLines: 0, blankLineAfterBlock: false, normalizeKeywords: false, normalizeComments: false, normalizeUnicode: false },
            hints: { disabled: ["msgbox", "option-strict"], allowCommentedCatch: true },
            vbFilesAreILogic: false,
        });
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

describe("rule settings", () => {
    test("with no layers, the defaults", () => {
        expect(resolveSettings()).toEqual({
            format: { indentSize: 4, useTabs: false, maxBlankLines: 1, blankLineAfterBlock: true, normalizeKeywords: true, normalizeComments: true, normalizeUnicode: true },
            hints: { disabled: [], allowCommentedCatch: false },
            vbFilesAreILogic: true,
        });
    });

    test("the most specific layer that sets a choice wins", () => {
        const editor = { indentSize: 2, useTabs: true, allowCommentedCatch: true };
        const file = { indentSize: 3, vbFilesAreILogic: false };
        const flags = { indentSize: 8 };
        const settings = resolveSettings(editor, file, flags);
        expect(settings.format.indentSize).toBe(8);
        expect(settings.format.useTabs).toBe(true); // only the editor set it
        expect(settings.hints.allowCommentedCatch).toBe(true);
        expect(settings.vbFilesAreILogic).toBe(false);
        expect(resolveSettings(flags, file, editor).format.indentSize).toBe(2);
    });

    test("an unset key never overrides a set one, also when it is null", () => {
        const unset = { indentSize: undefined, useTabs: null as unknown as undefined, allowCommentedCatch: undefined };
        const settings = resolveSettings({ indentSize: 2, useTabs: true, allowCommentedCatch: true }, unset);
        expect([settings.format.indentSize, settings.format.useTabs, settings.hints.allowCommentedCatch]).toEqual([2, true, true]);
    });

    test("disabled hints from every layer add up, each once", () => {
        expect(resolveSettings({ disabledHints: ["msgbox"] }, { disabledHints: ["msgbox", "empty-catch"] }, {}).hints.disabled)
            .toEqual(["msgbox", "empty-catch"]);
    });

    test("which files are rules", () => {
        const vbIsRule = resolveSettings();
        const vbIsNot = resolveSettings({ vbFilesAreILogic: false });
        expect(["a.iLogicVb", "A.ILOGICVB", "b.vb", "c.vbs", "d.bas", "e.txt"].map((p) => isRuleFile(p, vbIsRule)))
            .toEqual([true, true, true, false, false, false]);
        expect(["a.iLogicVb", "b.vb"].map((p) => isRuleFile(p, vbIsNot))).toEqual([true, false]);
        expect(isRuleFile(null, vbIsNot)).toBe(true); // standard input
    });
});
