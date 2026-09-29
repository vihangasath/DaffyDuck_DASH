// Captures the visible screen as a compact layout tree for build.mjs → Figma.
// Loaded into the running app page (served by receiver.py), then: await __cap("d1-today")
// Boxes with a visual (fill, border, shadow, clip) become frames; text runs keep their font metrics;
// SVG icons are serialised with their computed colours; form fields contribute their value or placeholder.
(() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const colorCache = new Map();
  const colors = [];
  const colorIdx = new Map();
  // Any CSS colour (oklch, color-mix, rgba…) → [hex, alpha] via a 1px canvas.
  function norm(s) {
    if (!s || s === "transparent" || s === "none") return null;
    if (colorCache.has(s)) return colorCache.get(s);
    // rgb()/color(srgb) parse exactly; the canvas quantises low-alpha colours (premultiplied).
    const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/) || s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/);
    if (m) {
      const k = s.startsWith("color(") ? 255 : 1;
      const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      const out = a === 0 ? null : [[m[1], m[2], m[3]].map((v) => Math.round(Math.min(255, parseFloat(v) * k)).toString(16).padStart(2, "0")).join(""), Math.round(a * 100) / 100];
      colorCache.set(s, out);
      return out;
    }
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = s;
    cx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
    const out = a === 0 ? null : [[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join(""), Math.round((a / 255) * 100) / 100];
    colorCache.set(s, out);
    return out;
  }
  function col(s, op = 1) {
    const c = norm(s);
    if (!c) return null;
    const a = Math.round(c[1] * op * 100) / 100;
    if (a <= 0.01) return null;
    const key = a >= 0.995 ? c[0] : `${c[0]}/${a}`;
    if (!colorIdx.has(key)) {
      colorIdx.set(key, colors.length);
      colors.push(key);
    }
    return colorIdx.get(key);
  }
  const svgs = [];
  const svgIdx = new Map();
  const fonts = new Set();
  const R = (v) => Math.round(v * 2) / 2;

  function family(ff) {
    if (/courier/i.test(ff)) return "Courier Prime";
    if (/archivo/i.test(ff)) return "Archivo";
    return "Inter";
  }
  const STYLES = {
    Inter: { 100: "Thin", 200: "Extra Light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semi Bold", 700: "Bold", 800: "Extra Bold", 900: "Black" },
    Archivo: { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" },
    "Courier Prime": { 400: "Regular", 700: "Bold" },
  };
  function fontOf(cs) {
    const fam = family(cs.fontFamily);
    let w = Math.round(parseInt(cs.fontWeight, 10) / 100) * 100;
    if (fam === "Courier Prime") w = w >= 600 ? 700 : 400;
    let st = STYLES[fam][w] || "Regular";
    if (cs.fontStyle === "italic") st = st === "Regular" ? "Italic" : `${st} Italic`;
    fonts.add(`${fam}|${st}`);
    return [fam, st];
  }

  function shadows(s, op) {
    if (!s || s === "none") return null;
    const parts = s.split(/,(?![^()]*\))/);
    const out = [];
    for (const p of parts) {
      const cm = p.match(/(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|lab\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)/i);
      const nums = p.replace(cm ? cm[0] : "", "").match(/-?[\d.]+px/g) || [];
      const [x, y, b, sp] = nums.map((n) => parseFloat(n)).concat([0, 0, 0, 0]);
      const c = cm ? norm(cm[0]) : ["000000", 1];
      if (!c || c[1] * op < 0.01) continue;
      out.push([c[0], Math.round(c[1] * op * 100) / 100, R(x), R(y), R(b), R(sp), /inset/.test(p) ? 1 : 0]);
    }
    return out.length ? out : null;
  }

  function radius(cs, w, h) {
    const m = Math.min(w, h) / 2;
    const v = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map((k) => {
      const s = cs[k];
      const n = s.endsWith("%") ? (parseFloat(s) / 100) * Math.min(w, h) : parseFloat(s) || 0;
      return R(Math.min(n, m));
    });
    if (v.every((x) => x === 0)) return 0;
    return v.every((x) => x === v[0]) ? v[0] : v;
  }

  function border(cs, op) {
    const sides = ["Top", "Right", "Bottom", "Left"];
    const ws = sides.map((s) => (cs[`border${s}Style`] === "none" ? 0 : parseFloat(cs[`border${s}Width`]) || 0));
    if (ws.every((w) => w === 0)) return null;
    const i = ws.findIndex((w) => w > 0);
    const c = col(cs[`border${sides[i]}Color`], op);
    if (c == null) return null;
    return [c, ws.every((w) => w === ws[0]) ? ws[0] : ws, cs[`border${sides[i]}Style`] === "dashed" ? 1 : 0];
  }

  function label(el) {
    const a = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder");
    const tag = el.tagName.toLowerCase();
    const kind = { button: "Button", a: "Link", input: "Input", select: "Select", textarea: "Textarea", nav: "Nav", aside: "Sidebar", header: "Header", main: "Main", table: "Table", tr: "Row", li: "Item", label: "Field", dialog: "Dialog" }[tag] || (el.getAttribute("role") ? el.getAttribute("role")[0].toUpperCase() + el.getAttribute("role").slice(1) : "");
    let t = a || (el.innerText || "").trim().split("\n")[0];
    t = (t || "").replace(/\s+/g, " ").slice(0, 32);
    return kind ? (t ? `${kind} · ${t}` : kind) : t || tag;
  }

  const icons = {};
  function serialiseSvg(svg, rect, op) {
    // Lucide icons become instances of a shared icon component: name + colours only.
    const lucide = [...svg.classList].find((c) => c.startsWith("lucide-"));
    if (lucide) {
      const name = lucide.slice(7);
      if (!icons[name]) {
        const c = svg.cloneNode(true);
        c.removeAttribute("class");
        c.setAttribute("width", "24");
        c.setAttribute("height", "24");
        c.setAttribute("stroke", "#000000");
        c.querySelectorAll("*").forEach((d) => d.removeAttribute("class"));
        icons[name] = c.outerHTML.replace(/\s(aria-hidden|focusable|data-[\w-]+|role)="[^"]*"/g, "").replace(/\n\s*/g, "");
      }
      const cs = getComputedStyle(svg);
      const first = svg.querySelector("path,circle,rect,line,polyline,polygon,ellipse");
      const fcs = first ? getComputedStyle(first) : cs;
      const n = { k: "i", i: name, c: col(fcs.stroke !== "none" ? fcs.stroke : cs.color, op) };
      const fill = norm(fcs.fill);
      if (fill) n.fc = col(fcs.fill, op);
      const sw = parseFloat(fcs.strokeWidth);
      if (sw && sw !== 2) n.sw = sw;
      return n;
    }
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll("*")];
    const dst = [clone, ...clone.querySelectorAll("*")];
    src.forEach((s, i) => {
      const d = dst[i];
      const cs = getComputedStyle(s);
      d.removeAttribute("class");
      d.removeAttribute("style");
      if (s === svg) return;
      if (cs.display === "none") {
        d.remove();
        return;
      }
      const f = norm(cs.fill);
      const st = norm(cs.stroke);
      d.setAttribute("fill", f ? `#${f[0]}` : "none");
      if (f && f[1] < 1) d.setAttribute("fill-opacity", f[1]);
      d.setAttribute("stroke", st ? `#${st[0]}` : "none");
      if (st && st[1] < 1) d.setAttribute("stroke-opacity", st[1]);
      if (st) d.setAttribute("stroke-width", parseFloat(cs.strokeWidth) || 1);
      if (cs.strokeLinecap !== "butt") d.setAttribute("stroke-linecap", cs.strokeLinecap);
      if (cs.strokeLinejoin !== "miter") d.setAttribute("stroke-linejoin", cs.strokeLinejoin);
      if (cs.strokeDasharray && cs.strokeDasharray !== "none") d.setAttribute("stroke-dasharray", cs.strokeDasharray.replace(/px/g, ""));
      if (parseFloat(cs.opacity) < 1) d.setAttribute("opacity", cs.opacity);
      if (s.tagName.toLowerCase() === "text") {
        d.setAttribute("font-family", family(cs.fontFamily));
        d.setAttribute("font-size", parseFloat(cs.fontSize));
        d.setAttribute("font-weight", cs.fontWeight);
        fontOf(cs);
      }
    });
    clone.setAttribute("width", R(rect.width));
    clone.setAttribute("height", R(rect.height));
    if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const str = clone.outerHTML.replace(/\s(aria-hidden|focusable|data-[\w-]+|role)="[^"]*"/g, "").replace(/\n\s*/g, "");
    if (!svgIdx.has(str)) {
      svgIdx.set(str, svgs.length);
      svgs.push(str);
    }
    return { k: "v", s: svgIdx.get(str), o: op < 1 ? Math.round(op * 100) / 100 : undefined };
  }

  const collapse = (s, ws) => (/pre/.test(ws) ? s : s.replace(/\s+/g, " "));
  function textNode(tn, cs, op, clip, ox, oy) {
    const raw = collapse(tn.textContent, cs.whiteSpace);
    if (!raw.trim()) return null;
    const range = document.createRange();
    range.selectNodeContents(tn);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) return null;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const q of rects) {
      l = Math.min(l, q.left);
      t = Math.min(t, q.top);
      r = Math.max(r, q.right);
      b = Math.max(b, q.bottom);
    }
    const cxm = (l + r) / 2, cym = (t + b) / 2;
    if (cxm < clip[0] || cxm > clip[2] || cym < clip[1] || cym > clip[3]) return null;
    const c = col(cs.color, op);
    if (c == null) return null;
    const size = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === "normal" ? size * 1.21 : parseFloat(cs.lineHeight);
    const lines = new Set(rects.map((q) => Math.round(q.top))).size;
    let text = raw;
    // Collapsible spaces at line edges don't render: keep them only if the rendered width includes them.
    if (/^ | $/.test(text)) {
      cx.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
      const got = r - l;
      const opts = [text.trim(), text.trimEnd(), text.trimStart(), text];
      text = opts.reduce((best, o) => (Math.abs(cx.measureText(o).width - got) < Math.abs(cx.measureText(best).width - got) ? o : best), opts[0]);
    }
    // Single-line ellipsis: keep what is visible.
    const host = tn.parentElement;
    const hcs = getComputedStyle(host);
    if (hcs.textOverflow === "ellipsis" && host.scrollWidth > host.clientWidth + 1) {
      cx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
      const max = host.getBoundingClientRect().right - l - parseFloat(hcs.paddingRight);
      while (text.length > 1 && cx.measureText(text + "…").width > max) text = text.slice(0, -1);
      text = text.trimEnd() + "…";
      r = Math.min(r, host.getBoundingClientRect().right - parseFloat(hcs.paddingRight));
    }
    const [fam, st] = fontOf(cs);
    const ls = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing);
    const n = { k: "t", x: R(l - ox), y: R(t - (lh - rects[0].height) / 2 - oy), w: R(r - l), h: R(lines * lh), s: text, f: fam, st, z: size, lh: R(lh), c };
    if (ls) n.ls = Math.round(ls * 100) / 100;
    if (lines > 1) n.ml = 1;
    const tt = cs.textTransform;
    if (tt === "uppercase") n.tc = "U";
    else if (tt === "capitalize") n.tc = "T";
    else if (tt === "lowercase") n.tc = "L";
    if (cs.textDecorationLine.includes("line-through")) n.td = "S";
    else if (cs.textDecorationLine.includes("underline")) n.td = "U";
    if (["center", "right", "end"].includes(cs.textAlign)) n.al = cs.textAlign === "center" ? "C" : "R";
    return n;
  }

  // An element whose content is only text and plain inline elements becomes one text layer with styled
  // ranges ("OUT001 · Kollupitiya", "105%"), so Figma lays out the spacing itself.
  function plainInline(el, top) {
    for (const ch of el.childNodes) {
      if (ch.nodeType === 3) continue;
      if (ch.nodeType !== 1) return false;
      const t = ch.tagName.toLowerCase();
      if (["svg", "img", "input", "select", "textarea", "canvas", "br", "button"].includes(t)) return false;
      const cs = getComputedStyle(ch);
      if (cs.display === "none") continue;
      if (!cs.display.startsWith("inline") || cs.display === "inline-flex" || cs.display === "inline-grid") return false;
      if (norm(cs.backgroundColor) || (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth)) || cs.boxShadow !== "none") return false;
      if (parseFloat(cs.opacity) < 1 || cs.position === "absolute" || cs.position === "fixed") return false;
      if (!plainInline(ch, false)) return false;
    }
    return true;
  }
  function transform(s, tt) {
    if (tt === "uppercase") return s.toUpperCase();
    if (tt === "lowercase") return s.toLowerCase();
    if (tt === "capitalize") return s.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
    return s;
  }
  function mergedText(el, cs, op, clip, ox, oy) {
    const runs = [];
    let text = "";
    const rects = [];
    const walk = (node, ncs, o) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) {
          let s = transform(collapse(ch.textContent, ncs.whiteSpace), ncs.textTransform);
          if (!s) continue;
          if (text.endsWith(" ") && s.startsWith(" ")) s = s.slice(1);
          if (!text && s.startsWith(" ")) s = s.slice(1);
          if (!s) continue;
          const r = document.createRange();
          r.selectNodeContents(ch);
          rects.push(...[...r.getClientRects()].filter((q) => q.width > 0.5));
          const [fam, st] = fontOf(ncs);
          const c = col(ncs.color, o);
          const ls = ncs.letterSpacing === "normal" ? 0 : Math.round(parseFloat(ncs.letterSpacing) * 100) / 100;
          const deco = ncs.textDecorationLine.includes("line-through") ? "S" : ncs.textDecorationLine.includes("underline") ? "U" : "";
          runs.push({ n: s.length, f: `${fam}|${st}`, z: parseFloat(ncs.fontSize), c, ls, d: deco });
          text += s;
        } else if (ch.nodeType === 1) {
          const ccs = getComputedStyle(ch);
          if (ccs.display === "none") continue;
          walk(ch, ccs, o * parseFloat(ccs.opacity));
        }
      }
    };
    walk(el, cs, op);
    // Trailing collapsible space never renders.
    while (text.endsWith(" ")) {
      text = text.slice(0, -1);
      runs[runs.length - 1].n--;
      if (!runs[runs.length - 1].n) runs.pop();
    }
    if (!text.trim() || !rects.length || runs.some((r) => r.c == null)) return null;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const q of rects) {
      l = Math.min(l, q.left);
      t = Math.min(t, q.top);
      r = Math.max(r, q.right);
      b = Math.max(b, q.bottom);
    }
    const cxm = (l + r) / 2, cym = (t + b) / 2;
    if (cxm < clip[0] || cxm > clip[2] || cym < clip[1] || cym > clip[3]) return null;
    const size = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === "normal" ? size * 1.21 : parseFloat(cs.lineHeight);
    const lines = new Set(rects.map((q) => Math.round(q.top + q.height / 2))).size;
    const lineH = Math.max(...rects.map((q) => q.height));
    const top = Math.min(...rects.map((q) => q.top + q.height / 2)) - lh / 2;
    const n = { k: "m", x: R(l - ox), y: R(top - oy), w: R(r - l), h: R(lines * lh), s: text, lh: R(lh), runs };
    if (lines > 1) n.ml = 1;
    const al = cs.textAlign;
    if (al === "center") n.al = "C";
    else if (al === "right" || al === "end") n.al = "R";
    void lineH;
    return n;
  }

  function fieldText(el, cs, rect, op, ox, oy) {
    const tag = el.tagName.toLowerCase();
    let v = "";
    let ph = false;
    if (tag === "select") v = el.selectedOptions[0]?.text || "";
    else if (["checkbox", "radio", "range", "file", "hidden", "color"].includes(el.type)) return null;
    else {
      v = el.value;
      if (!v) {
        v = el.placeholder || "";
        ph = true;
      }
      if (el.type === "password" && !ph) v = "•".repeat(v.length);
    }
    if (!v) return null;
    const size = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === "normal" ? size * 1.21 : parseFloat(cs.lineHeight);
    const pl = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const pr = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
    const color = ph ? getComputedStyle(el, "::placeholder").color : cs.color;
    const [fam, st] = fontOf(cs);
    const multi = tag === "textarea";
    const top = multi ? rect.top + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth) : rect.top + (rect.height - lh) / 2;
    const n = { k: "t", x: R(rect.left + pl - ox), y: R(top - oy), w: R(rect.width - pl - pr), h: R(lh), s: v, f: fam, st, z: size, lh: R(lh), c: col(color, op), fx: 1 };
    if (multi) n.ml = 1;
    if (cs.textAlign === "center") n.al = "C";
    return n.c == null ? null : n;
  }

  function visit(el, clip, op, ox, oy) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return [];
    const o = op * parseFloat(cs.opacity);
    if (o < 0.02) return [];
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    // Map tiles are raster images: the map area gets a flat tint; markers and route lines stay vector.
    if (el.classList.contains("leaflet-tile-pane") || el.classList.contains("leaflet-shadow-pane")) return [];
    if (["script", "style", "noscript", "template", "link", "meta", "head"].includes(tag)) return [];
    if (el.classList.contains("sr-only") || (rect.width <= 1 && rect.height <= 1 && cs.position === "absolute" && cs.overflow === "hidden")) return [];
    const inView = rect.right > clip[0] && rect.left < clip[2] && rect.bottom > clip[1] && rect.top < clip[3];
    if (tag === "svg") {
      if (!inView || rect.width < 1) return [];
      return [{ ...serialiseSvg(el, rect, o), x: R(rect.left - ox), y: R(rect.top - oy), w: R(rect.width), h: R(rect.height) }];
    }
    const fill = col(cs.backgroundColor, o);
    const bd = border(cs, o);
    const sh = shadows(cs.boxShadow, o);
    const clips = cs.overflowX !== "visible" || cs.overflowY !== "visible" || tag === "input" || tag === "textarea" || tag === "select";
    const isImg = tag === "img" || tag === "canvas" || tag === "video";
    let grad = null;
    if (cs.backgroundImage && cs.backgroundImage.startsWith("linear-gradient")) {
      const stops = cs.backgroundImage.match(/(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|lab\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/gi) || [];
      grad = stops.map((s) => col(s, o)).filter((x) => x != null);
      if (grad.length < 2) grad = null;
    }
    const visual = fill != null || bd || sh || grad || isImg || (clips && rect.width > 0);
    const nclip = clips ? [Math.max(clip[0], rect.left), Math.max(clip[1], rect.top), Math.min(clip[2], rect.right), Math.min(clip[3], rect.bottom)] : clip;
    if (!inView && cs.position !== "fixed" && !clips) {
      // Off-screen boxes can still hold absolutely positioned descendants on screen; keep walking.
    } else if (!inView) return [];
    let node = null;
    let cox = ox, coy = oy;
    if (visual && inView) {
      node = { k: "b", n: label(el), x: R(rect.left - ox), y: R(rect.top - oy), w: R(rect.width), h: R(rect.height) };
      if (fill != null) node.f = fill;
      if (el.classList.contains("leaflet-container")) {
        node.n = "Map · OpenStreetMap tiles";
        node.f = col("#e3eaee");
      }
      if (grad) node.g = grad;
      if (bd) node.b = bd;
      if (sh) node.sh = sh;
      const rr = radius(cs, rect.width, rect.height);
      if (rr) node.r = rr;
      if (clips && tag !== "input") node.clip = 1;
      if (isImg) node.img = tag === "img" ? el.getAttribute("src") || "" : tag;
      cox = rect.left;
      coy = rect.top;
    }
    const kids = [];
    // A drawn canvas (the signature pad) is traced column by column into a vector path.
    if (tag === "canvas" && node && inView) {
      try {
        const g = el.getContext("2d");
        const { width: bw, height: bh } = el;
        const img = g.getImageData(0, 0, bw, bh).data;
        const sx = rect.width / bw, sy = rect.height / bh;
        const step = Math.max(1, Math.round(2 / sx));
        const segs = [];
        let cur = [];
        let ink = null;
        for (let x = 0; x < bw; x += step) {
          let sum = 0, n = 0;
          for (let y = 0; y < bh; y++) {
            const i = (y * bw + x) * 4;
            if (img[i + 3] > 128) {
              sum += y;
              n++;
              if (!ink) ink = [img[i], img[i + 1], img[i + 2]];
            }
          }
          if (n) cur.push(`${R(x * sx)},${R((sum / n) * sy)}`);
          else if (cur.length) {
            segs.push(cur);
            cur = [];
          }
        }
        if (cur.length) segs.push(cur);
        if (segs.length) {
          const hex = ink ? ink.map((v) => v.toString(16).padStart(2, "0")).join("") : "0f1d30";
          const paths = segs.filter((s) => s.length > 1).map((s) => `<polyline points="${s.join(" ")}" fill="none" stroke="#${hex}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${R(rect.width)}" height="${R(rect.height)}" viewBox="0 0 ${R(rect.width)} ${R(rect.height)}">${paths}</svg>`;
          svgs.push(svg);
          kids.push({ k: "v", s: svgs.length - 1, x: 0, y: 0, w: R(rect.width), h: R(rect.height) });
          node.img = "signature";
        }
      } catch {
        /* tainted canvas: leave the placeholder */
      }
    }
    if (["input", "select", "textarea"].includes(tag)) {
      const t = fieldText(el, cs, rect, o, cox, coy);
      if (t) kids.push(t);
      if (el.type === "checkbox" || el.type === "radio") {
        if (!node) node = { k: "b", n: label(el), x: R(rect.left - ox), y: R(rect.top - oy), w: R(rect.width), h: R(rect.height), b: [col("#c4d0df"), 1.5, 0], r: el.type === "radio" ? R(rect.width / 2) : 3 };
        if (el.checked) node.f = col(cs.accentColor && cs.accentColor !== "auto" ? cs.accentColor : "#008289");
      }
    } else if (!isImg) {
      const textKids = [...el.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim());
      const elKids = [...el.childNodes].filter((c) => c.nodeType === 1);
      if ((textKids.length > 1 || (textKids.length && elKids.length) || (elKids.length && el.textContent.trim())) && plainInline(el, true)) {
        const t = mergedText(el, cs, o, nclip, cox, coy);
        if (t) kids.push(t);
      } else for (const ch of el.childNodes) {
        if (ch.nodeType === 3) {
          const t = textNode(ch, cs, o, nclip, cox, coy);
          if (t) kids.push(t);
        } else if (ch.nodeType === 1) kids.push(...visit(ch, nclip, o, cox, coy));
      }
    }
    // Paint order: sticky/fixed/z-indexed boxes draw above their in-flow siblings, as in the browser.
    kids.sort((a, b) => (a.z || 0) - (b.z || 0));
    const pos = cs.position;
    const z = pos === "fixed" || pos === "sticky" ? 2 : pos !== "static" && parseInt(cs.zIndex, 10) > 0 ? 1 : 0;
    if (node) {
      if (kids.length) node.ch = kids;
      if (z) node.z = z;
      return [node];
    }
    if (z) for (const k of kids) k.z = Math.max(k.z || 0, z);
    return kids;
  }

  window.__cap = async (name, opts = {}) => {
    colors.length = 0;
    colorIdx.clear();
    svgs.length = 0;
    svgIdx.clear();
    for (const k of Object.keys(icons)) delete icons[k];
    fonts.clear();
    // Hide scrollbars so the layout uses the full viewport width, as on a phone or a design frame.
    const sb = document.createElement("style");
    sb.textContent = "*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}";
    document.head.appendChild(sb);
    // Entrance animations don't tick while the tab isn't composited: jump them to their end state.
    for (const a of document.getAnimations()) {
      try {
        if (a.effect?.getTiming().iterations !== Infinity) a.finish();
        else a.cancel();
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 60));
    const W = window.innerWidth, H = window.innerHeight;
    const clip = [0, 0, W, H];
    const bodyBg = norm(getComputedStyle(document.body).backgroundColor) || norm(getComputedStyle(document.documentElement).backgroundColor) || ["ffffff", 1];
    const kids = visit(document.body, clip, 1, 0, 0);
    const out = { name, w: W, h: H, bg: bodyBg[0], colors, svgs, fonts: [...fonts], icons, ch: kids, url: location.pathname };
    sb.remove();
    const body = JSON.stringify(out);
    const res = await fetch(`http://127.0.0.1:8765/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    return { W, H, ...(await res.json()), nodes: body.split('"k":').length - 1, colors: colors.length, svgs: svgs.length };
  };
  return "capture ready";
})();
