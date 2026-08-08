import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { appTheme } from "@/theme";

function uiSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "assets" || entry.name === "artwork") return [];
      return uiSourceFiles(path);
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name === "theme.ts" || entry.name.includes(".test.")) return [];
    return [path];
  });
}

describe("application theme", () => {
  it("defines the semantic dark palette", () => {
    expect(appTheme.palette.mode).toBe("dark");
    expect(appTheme.palette.background.default).toBe("#050508");
    expect(appTheme.palette.background.paper).toBe("#0f0f16");
    expect(appTheme.palette.primary.main).toBe("#10b981");
    expect(appTheme.palette.secondary.main).toBe("#4338ca");
    expect(appTheme.palette.error.main).toBe("#ef4444");
  });

  it("keeps raw color literals out of application UI source", () => {
    const sourceRoot = join(process.cwd(), "src");
    const offenders = uiSourceFiles(sourceRoot)
      .filter((file) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
