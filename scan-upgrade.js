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
  ["Pantoprazole", ["pantoprazole", "pantocid", "pantop"]],
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
  for (const [name, kws] of MED_LIST) {
    if (kws.some(k => fuzzyHas(letters, k)))
      return { name: name + (mg ? " " + mg[1] + mg[2].toLowerCase() : "") };
  }
  return null;
}

const MONTHS = { JAN:1, FEB:2, MAR:3, APR:4, MAY:5, JUN:6, JUL:7, AUG:8, SEP:9, OCT:10, NOV:11, DEC:12 };
function fmtDate(y, mo) { return { label: String(mo).padStart(2, "0") + "/" + y, date: new Date(y, mo, 0), y, mo }; }

// Finds manufacture and expiry dates. Uses EXP / MFG words when readable, otherwise
// earlier date on the pack = manufactured, later date = expiry.
function parseDates(text) {
  const t = text.toUpperCase(), found = [];
  const add = (m, y, mo) => {
    if (y < 100) { if (y < 15 || y > 45) return; y += 2000; }
    if (y < 2015 || y > 2060 || !mo) return;
    const before = t.slice(Math.max(0, m.index - 12), m.index);
    const tag = /EXP|USE BEFORE|BEST BEFORE/.test(before) ? "exp" : /MFG|MFD|MF\.|MANUF/.test(before) ? "mfg" : "";
    found.push({ y, mo, tag, key: y * 12 + mo });
  };
  let m;
  const r1 = /(0[1-9]|1[0-2])\s*[\/\-\.]\s*(20\d{2}|\d{2})\b/g;
  while ((m = r1.exec(t))) add(m, +m[2], +m[1]);
  const r2 = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s.:\/\-]*'?(20\d{2}|\d{2})\b/g;
  while ((m = r2.exec(t))) add(m, +m[2], MONTHS[m[1]]);
  if (!found.length) return { mfg: null, exp: null };
  found.sort((a, b) => a.key - b.key);
  let exp = found.find(f => f.tag === "exp");
  let mfg = found.find(f => f.tag === "mfg");
  if (!exp && !mfg) {
    if (found.length >= 2) { mfg = found[0]; exp = found[found.length - 1]; }
    else exp = found[0];                                  // single untagged date: treat as expiry
  } else if (!exp && found.length >= 2) {
    exp = found.filter(f => f !== mfg).pop();
  } else if (!mfg && found.length >= 2) {
    mfg = found.filter(f => f !== exp)[0];
  }
  if (mfg && exp && mfg.key >= exp.key) mfg = null;
  return { mfg: mfg ? fmtDate(mfg.y, mfg.mo) : null, exp: exp ? fmtDate(exp.y, exp.mo) : null };
}
function parseExpiry(text) { return parseDates(text).exp; }

// Colour upscale only. (Grayscale/contrast-stretch made small foil print LESS readable in testing.)
async function colorImage(file, scale) {
  const img = await createImageBitmap(file);
  const s = Math.min(scale, 3200 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// Several OCR passes with different image sizes / page modes; stops early once both dates are found.
async function scanPasses(file) {
  const plan = [[2, "6"], [3, "6"], [3, "11"], [2, "3"], [3, "3"]];
  const texts = [];
  const worker = await Tesseract.createWorker("eng");
  try {
    for (let i = 0; i < plan.length; i++) {
      scanStatus.textContent = "Reading the label (" + (i + 1) + "/" + plan.length + ")...";
      try {
        const img = await colorImage(file, plan[i][0]);
        await worker.setParameters({ tessedit_pageseg_mode: plan[i][1] });
        const t = (await worker.recognize(img)).data.text || "";
        texts.push(t);
        const d = parseDates(t);
        if (d.exp && d.mfg && matchMedicine(texts.join(" "))) break;
      } catch (e) { /* skip a failed pass */ }
    }
  } finally { await worker.terminate(); }
  return texts;
}

function buildResult(texts) {
  let matched = null, best = null, bestScore = -1, bestText = texts[0] || "", batch = "unknown";
  for (const t of texts) {
    if (!matched) matched = matchMedicine(t);
    if (batch === "unknown") batch = extractBatch(t.toUpperCase());
    const d = parseDates(t), sc = (d.exp ? 2 : 0) + (d.mfg ? 1 : 0);
    if (sc > bestScore) { bestScore = sc; best = d; bestText = t; }
  }
  const r = {
    name: matched ? matched.name : "Unrecognised label",
    batch,
    mfg: best && best.mfg ? best.mfg.label : "not detected",
    expiry: best && best.exp ? best.exp.label : "not detected",
    ocrText: bestText
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
    const texts = await scanPasses(file);
    scanStatus.textContent = "";
    const result = buildResult(texts);
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
    : "Not found in database";
  const cls = status === "noexpiry" ? "unverified" : status;
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
  const matched = r.name !== "Unrecognised label";
  if (exp && exp < new Date()) return "expired";
  if (matched) return exp ? "verified" : "noexpiry";
  return "unverified";
}

function renderScanResult(r) {
  const el = document.getElementById("scanResult");
  const wasOpen = document.getElementById("ocrBox") && document.getElementById("ocrBox").style.display === "block";
  const missing = r.mfg === "not detected" || r.expiry === "not detected";
  el.innerHTML =
    '<div class="result-card"><div class="row"><div class="name">' + esc(r.name) + "</div>" + badgeHtml(r.status) + "</div>" +
    '<div class="meta">Batch: ' + esc(r.batch) + "</div>" +
    (missing ? '<div class="meta" style="margin:10px 0 6px;color:var(--amber);">Dates not fully read from the photo. Enter them from the pack:</div>' : '<div class="meta" style="margin:10px 0 6px;">Dates (tap to correct if wrong):</div>') +
    '<div class="form-row form"><div><label for="mfgIn">Manufactured</label><input type="month" id="mfgIn" value="' + toInput(r.mfg) + '" /></div>' +
    '<div><label for="expIn">Expires</label><input type="month" id="expIn" value="' + toInput(r.expiry) + '" /></div></div>' +
    '<button class="ghost" id="toggleOcrBtn">' + (wasOpen ? "Hide scanned text" : "Show scanned text") + "</button>" +
    '<div class="ocr" id="ocrBox" style="display:' + (wasOpen ? "block" : "none") + ';">' + esc(r.ocrText.trim().slice(0, 400) || "none") + "</div>" +
    '<button class="primary" style="margin-top:12px;" id="saveVaultBtn">Save to vault</button></div>';
  const onDate = () => {
    r.mfg = fromInput(document.getElementById("mfgIn").value);
    r.expiry = fromInput(document.getElementById("expIn").value);
    r.status = statusFor(r);
    renderScanResult(r);
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
