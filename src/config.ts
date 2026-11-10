// .ilogicformat.json: one place for the formatting and hint choices of a folder
// of rules, read by both the extension and ilogic-format, so the editor and a
// CI check cannot disagree. The file is looked up from the rule's folder
// upwards; the nearest one wins. Every key is optional.

import { readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { FormatOptions } from "./formatter";
import { LINT_RULES, LintRule } from "./lint";

export const CONFIG_FILE = ".ilogicformat.json";

/** What a config file can set: the formatter's options, plus the hint choices. */
export interface FileConfig extends FormatOptions {
    disabledHints?: LintRule[];
    allowCommentedCatch?: boolean;
}

export class ConfigError extends Error {}

type Check = (value: unknown) => string | null;
const boolean: Check = (v) => (typeof v === "boolean" ? null : "must be true or false");
const whole = (min: number, max: number): Check => (v) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? null : `must be a whole number from ${min} to ${max}`;

/** Every key a config file may hold, with its check. schemas/ilogicformat.schema.json lists the same keys. */
export const CONFIG_KEYS: Record<keyof FileConfig, Check> = {
    indentSize: whole(1, 16),
    useTabs: boolean,
    maxBlankLines: whole(0, 100),
    blankLineAfterBlock: boolean,
    normalizeKeywords: boolean,
    normalizeComments: boolean,
    normalizeUnicode: boolean,
    allowCommentedCatch: boolean,
    disabledHints: (v) =>
        Array.isArray(v) && v.every((rule) => (LINT_RULES as readonly unknown[]).includes(rule))
            ? null
            : `must be a list of: ${LINT_RULES.join(", ")}`,
};

/** Parses and checks the text of a config file. `path` is only used in messages. */
export function parseConfig(text: string, path: string): FileConfig {
    let data: unknown;
    try {
        data = JSON.parse(text.replace(/^﻿/, ""));
    } catch (e) {
        throw new ConfigError(`${path}: not valid JSON (${(e as Error).message})`);
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw new ConfigError(`${path}: must be a JSON object`);
    for (const [key, value] of Object.entries(data)) {
        if (key === "$schema") continue;
        const check = (CONFIG_KEYS as Record<string, Check | undefined>)[key];
        if (!check) throw new ConfigError(`${path}: unknown setting "${key}" (known: ${Object.keys(CONFIG_KEYS).join(", ")})`);
        const problem = check(value);
        if (problem) throw new ConfigError(`${path}: "${key}" ${problem}`);
    }
    const { $schema: _schema, ...config } = data as Record<string, unknown>;
    return config as FileConfig;
}

/** The nearest config file at or above `dir`, or null. */
export function findConfigFile(dir: string): string | null {
    for (let current = dir; ; current = dirname(current)) {
        const candidate = join(current, CONFIG_FILE);
        try {
            if (statSync(candidate).isFile()) return candidate;
        } catch {
            // not here: look one folder up
        }
        if (dirname(current) === current) return null;
    }
}

// Parsed files by path, reused until the file changes on disk
const cache = new Map<string, { mtimeMs: number; size: number; config: FileConfig }>();

/** Reads a config file. Throws ConfigError when it cannot be read or is not valid. */
export function readConfigFile(path: string): FileConfig {
    let stat: { mtimeMs: number; size: number };
    try {
        stat = statSync(path);
    } catch (e) {
        throw new ConfigError(`${path}: ${(e as Error).message}`);
    }
    const cached = cache.get(path);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.config;
    const config = parseConfig(readFileSync(path, "utf8"), path);
    cache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, config });
    return config;
}

/**
 * The config that applies to a rule in `dir`: the nearest .ilogicformat.json at
 * or above it, or an empty config when there is none.
 */
export function configFor(dir: string): { path: string | null; config: FileConfig } {
    const path = findConfigFile(dir);
    return path ? { path, config: readConfigFile(path) } : { path: null, config: {} };
}

/** The formatter's part of a config (without the hint choices). */
export function formatOptionsOf(config: FileConfig): FormatOptions {
    const { disabledHints: _hints, allowCommentedCatch: _catch, ...options } = config;
    return options;
}
