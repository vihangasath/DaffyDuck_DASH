// Packs several out/<capture>.js scripts into one use_figma call: node bundle.mjs <name> <capture…>
import { readFileSync, writeFileSync } from "node:fs";
const [name, ...caps] = process.argv.slice(2);
const parts = caps.map((c) => `R[${JSON.stringify(c)}] = await (async () => {\n${readFileSync(new URL(`out/${c}.js`, import.meta.url), "utf8")}\n})();`);
const code = `const R = {};\n${parts.join("\n")}\nreturn R;`;
new (Object.getPrototypeOf(async function () {}).constructor)("figma", code);
writeFileSync(new URL(`out/${name}.js`, import.meta.url), code);
console.log(`out/${name}.js`, `${(code.length / 1024).toFixed(1)} KB`);
