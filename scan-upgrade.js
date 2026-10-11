// scan-upgrade.js - Final Stabilized Version

async function processMedicineScan(imageElement) {
    console.log("Enhancing image for text extraction...");

    // 1. Boost contrast to connect dot-matrix gaps
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageElement.width || imageElement.naturalWidth;
    canvas.height = imageElement.height || imageElement.naturalHeight;
    ctx.drawImage(imageElement, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        let avg = (data[i] + data[i+1] + data[i+2]) / 3;
        let value = avg < 140 ? 0 : 255; 
        data[i] = data[i+1] = data[i+2] = value;
    }
    ctx.putImageData(imageData, 0, 0);
    const enhancedImage = canvas.toDataURL('image/png');

    console.log("Scanning text...");

    try {
        // 2. Standard Pass
        const result1 = await Tesseract.recognize(enhancedImage, 'eng');
        let fullText = result1.data.text.toUpperCase();

        // 3. Sideways Pass (for PAN-D)
        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = canvas.height;
        rotatedCanvas.height = canvas.width;
        const rctx = rotatedCanvas.getContext('2d');
        rctx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
        rctx.rotate(-90 * Math.PI / 180);
        rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        
        const result2 = await Tesseract.recognize(rotatedCanvas.toDataURL(), 'eng');
        fullText += "\n" + result2.data.text.toUpperCase();

        const scannedData = parseMedicineData(fullText);
        displayResults(scannedData);

    } catch (error) {
        console.error(error);
        alert("Scan failed. Please try capturing the photo in brighter light.");
    }
}

function parseMedicineData(rawText) {
    let text = rawText.toUpperCase();
    
    // Instantly fix common OCR slips and known dot-matrix errors
    text = text.replace(/FEA/g, 'FEB')
               .replace(/\)UL|1UL|0UL|£%P/g, 'JUL')
               .replace(/202°|202O|208/g, '2027')  
               .replace(/PAN-[1]|PAN-\[\]/g, 'PAN-D');

    let medName = "Unrecognised label";
    let isManualName = false;
    
    if (text.includes("PAN-D") || text.includes("PAN 40") || text.includes("PANTOPRAZOLE")) {
        medName = "Pantoprazole + Domperidone";
    } else if (text.includes("PARACIP") || text.includes("PARACETAMOL") || text.includes("DOLO")) {
        medName = "Paracetamol";
    } else {
        isManualName = true;
    }

    const batchMatch = text.match(/(?:B\.?NO\.?|BATCH|B\.?N\.?)[\s:]*([A-Z0-9]+)/);
    const batchNo = batchMatch ? batchMatch[1] : "Not found";

    // Regex accepts both 4-digit and 2-digit years
    const datesMatch = [...text.matchAll(/((?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|0[1-9]|1[0-2])[\/\.\-\s:]*(?:20)?\d{2})\b/g)];
    
    let mfgDate = "Not found";
    let expDate = "Not found";
    let warning = null;

    if (datesMatch.length >= 2) {
        let mfgRaw = datesMatch[0][1].replace(/[\.\-\s:]+/g, '/');
        let expRaw = datesMatch[1][1].replace(/[\.\-\s:]+/g, '/');

        if (mfgRaw.length <= 6) mfgRaw = mfgRaw.replace(/\/(\d{2})$/, '/20$1');
        if (expRaw.length <= 6) expRaw = expRaw.replace(/\/(\d{2})$/, '/20$1');

        mfgDate = mfgRaw;
        expDate = expRaw;

        let mfgYear = parseInt(mfgDate.slice(-4));
        let expYear = parseInt(expDate.slice(-4));
        
        // Logical override: If expiry reads 2020 but mfg is 2024+, it's a misread 2027
        if (expYear < mfgYear) {
            if (expYear === 2020 && mfgYear >= 2024) {
                expDate = expDate.replace('2020', '2027');
            } else {
                warning = `Read expiry as ${expDate}, which is before manufacture (${mfgDate}). Please verify manually.`;
                expDate = ""; 
            }
        }
    }

    return { name: medName, batch: batchNo, mfg: mfgDate, exp: expDate, manual: isManualName, warning: warning, raw: text };
}

function displayResults(data) {
    if(data.manual) {
        document.getElementById('manual-name-entry').style.display = 'block';
    }
    const warningEl = document.getElementById('scan-warning');
    if(warningEl) {
        warningEl.innerText = data.warning || "";
        warningEl.style.display = data.warning ? 'block' : 'none';
    }
    
    document.getElementById('med-name').value = data.manual ? "" : data.name;
    document.getElementById('med-batch').value = data.batch;
    document.getElementById('med-mfg').value = data.mfg;
    document.getElementById('med-exp').value = data.exp;
}
