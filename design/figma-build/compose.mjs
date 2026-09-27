// Bundles a *.src.js script with the helper libraries into dist/, ready for one use_figma call
// (or a scripting plugin). The helpers are embedded as strings, the same way scripts 01–07 loaded node 4:2.
// usage: node compose.mjs            → rebuilds every dist file
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
const H = readFileSync(new URL("./00-helpers.js", import.meta.url), "utf8");
const Q = readFileSync(new URL("./00-people-helpers.js", import.meta.url), "utf8");
mkdirSync(new URL("./dist/", import.meta.url), { recursive: true });
const bundles = [];
for (const f of readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".src.js"))) {
  const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
  // Helpers are inlined as async functions (their bodies end in `return {...}`), so the bundle is plain JS.
  const out = [
    `// Built by compose.mjs from ${f}. Edit the source, not this file.`,
    `const H=await (async(figma)=>{\n${H}\n})(figma);`,
    /\bQ\b/.test(src) ? `const Q=await (async(figma,H)=>{\n${Q}\n})(figma,H);` : "",
    src,
  ].join("\n");
  // Syntax check: the body must compile as an async function (top-level await and return are allowed there).
  new (Object.getPrototypeOf(async function () {}).constructor)("figma", out);
  writeFileSync(new URL(`./dist/${f.replace(".src.js", ".js")}`, import.meta.url), out);
  bundles.push([f.replace(".src.js", ""), out]);
  console.log("built", f, `${(out.length / 1024).toFixed(1)} KB`);
}

// A local development plugin that runs every bundle in order: no MCP call limit.
// Figma desktop → Plugins → Development → Import plugin from manifest… → plugin/manifest.json
mkdirSync(new URL("./plugin/", import.meta.url), { recursive: true });
const prep = readFileSync(new URL("./00-ensure-tokens.js", import.meta.url), "utf8");
const steps = [["00-ensure-tokens", prep], ...bundles.sort(([a], [b]) => a.localeCompare(b))]
  .map(([name, code]) => `  results[${JSON.stringify(name)}] = await (async () => {\n${code}\n})();`)
  .join("\n");
writeFileSync(
  new URL("./plugin/code.js", import.meta.url),
  `// Built by compose.mjs. Runs scripts ${bundles.map(([n]) => n.slice(0, 2)).join(", ")} in order.\n(async () => {\n  const results = {};\n  try {\n${steps}\n    // Finish on the screens page, zoomed to what was added.
    const pg = figma.root.children.find((p) => /Screens by role/i.test(p.name));
    if (pg) {
      await figma.setCurrentPageAsync(pg);
      const added = pg.children.filter((n) => n.type === "SECTION" && /added 27 Sep/.test(n.name));
      if (added.length) figma.viewport.scrollAndZoomIntoView(added);
    }
    figma.closePlugin("Waypoint HR update applied: " + Object.keys(results).join(", "));\n  } catch (e) {\n    figma.closePlugin("Stopped after " + (Object.keys(results).join(", ") || "nothing") + ": " + (e && e.message ? e.message : e));\n  }\n})();\n`,
);
writeFileSync(
  new URL("./plugin/manifest.json", import.meta.url),
  JSON.stringify({ name: "Waypoint HR update (27 Sep)", id: "waypoint-hr-update-local", api: "1.0.0", main: "code.js", editorType: ["figma"], documentAccess: "dynamic-page" }, null, 2) + "\n",
);
console.log("built plugin/ (manifest.json + code.js)");
