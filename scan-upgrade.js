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
function parseExpiry(text) {
  const t = text.toUpperCase(), found = [];
  let m;
  const r1 = /(0[1-9]|1[0-2])\s*[\/\-\.]\s*(20\d{2}|\d{2})\b/g;
  while ((m = r1.exec(t))) { let y = +m[2]; if (y < 100) y += 2000; found.push([y, +m[1]]); }
  const r2 = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s.:\/\-]*'?(20\d{2}|\d{2})\b/g;
  while ((m = r2.exec(t))) { let y = +m[2]; if (y < 100) y += 2000; found.push([y, MONTHS[m[1]]]); }
  const ok = found.filter(([y]) => y >= 2015 && y <= 2060);
  if (!ok.length) return null;
  ok.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const [y, mo] = ok[ok.length - 1];       // latest date on the pack = expiry (earlier one is usually manufacture date)
  return { label: String(mo).padStart(2, "0") + "/" + y, date: new Date(y, mo, 0) };
}

async function prepImage(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(2, 2000 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < p.length; i += 4) {
    const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    p[i] = p[i + 1] = p[i + 2] = g; if (g < lo) lo = g; if (g > hi) hi = g;
  }
  const range = Math.max(hi - lo, 1);
  for (let i = 0; i < p.length; i += 4) { const v = ((p[i] - lo) / range) * 255; p[i] = p[i + 1] = p[i + 2] = v; }
  ctx.putImageData(d, 0, 0);
  return c;
}

function handleScanFile(file) {
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
  prepImage(file).catch(() => file)
    .then(src => Tesseract.recognize(src, "eng"))
    .then(({ data: { text } }) => {
      scanStatus.textContent = "";
      const result = runVerification(text || "");
      currentScan = result;
      renderScanResult(result);
    })
    .catch(() => { scanStatus.textContent = "Could not read the label. Try a clearer, closer photo."; });
}
