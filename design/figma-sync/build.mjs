// Turns a capture (captures/<name>.json, from capture.js) into one self-contained use_figma script
// that rebuilds an existing Figma frame in place: same node id, position, caption and rationale.
//   node build.mjs <capture> <targetNodeId> <pageId> [--theme=web|people]   → out/<capture>.js
//   node build.mjs --icons <pageId> <x> <y> <capture…>                      → out/icons-<n>.js (icon components)
// Colours that match a token are bound to the Figma variable; icons are instances of icon/<name> components
// whose ids live in icons.json (written back after the icon script runs).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const dir = new URL(".", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, dir), "utf8"));
mkdirSync(new URL("out/", dir), { recursive: true });
const registry = existsSync(new URL("icons.json", dir)) ? read("icons.json") : {};

// Positional encoding keeps the scripts small: every screen's data is sent inline.
function encode(cap) {
  const fonts = cap.fonts;
  const icons = [];
  const iconIdx = (n) => (icons.includes(n) ? icons.indexOf(n) : icons.push(n) - 1);
  const flags = (n) =>
    (n.tc || "") + (n.td === "S" ? "s" : n.td === "U" ? "u" : "") + (n.ml ? "m" : "") + (n.al || "") + (n.fx ? "x" : "");
  // Drop trailing defaults, but never below `min` fields: indices (colour, svg, font) can be 0.
  const trim = (a, min) => {
    while (a.length > min && (a[a.length - 1] === undefined || a[a.length - 1] === null || a[a.length - 1] === 0 || a[a.length - 1] === "")) a.pop();
    return a;
  };
  const node = (n) => {
    if (n.k === "t") return trim([1, n.x, n.y, n.w, n.h, n.s, fonts.indexOf(`${n.f}|${n.st}`), n.z, n.lh, n.c, n.ls || 0, flags(n)], 10);
    if (n.k === "m") return trim([4, n.x, n.y, n.w, n.h, n.s, n.runs.map((r) => trim([r.n, fonts.indexOf(r.f), r.z, r.c, r.ls || 0, r.d || ""], 4)), n.lh, flags(n)], 8);
    if (n.k === "i") return trim([2, n.x, n.y, n.w, n.h, iconIdx(n.i), n.c ?? -1, n.fc ?? -1, n.sw || 0], 8);
    if (n.k === "v") return trim([3, n.x, n.y, n.w, n.h, n.s, n.o || 0], 6);
    const fl = (n.clip ? 1 : 0) | (n.img ? 2 : 0);
    return trim([0, n.x, n.y, n.w, n.h, n.n || "", n.f ?? -1, n.r || 0, n.b || 0, n.sh || 0, fl, n.g || 0, n.ch ? n.ch.map(node) : 0], 7);
  };
  return { C: cap.colors, F: fonts, S: cap.svgs.map((x) => x.replace(/="currentColor"/g, '="none"').replace(/ pointer-events="[^"]*"/g, "").replace(/ aria-label="[^"]*"/g, "").replace(/(\d+\.\d\d)\d+/g, "$1")), T: cap.ch.map(node), I: icons, W: cap.w, H: cap.h, BG: cap.bg };
}

const RUNTIME = String.raw`
const hex3 = h => ({ r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 });
const hx = c => [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
const TOK = {};
{
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const order = THEME === "people" ? ["Waypoint / Color", "Waypoint People / Color"] : ["Waypoint People / Color", "Waypoint / Color"];
  for (const name of order) {
    const col = cols.find(c => c.name === name); if (!col) continue;
    for (const id of col.variableIds) { const v = await figma.variables.getVariableByIdAsync(id); const val = v.valuesByMode[col.modes[0].modeId]; if (val && "r" in val) TOK[hx(val)] = v; }
  }
}
const paint = ci => {
  const s = D.C[ci]; const [h, a] = s.split("/");
  let p = { type: "SOLID", color: hex3(h) };
  if (TOK[h]) p = figma.variables.setBoundVariableForPaint(p, "color", TOK[h]);
  return a ? { ...p, opacity: +a } : p;
};
await Promise.all(D.F.map(f => { const [family, style] = f.split("|"); return figma.loadFontAsync({ family, style }); }));
const comps = {};
for (const [i, name] of D.I.entries()) { const id = ICONS[name]; comps[i] = id ? await figma.getNodeByIdAsync(id) : null; }
let count = 0;
// Wrapping text keeps the browser width; single lines hug and are anchored by their alignment edge.
function fit(node, fl, w, h) {
  if (fl.includes("m") || fl.includes("x")) {
    node.textAutoResize = "HEIGHT"; node.resize(Math.max(1, w + (fl.includes("x") ? 0 : 2)), h);
    if (fl.includes("C")) node.textAlignHorizontal = "CENTER"; else if (fl.includes("R")) node.textAlignHorizontal = "RIGHT";
  } else {
    node.textAutoResize = "WIDTH_AND_HEIGHT";
    return fl.includes("R") ? w - node.width : fl.includes("C") ? (w - node.width) / 2 : 0;
  }
  return 0;
}
function build(n, parent) {
  const [k, x, y, w, h] = n;
  let node, dx = 0;
  if (k === 1) {
    const [, , , , , s, fi, z, lh, c, ls, fl = ""] = n;
    const [family, style] = D.F[fi].split("|");
    node = figma.createText();
    node.fontName = { family, style };
    node.characters = s;
    node.fontSize = z;
    node.lineHeight = { unit: "PIXELS", value: lh };
    if (ls) node.letterSpacing = { unit: "PIXELS", value: ls };
    node.fills = [paint(c)];
    if (fl.includes("U")) node.textCase = "UPPER"; else if (fl.includes("T")) node.textCase = "TITLE"; else if (fl.includes("L")) node.textCase = "LOWER";
    if (fl.includes("s")) node.textDecoration = "STRIKETHROUGH"; else if (fl.includes("u")) node.textDecoration = "UNDERLINE";
    dx = fit(node, fl, w, h);
    node.name = s.slice(0, 40);
  } else if (k === 4) {
    const [, , , , , s, runs, lh, fl = ""] = n;
    const f0 = D.F[runs[0][1]].split("|");
    node = figma.createText();
    node.fontName = { family: f0[0], style: f0[1] };
    node.characters = s;
    node.lineHeight = { unit: "PIXELS", value: lh };
    let at = 0;
    for (const [len, fi, z, c, ls, d] of runs) {
      const [family, style] = D.F[fi].split("|");
      const e = Math.min(s.length, at + len);
      if (e > at) {
        node.setRangeFontName(at, e, { family, style });
        node.setRangeFontSize(at, e, z);
        node.setRangeFills(at, e, [paint(c)]);
        if (ls) node.setRangeLetterSpacing(at, e, { unit: "PIXELS", value: ls });
        if (d) node.setRangeTextDecoration(at, e, d === "S" ? "STRIKETHROUGH" : "UNDERLINE");
      }
      at = e;
    }
    dx = fit(node, fl, w, h);
    node.name = s.slice(0, 40);
  } else if (k === 2) {
    const [, , , , , ii, c, fc, sw] = n;
    const comp = comps[ii];
    if (comp) {
      node = comp.createInstance();
      node.rescale(w / 24);
      for (const v of node.findAll(v => "strokes" in v)) {
        if (v.strokes.length && c >= 0) v.strokes = [paint(c)];
        if (fc >= 0 && fc !== undefined && "fills" in v && v.type !== "FRAME") v.fills = [paint(fc)];
        if (sw && v.strokes.length) v.strokeWeight = sw * w / 24;
      }
    } else { node = figma.createFrame(); node.resize(w, h); node.fills = []; node.name = "icon/" + D.I[ii]; }
  } else if (k === 3) {
    node = figma.createNodeFromSvg(D.S[n[5]]);
    node.name = "Graphic";
    if (n[6]) node.opacity = n[6];
  } else {
    const [, , , , , name, f = -1, r = 0, b = 0, sh = 0, fl = 0, g = 0, ch = 0] = n;
    node = figma.createFrame();
    node.name = name || "Box";
    node.resize(Math.max(w, 0.01), Math.max(h, 0.01));
    const fills = [];
    if (g) fills.push({ type: "GRADIENT_LINEAR", gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: g.map((ci, i) => { const [hh, a] = D.C[ci].split("/"); return { position: i / (g.length - 1), color: { ...hex3(hh), a: a ? +a : 1 } }; }) });
    if (f >= 0) fills.push(paint(f));
    if (fl & 2) { node.name = "Image · " + (name || ""); if (!fills.length) fills.push({ type: "SOLID", color: hex3("edf1f5") }); }
    node.fills = fills;
    if (Array.isArray(r)) { [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius] = r; } else if (r) node.cornerRadius = r;
    if (b) {
      node.strokes = [paint(b[0])]; node.strokeAlign = "INSIDE";
      if (Array.isArray(b[1])) { node.strokeTopWeight = b[1][0]; node.strokeRightWeight = b[1][1]; node.strokeBottomWeight = b[1][2]; node.strokeLeftWeight = b[1][3]; } else node.strokeWeight = b[1];
      if (b[2]) node.dashPattern = [4, 3];
    }
    if (sh) node.effects = sh.map(([c, a, ox, oy, bl, sp, ins]) => ({ type: ins ? "INNER_SHADOW" : "DROP_SHADOW", color: { ...hex3(c), a }, offset: { x: ox, y: oy }, radius: bl, spread: sp, visible: true, blendMode: "NORMAL", ...(ins ? {} : { showShadowBehindNode: false }) }));
    node.clipsContent = !!(fl & 1);
    if (ch) for (const c of ch) build(c, node);
  }
  parent.appendChild(node);
  node.x = x + dx; node.y = y;
  count++;
  return node;
}
const page = await figma.getNodeByIdAsync(PAGE);
await figma.setCurrentPageAsync(page);
const target = await figma.getNodeByIdAsync(TARGET);
if (!target) throw new Error("target " + TARGET + " not found");
if ("layoutMode" in target && target.layoutMode !== "NONE") target.layoutMode = "NONE";
for (const c of [...target.children]) c.remove();
target.resize(D.W, D.H);
target.fills = [paint(D.C.indexOf(D.BG) >= 0 ? D.C.indexOf(D.BG) : (D.C.push(D.BG), D.C.length - 1))];
target.clipsContent = true;
for (const n of D.T) build(n, target);
return { target: target.id, name: target.name, nodes: count, missingIcons: D.I.filter(n => !ICONS[n]) };
`;

// Builds icon components from the icon sources seen in captures, laid out in a grid on the given page.
function iconScript(pageId, x, y, caps) {
  const src = {};
  for (const c of caps) Object.assign(src, read(`captures/${c}.json`).icons || {});
  const todo = Object.entries(src)
    .filter(([n]) => !registry[n])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([n, svg]) => [n, svg.replace(/ style="[^"]*"/, "").replace(/stroke-width="[\d.]+"/, 'stroke-width="2"').replace(/ xmlns="[^"]*"/, "").replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')]);
  return {
    count: todo.length,
    code: `const SRC=${JSON.stringify(Object.fromEntries(todo))};
const page = await figma.getNodeByIdAsync(${JSON.stringify(pageId)});
await figma.setCurrentPageAsync(page);
let board = page.findOne(n => n.type === "FRAME" && n.name === "Icons · lucide set used in the app");
if (!board) { board = figma.createFrame(); board.name = "Icons · lucide set used in the app"; page.appendChild(board); board.x = ${x}; board.y = ${y};
  board.layoutMode = "HORIZONTAL"; board.layoutWrap = "WRAP"; board.itemSpacing = 16; board.counterAxisSpacing = 16; board.paddingTop = board.paddingBottom = board.paddingLeft = board.paddingRight = 32;
  board.primaryAxisSizingMode = "FIXED"; board.counterAxisSizingMode = "AUTO"; board.resize(1200, 100); board.cornerRadius = 16; }
const ids = {};
for (const [name, svg] of Object.entries(SRC)) {
  const f = figma.createNodeFromSvg(svg);
  f.fills = [];
  const c = figma.createComponentFromNode(f);
  c.name = "icon/" + name;
  c.description = "lucide-react " + name + ". Recolour the stroke; 24×24 grid, 2px stroke.";
  board.appendChild(c);
  ids[name] = c.id;
}
return ids;`,
  };
}

const args = process.argv.slice(2);
if (args[0] === "--runtime") {
  // Stores RUNTIME in a hidden, locked text node on page 01; its id goes to runtime.json.
  const code = `const page = await figma.getNodeByIdAsync("0:1");
await figma.setCurrentPageAsync(page);
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
let t = page.findOne(n => n.type === "TEXT" && n.name === "__figma-sync runtime (temporary, delete)");
if (!t) { t = figma.createText(); t.name = "__figma-sync runtime (temporary, delete)"; page.appendChild(t); t.x = -4000; t.y = 0; }
t.characters = ${JSON.stringify(RUNTIME)};
t.visible = false; t.locked = true;
return { id: t.id, length: t.characters.length };`;
  writeFileSync(new URL("out/runtime.js", dir), code);
  console.log("out/runtime.js", `${(code.length / 1024).toFixed(1)} KB`);
} else if (args[0] === "--icons") {
  const [, pageId, x, y, ...caps] = args;
  const { count, code } = iconScript(pageId, +x, +y, caps);
  const file = `out/icons.js`;
  writeFileSync(new URL(file, dir), code);
  console.log(file, count, "new icons", `${(code.length / 1024).toFixed(1)} KB`);
} else {
  // node build.mjs <capture…>  (targets from screens.json)  or  node build.mjs <capture> <target> <page>
  const screens = read("screens.json");
  const jobs = args.length === 3 && /^\d+:\d+$/.test(args[1]) ? [[args[0], { target: args[1], page: args[2] }]] : args.map((a) => [a, screens[a]]);
  for (const [capName, sc] of jobs) buildOne(capName, sc.target, sc.page, sc.theme || "web");
}
function buildOne(capName, target, pageId, theme) {
  {
  const D = encode(read(`captures/${capName}.json`));
  const icons = Object.fromEntries(D.I.map((n) => [n, registry[n]]).filter(([, v]) => v));
  const missing = D.I.filter((n) => !registry[n]);
  // The runtime lives once in the file (a hidden text node, see --runtime); each call only carries the data.
  const rt = existsSync(new URL("runtime.json", dir)) ? read("runtime.json").id : null;
  // Data is also kept in a hidden text node on page 01, so a failed build can be re-run from it
  // (out/<capture>.retry.js) without sending the data again. Errors come back as values, not throws.
  const call = (d) => `const RT=await figma.getNodeByIdAsync(${JSON.stringify(rt)});
const run=new (Object.getPrototypeOf(async function(){}).constructor)("figma","D","ICONS","THEME","PAGE","TARGET",RT.characters);
try { return { stored: STORED, ...(await run(figma,${d},${JSON.stringify(icons)},${JSON.stringify(theme)},${JSON.stringify(pageId)},${JSON.stringify(target)})) }; }
catch (e) { return { stored: STORED, error: String(e && e.stack || e).slice(0, 600) }; }`;
  const code = `const D=${JSON.stringify(D)};
const P1=await figma.getNodeByIdAsync("0:1");
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
let store=P1.findOne(n=>n.type==="TEXT"&&n.name===${JSON.stringify(`__figma-sync data ${capName} (temporary, delete)`)});
if(!store){store=figma.createText();store.name=${JSON.stringify(`__figma-sync data ${capName} (temporary, delete)`)};P1.appendChild(store);store.x=-4000;store.y=200;}
store.characters=JSON.stringify(D);store.visible=false;store.locked=true;
const STORED=store.id;
${call("D")}`;
  const retry = `const P1=await figma.getNodeByIdAsync("0:1");
const store=P1.findOne(n=>n.type==="TEXT"&&n.name===${JSON.stringify(`__figma-sync data ${capName} (temporary, delete)`)});
const STORED=store.id; const D=JSON.parse(store.characters);
${call("D")}`;
  writeFileSync(new URL(`out/${capName}.retry.js`, dir), retry);
  // Syntax check: the body must compile as an async function body.
  new (Object.getPrototypeOf(async function () {}).constructor)("figma", code);
  writeFileSync(new URL(`out/${capName}.js`, dir), code);
  console.log(`out/${capName}.js`, `${(code.length / 1024).toFixed(1)} KB`, missing.length ? `missing icons: ${missing.join(",")}` : "");
}
}
