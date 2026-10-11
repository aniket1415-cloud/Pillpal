// Pillpal scan upgrade: fuzzy name matching, brand names, bigger list, better expiry parsing, image cleanup before OCR.
// Loaded AFTER the main script, so these definitions replace the originals.

const MED_LIST = [
  ["Paracetamol", ["paracetamol", "acetaminophen", "paracip", "crocin", "dolo", "calpol", "pacimol"]],
  ["Ibuprofen", ["ibuprofen", "brufen", "ibugesic"]],
  ["Ibuprofen + Paracetamol", ["combiflam"]],
  ["Metformin", ["metformin", "glycomet", "glucophage"]],
  ["Amoxicillin", ["amoxicillin", "amoxycillin", "amoxil", "novamox"]],
  ["Amoxicillin + Clavulanic acid", ["augmentin", "clavulanic", "clavam"]],
  ["Atorvastatin", ["atorvastatin", "atorva", "lipitor"]],
  ["Rosuvastatin", ["rosuvastatin", "rosuvas", "crestor"]],
  ["Cetirizine", ["cetirizine", "cetzine", "okacet", "alerid"]],
  ["Levocetirizine", ["levocetirizine", "levocet", "xyzal"]],
  ["Azithromycin", ["azithromycin", "azithral", "azee", "zithromax"]],
  ["Pantoprazole + Domperidone", [], /\bPAN[\s\-\u2013\u2014]*(?:D\b|0\b|\[[\s1Il|D]*\]|\[\)|\|\)|I\)|\]|\(\))/i],
  ["Pantoprazole", ["pantoprazole", "pantocid", "pantop"], /\bPAN[\s\-]*(?:40|20)\b/i],
  ["Omeprazole", ["omeprazole", "omez", "prilosec"]],
  ["Rabeprazole", ["rabeprazole", "razo"]],
  ["Amlodipine", ["amlodipine", "amlodac", "norvasc"]],
  ["Losartan", ["losartan", "losacar", "cozaar"]],
  ["Telmisartan", ["telmisartan", "telma", "micardis"]],
  ["Aspirin", ["aspirin", "ecosprin", "disprin"]],
  ["Diclofenac", ["diclofenac", "voveran", "voltaren"]],
  ["Montelukast", ["montelukast", "montair", "singulair"]],
  ["Ondansetron", ["ondansetron", "ondem", "zofer"]],
  ["Domperidone", ["domperidone", "domstal", "motilium"]],
  ["Ciprofloxacin", ["ciprofloxacin", "ciplox", "cipro"]],
  ["Ofloxacin", ["ofloxacin", "zanocin"]],
  ["Doxycycline", ["doxycycline", "doxy"]],
  ["Cefixime", ["cefixime", "taxim", "zifi"]],
  ["Cefuroxime", ["cefuroxime", "ceftum", "zinnat"]],
  ["Metronidazole", ["metronidazole", "flagyl", "metrogyl"]],
  ["Salbutamol", ["salbutamol", "asthalin", "ventolin"]],
  ["Ranitidine", ["ranitidine", "zinetac", "rantac"]],
  ["Levothyroxine", ["levothyroxine", "thyronorm", "eltroxin"]],
  ["Glimepiride", ["glimepiride", "amaryl", "glimy"]],
  ["Metoprolol", ["metoprolol", "metolar", "betaloc"]],
  ["Clopidogrel", ["clopidogrel", "clopitab", "plavix"]],
  ["Folic acid", ["folic", "folvite"]],
  ["Vitamin D3", ["cholecalciferol", "calcirol"]],
  ["Vitamin C", ["ascorbic", "limcee"]],
  ["Multivitamin", ["becosules", "supradyn", "multivitamin"]],
  ["Loperamide", ["loperamide", "imodium", "eldoper"]],
  ["ORS / Electrolytes", ["electral"]],
  ["Ivermectin", ["ivermectin", "ivecop"]],
  ["Fluconazole", ["fluconazole", "forcan", "zocon"]]
];

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function fuzzyHas(letters, kw) {
  if (letters.includes(kw)) return true;
  if (kw.length < 7) return false;            // short brand names must match exactly
  const maxErr = Math.floor(kw.length * 0.25);
  for (let len = kw.length - 1; len <= kw.length + 1; len++)
    for (let i = 0; i + len <= letters.length; i++)
      if (lev(letters.substr(i, len), kw) <= maxErr) return true;
  return false;
}

function matchMedicine(text) {
  const letters = text.toLowerCase().replace(/[^a-z]/g, "");
  const mg = text.match(/(\d{2,4})\s*(mg|mcg)\b/i);
  for (const [name, kws, rx] of MED_LIST) {
    if ((rx && rx.test(text)) || kws.some(k => fuzzyHas(letters, k)))
      return { name: name + (mg ? " " + mg[1] + mg[2].toLowerCase() : "") };
  }
  return null;
}

const MONTHS = { JAN:1, FEB:2, MAR:3, APR:4, MAY:5, JUN:6, JUL:7, AUG:8, SEP:9, OCT:10, NOV:11, DEC:12 };
function fmtDate(y, mo) { return { label: String(mo).padStart(2, "0") + "/" + y, date: new Date(y, mo, 0), y, mo }; }

// Finds manufacture and expiry dates. Uses EXP / MFG words when readable, otherwise
// earlier date on the pack = manufactured, later date = expiry.
const MON_NAMES = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
// Finds manufacture and expiry dates. Uses EXP / MFG words when readable, otherwise
// earlier date on the pack = manufactured, later date = expiry. Never guesses from unreadable years.
function normSlips(t) {
  t = t.replace(/\b(FE[RA8H]|JAM|AUC|SFP|DFC)(?=[\s.:\/\-]*'?\d)/g,
    w => ({ FER: "FEB", FEA: "FEB", FE8: "FEB", FEH: "FEB", JAM: "JAN", AUC: "AUG", SFP: "SEP", DFC: "DEC" })[w]);   // common OCR slips
  t = t.replace(/[)\]|!1I0O]UL(?=[\s.:\/\-]*'?\d)/g, "JUL");           // ")UL", "1UL", "0UL" are JUL
  t = t.replace(/[E\u00A3]\s*[%\u00D7X]\s*P(?=[.\s:])/g, "EXP");     // "\u00A3%P." is EXP.
  return t;
}

function parseDates(text) {
  const t = normSlips(text.toUpperCase());
  let found = [];
  const tagAt = i => {
    const before = t.slice(Math.max(0, i - 12), i);
    return /EXP|USE BEFORE|BEST BEFORE/.test(before) ? "exp" : /MFG|MFD|MF\.|MANUF/.test(before) ? "mfg" : "";
  };
  const add = (m, y, mo) => {
    if (y < 100) { if (y < 15 || y > 45) return; y += 2000; }
    if (y < 2015 || y > 2060 || !mo) return;
    const refined = /^\s*\[R\]/.test(t.slice(m.index + m[0].length));   // year confirmed by the close-up re-read
    found.push({ y, mo, tag: tagAt(m.index), key: y * 12 + mo, refined });
  };
  let m;
  const r1 = /(0[1-9]|1[0-2])\s*[\/\-\.]\s*(20\d{2}|\d{2})\b/g;
  while ((m = r1.exec(t))) add(m, +m[2], +m[1]);
  const r2 = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s.:\/\-]*'?(20\d{2}|\d{2})\b/g;
  while ((m = r2.exec(t))) add(m, +m[2], MONTHS[m[1]]);
  // an EXP line whose year is cut off, e.g. "EXP. JAN.202?"
  let partialExp = null;
  const rp = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s.:\/\-]*'?20\d?(?!\d)/g;
  while ((m = rp.exec(t))) if (tagAt(m.index) === "exp") partialExp = m[1];

  let mfg = null, exp = null, unsure = null, note = "";
  const lab = f => MON_NAMES[f.mo] + " " + f.y;
  if (found.length) {
    const uniq = new Map();                                // same date seen in several passes counts once
    for (const f of found) { const e = uniq.get(f.key); if (!e) uniq.set(f.key, f); else { if (!e.tag && f.tag) e.tag = f.tag; if (f.refined) e.refined = true; } }
    found = [...uniq.values()];
    const refinedSet = found.filter(f => f.refined);       // a close-up year overrides other readings of the same month
    found = found.filter(f => f.refined || !refinedSet.some(r => r.mo === f.mo && r.y !== f.y)).sort((a, b) => a.key - b.key);
    exp = found.find(f => f.tag === "exp");
    mfg = found.find(f => f.tag === "mfg");
    if (!exp && !mfg) {
      if (found.length >= 2) { mfg = found[0]; exp = found[found.length - 1]; }
      else unsure = found[0];                              // one date, no EXP/MFG label: do not guess
    } else if (!exp && found.length >= 2) {
      exp = found.filter(f => f !== mfg).pop();
    } else if (!mfg && found.length >= 2) {
      mfg = found.filter(f => f !== exp)[0];
    }
    if (mfg && exp && mfg.key >= exp.key) {                // expiry must come after manufacture
      if (mfg.tag && exp.tag) {
        note = "Read expiry as " + lab(exp) + ", which is not after the manufacture date (" + lab(mfg) + "). One is probably misread. Please check both.";
        exp = null;
      } else if (exp.tag) mfg = null;
      else if (mfg.tag) exp = null;
      else mfg = null;
    }
  }
  if (!note && exp && exp.refined) note = "Expiry year (" + exp.y + ") was read from a close-up of the pack. Please confirm it matches.";
  if (!note && exp && !exp.refined && partialExp && partialExp === MON_NAMES[exp.mo]) note = "Please double-check the expiry year. It read inconsistently on the photo.";
  if (!note && !exp && partialExp) note = "Expiry looks like " + partialExp + " but the year could not be read clearly. Please set it below.";
  if (!note && unsure) note = "Found " + lab(unsure) + " on the pack but could not tell if it is the manufacture or expiry date. Please set both below.";
  return { mfg: mfg ? fmtDate(mfg.y, mfg.mo) : null, exp: exp ? fmtDate(exp.y, exp.mo) : null, unsure: unsure ? fmtDate(unsure.y, unsure.mo) : null, note };
}
function parseExpiry(text) { return parseDates(text).exp; }

function extractBatch(text) {
  const t = text.toUpperCase();
  let m = t.match(/\b(?:B\.?\s*NO|BATCH(?:\s*NO)?|B\.?\s*N\.?)\s*[.:\-]?\s*([A-Z0-9]{4,12})\b/);
  if (m && /\d/.test(m[1])) return m[1];
  m = t.match(/\b([A-Z]{1,3}\d{3,6})\b/);
  return m ? m[1] : "unknown";
}

// Colour upscale only. (Grayscale/contrast-stretch made small foil print LESS readable in testing.)
async function colorImage(file, scale) {
  const img = await createImageBitmap(file);
  const s = Math.min(scale, 3200 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const matchAny = arr => { for (const t of arr) { const m = matchMedicine(t); if (m) return m; } return null; };

async function rotatedImage(file, deg, scale) {
  const img = await createImageBitmap(file);
  const s = Math.min(scale, 3200 / Math.max(img.width, img.height));
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const c = document.createElement("canvas"); c.width = h; c.height = w;
  const ctx = c.getContext("2d");
  if (deg === 90) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); } else { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

// Dates are tiny print: read the photo in overlapping horizontal bands, bottom first, each enlarged.
// Pick the last digit of a year whose first 3 digits are known (e.g. "202?"). Each close-up reading can be a
// slightly wrong or incomplete read, so a digit d only counts when readings fit 202d and no other 202x.
// Needs 3+ agreeing readings, and the runner-up must have at most a third of the winner's support.
function inferYear(readings, prefix) {
  if (prefix.length !== 3) return null;
  const isSubseq = (a, b) => { let i = 0; for (const ch of b) if (ch === a[i]) i++; return i === a.length; };
  const support = {};
  for (const r of readings) {
    if (r.length < 3 || r.length > 4 || !r.startsWith("20") || r === prefix) continue;
    const fits = [];
    for (let d = 0; d <= 9; d++) if (isSubseq(r, prefix + d)) fits.push(d);
    if (fits.length === 1) support[fits[0]] = (support[fits[0]] || 0) + 1;     // reading points to exactly one digit
  }
  const ranked = Object.entries(support).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 3) return null;
  if (ranked[1] && ranked[1][1] * 3 > ranked[0][1]) return null;
  const year = +(prefix + ranked[0][0]);
  return year >= 2015 && year <= 2060 ? String(year) : null;
}

// Close-up re-read of a partly-read year (e.g. "JAN.202?"): tight crop around the year, enlarged 4-6x,
// digits only. Needs 2+ agreeing readings starting with the digits already seen, otherwise it is ignored.
async function refineYears(c, data, worker, texts) {
  const lines = data.lines || (data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines));
  const rp = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s.:\/\-]*'?(20\d?)(?!\d)\S?/;
  try {
    for (const line of lines) {
      const up = normSlips((line.text || "").toUpperCase());
      const m = rp.exec(up);
      if (!m) continue;
      const ws = line.words || [];
      let mi = ws.findIndex(w => normSlips(w.text.toUpperCase()).includes(m[1]));
      if (mi < 0) continue;
      let ti = ws.findIndex((w, i) => i >= mi && /20\d?\S?$/.test(w.text));
      if (ti < 0) continue;
      const w = ws[ti].bbox, startFrac = ti === mi ? 0.45 : 0;
      const x0 = Math.max(0, w.x0 + Math.round((w.x1 - w.x0) * startFrac)), y0 = Math.max(0, w.y0 - 12);
      const cw = Math.min(c.width - x0, (w.x1 - x0) + 60), ch = Math.min(c.height - y0, (w.y1 - w.y0) + 24);
      if (cw < 10 || ch < 10) continue;
      const readings = [];
      const fracs = ti === mi ? [0.45, 0.6] : [0, 0.15];
      for (const frac of fracs) for (const pad of [20, 40, 60]) for (const z of [3, 5]) {
        const x0 = Math.max(0, w.x0 + Math.round((w.x1 - w.x0) * frac)), y0 = Math.max(0, w.y0 - 12);
        const cw = Math.min(c.width - x0, (w.x1 - x0) + pad), ch = Math.min(c.height - y0, (w.y1 - w.y0) + 24);
        if (cw < 10 || ch < 10) continue;
        const zc = document.createElement("canvas");
        zc.width = cw * z; zc.height = ch * z;
        const g = zc.getContext("2d"); g.imageSmoothingQuality = "high";
        g.drawImage(c, x0, y0, cw, ch, 0, 0, zc.width, zc.height);
        for (const psm of ["8", "13", "7"]) {
          await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: "0123456789" });
          readings.push(((await worker.recognize(zc)).data.text || "").replace(/\D/g, ""));
        }
      }
      const year = inferYear(readings, m[2]);
      if (year) texts.push(up.replace(m[0], m[1] + "." + year) + " [R]");
    }
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
  }
}

async function bandPass(file, worker, texts, onStep) {
  const img = await createImageBitmap(file);
  const bh = Math.round(img.height * 0.20), step = Math.round(img.height * 0.10);
  const ys = [];
  for (let y = img.height - bh; y >= 0; y -= step) ys.push(y);
  if (ys[ys.length - 1] !== 0) ys.push(0);
  const scale = Math.min(2, 4200 / img.width);
  await worker.setParameters({ tessedit_pageseg_mode: "6" });
  for (let i = 0; i < ys.length; i++) {
    onStep("Zooming in on small print (" + (i + 1) + "/" + ys.length + ")...");
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(bh * scale);
    c.getContext("2d").drawImage(img, 0, ys[i], img.width, bh, 0, 0, c.width, c.height);
    const res = (await worker.recognize(c)).data;
    texts.push(res.text || "");
    try { await refineYears(c, res, worker, texts); } catch (e) { /* optional step */ }
    const d = parseDates(texts.join("\n"));
    if (d.exp && d.mfg) break;
  }
}

// Several OCR passes. Returns { texts: used for dates + name, nameOnly: rotated passes, used only for the name }.
async function scanPasses(file) {
  const texts = [], nameOnly = [];
  const worker = await Tesseract.createWorker("eng");
  const say = m => { scanStatus.textContent = m; };
  const done = () => { const d = parseDates(texts.join("\n")); return d.exp && d.mfg && matchAny(texts.concat(nameOnly)); };
  const full = async (scale, psm, label) => {
    say(label);
    try {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      texts.push((await worker.recognize(await colorImage(file, scale))).data.text || "");
    } catch (e) { /* skip a failed pass */ }
  };
  try {
    await full(2, "6", "Reading the label...");
    if (!done()) {
      const d = parseDates(texts.join("\n"));
      if (!(d.exp && d.mfg)) { try { await bandPass(file, worker, texts, say); } catch (e) {} }
    }
    if (!matchAny(texts.concat(nameOnly))) {
      for (const deg of [90, 270]) {                       // brand names are often printed sideways on strips
        say("Checking the label from another angle...");
        try {
          await worker.setParameters({ tessedit_pageseg_mode: "6" });
          nameOnly.push((await worker.recognize(await rotatedImage(file, deg, 2))).data.text || "");
        } catch (e) {}
        if (matchAny(nameOnly)) break;
      }
    }
    for (const [sc, psm] of [[3, "6"], [3, "11"]]) {        // extra passes only if something is still missing
      if (done()) break;
      await full(sc, psm, "Reading the label again...");
    }
  } finally { await worker.terminate(); }
  return { texts, nameOnly };
}

function buildResult(texts, nameOnly = []) {
  let matched = null, batch = "unknown";
  for (const t of texts.concat(nameOnly)) { if (!matched) matched = matchMedicine(t); }
  for (const t of texts) { if (batch === "unknown") batch = extractBatch(t); }
  const d = parseDates(texts.join("\n"));                 // combine dates found across all passes
  const r = {
    name: matched ? matched.name : "Unrecognised label",
    batch,
    mfg: d.mfg ? d.mfg.label : "not detected",
    expiry: d.exp ? d.exp.label : "not detected",
    note: d.note || "",
    ocrText: texts.concat(nameOnly).join("\n-----\n")
  };
  r.status = statusFor(r);
  return r;
}

async function handleScanFile(file) {
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  document.getElementById("scanBox").style.display = "none";
  document.getElementById("scanResult").innerHTML = "";
  scanStatus.textContent = "Reading the label...";
  if (typeof Tesseract === "undefined") {
    scanStatus.textContent = "OCR needs an internet connection the first time it loads. Check your connection and try again.";
    return;
  }
  try {
    const { texts, nameOnly } = await scanPasses(file);
    scanStatus.textContent = "";
    const result = buildResult(texts, nameOnly);
    currentScan = result;
    renderScanResult(result);
  } catch (e) {
    scanStatus.textContent = "Could not read the label. Try a clearer, closer photo.";
  }
}

// ---------- Result card, vault and verification (adds manufactured date + "Show scanned text") ----------
const _style = document.createElement("style");
_style.textContent = ".result-card .meta b{color:var(--ink);} .result-card .meta{margin-bottom:2px;}";
document.head.appendChild(_style);

function badgeHtml(status) {
  const label = status === "verified" ? "Name matched, in date"
    : status === "expired" ? "Expired"
    : status === "noexpiry" ? "Name matched, expiry not read"
    : status === "entered" ? "Details entered by you"
    : "Not found in database";
  const cls = (status === "noexpiry" || status === "entered") ? "unverified" : status;
  return '<span class="badge ' + cls + '">' + label + "</span>";
}

function runVerification(ocrText) {
  const matched = matchMedicine(ocrText);
  const d = parseDates(ocrText);
  let status = "unverified";
  if (d.exp && d.exp.date < new Date()) status = "expired";
  else if (matched) status = d.exp ? "verified" : "noexpiry";
  return {
    name: matched ? matched.name : "Unrecognised label",
    batch: extractBatch(ocrText.toUpperCase()),
    mfg: d.mfg ? d.mfg.label : "not detected",
    expiry: d.exp ? d.exp.label : "not detected",
    status, ocrText
  };
}

const toInput = l => { const m = /^(\d{2})\/(\d{4})$/.exec(l); return m ? m[2] + "-" + m[1] : ""; };
const fromInput = v => { const m = /^(\d{4})-(\d{2})$/.exec(v); return m ? m[2] + "/" + m[1] : "not detected"; };
function statusFor(r) {
  const m = /^(\d{2})\/(\d{4})$/.exec(r.expiry);
  const exp = m ? new Date(+m[2], +m[1], 0) : null;
  if (exp && exp < new Date()) return "expired";
  if (r.manual) return "entered";                          // name typed by the user, not in our list
  if (r.name !== "Unrecognised label") return exp ? "verified" : "noexpiry";
  return "unverified";
}

function renderScanResult(r) {
  const el = document.getElementById("scanResult");
  const wasOpen = document.getElementById("ocrBox") && document.getElementById("ocrBox").style.display === "block";
  const missing = r.mfg === "not detected" || r.expiry === "not detected";
  el.innerHTML =
    '<div class="result-card"><div class="row"><div class="name">' + esc(r.name) + "</div>" + badgeHtml(r.status) + "</div>" +
    ((r.name === "Unrecognised label" || r.manual) ?
      '<div class="form" style="margin-top:10px;"><label for="nameIn">' + (r.manual ? "Medicine name (entered by you)" : "Not recognised. Type the medicine name from the pack:") + '</label>' +
      '<input id="nameIn" list="medNames" placeholder="e.g. Pan-D, Dolo 650" value="' + esc(r.manual ? r.name : "") + '" />' +
      '<datalist id="medNames">' + MED_LIST.map(x => '<option value="' + esc(x[0]) + '">').join("") + "</datalist></div>" : "") +
    '<div class="meta">Batch: ' + esc(r.batch) + "</div>" +
    (r.note ? '<div class="meta" style="margin-top:6px;color:var(--amber);">' + esc(r.note) + "</div>" : "") +
    (missing ? '<div class="meta" style="margin:10px 0 6px;color:var(--amber);">Dates not fully read from the photo. Enter them from the pack:</div>' : '<div class="meta" style="margin:10px 0 6px;">Dates (tap to correct if wrong):</div>') +
    '<div class="form-row form"><div><label for="mfgIn">Manufactured</label><input type="month" id="mfgIn" value="' + toInput(r.mfg) + '" /></div>' +
    '<div><label for="expIn">Expires</label><input type="month" id="expIn" value="' + toInput(r.expiry) + '" /></div></div>' +
    '<button class="ghost" id="toggleOcrBtn">' + (wasOpen ? "Hide scanned text" : "Show scanned text") + "</button>" +
    '<div class="ocr" id="ocrBox" style="display:' + (wasOpen ? "block" : "none") + ';">' + esc(r.ocrText.trim().slice(0, 900) || "none") + "</div>" +
    '<button class="primary" style="margin-top:12px;" id="saveVaultBtn">Save to vault</button></div>';
  const onDate = () => {
    r.mfg = fromInput(document.getElementById("mfgIn").value);
    r.expiry = fromInput(document.getElementById("expIn").value);
    r.note = "";
    r.status = statusFor(r);
    setTimeout(() => renderScanResult(r), 0);
  };
  const nameIn = document.getElementById("nameIn");
  if (nameIn) nameIn.onchange = () => {
    const v = nameIn.value.trim();
    const known = v ? matchMedicine(v) : null;             // typing "Pan-D" or "Dolo" maps to the known medicine
    r.name = known ? known.name : (v || "Unrecognised label");
    r.manual = !!v && !known;
    r.status = statusFor(r);
    setTimeout(() => renderScanResult(r), 0);              // redraw after the input finishes its own events
  };
  document.getElementById("mfgIn").onchange = onDate;
  document.getElementById("expIn").onchange = onDate;
  document.getElementById("toggleOcrBtn").onclick = function () {
    const box = document.getElementById("ocrBox");
    const show = box.style.display === "none";
    box.style.display = show ? "block" : "none";
    this.textContent = show ? "Hide scanned text" : "Show scanned text";
  };
  document.getElementById("saveVaultBtn").onclick = async function () {
    const row = { name: r.name, batch: r.batch, expiry: r.expiry, mfg: r.mfg, status: r.status };
    let res = await sb.from("medicines").insert(row).select().single();
    if (res.error) { delete row.mfg; res = await sb.from("medicines").insert(row).select().single(); }
    if (res.error) return showToast("Could not save");
    vault.push({ id: res.data.id, name: r.name, batch: r.batch, expiry: r.expiry, mfg: res.data.mfg || r.mfg, status: r.status });
    renderVault(); renderHome();
    showToast("Saved to vault");
  };
}

function renderVault() {
  const el = document.getElementById("vaultList");
  if (!vault.length) {
    el.innerHTML = '<div class="empty">No saved medicines yet. Scan one to add it here.</div>';
    return;
  }
  el.innerHTML = vault.map((v, i) =>
    '<div class="list-item"><div><div class="name">' + esc(v.name) + '</div><div class="meta">Mfg ' + esc(v.mfg || "not detected") +
    " &middot; Exp " + esc(v.expiry) + " &middot; Batch " + esc(v.batch) + '</div></div><div style="display:flex;align-items:center;gap:8px;">' + badgeHtml(v.status) +
    '<button class="small" onclick="deleteVault(' + i + ')" aria-label="Remove"><svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div></div>'
  ).join("");
}

async function loadCloud() {
  const [m, r] = await Promise.all([
    sb.from("medicines").select("*").order("created_at"),
    sb.from("reminders").select("*").order("time")
  ]);
  vault = (m.data || []).map(x => ({ id: x.id, name: x.name, batch: x.batch, expiry: x.expiry, mfg: x.mfg, status: x.status }));
  reminders = (r.data || []).map(x => ({ id: x.id, medicine: x.medicine_name, time: x.time, freq: x.frequency }));
  renderHome(); renderReminders(); renderVault();
}
