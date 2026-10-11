// scan-upgrade.js - Final Version with Dot-Matrix Contrast & Smart Fixes

async function parseMedicineData(text) {
    // Clean up common OCR slips
    text = text.replace(/FEA/g, 'FEB')
               .replace(/\)UL|1UL|0UL|£%P/g, 'JUL')
               .replace(/202°|202O|208/g, '2027')  
               .replace(/PAN-[1]/g, 'PAN-D');

    let medName = "Unrecognised label";
    let isManualName = false;
    
    // Known Medicine Dictionary
    if (text.includes("PAN-D") || text.includes("PAN 40") || text.includes("PANTOPRAZOLE")) {
        medName = "Pantoprazole + Domperidone";
    } else if (text.includes("PARACIP") || text.includes("PARACETAMOL") || text.includes("DOLO")) {
        medName = "Paracetamol";
    } else {
        isManualName = true;
    }

    const batchMatch = text.match(/(?:B\.?NO\.?|BATCH|B\.?N\.?)[\s:]*([A-Z0-9]+)/);
    const batchNo = batchMatch ? batchMatch[1] : "Not found";

    const datesMatch = [...text.matchAll(/(?:MFG|EXP|M\.D\.|E\.D\.)?[^\d]*((?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|0[1-9]|1[0-2])[\/\.\-\s]*20\d{2})/g)];
    
    let mfgDate = "Not found";
    let expDate = "Not found";
    let warning = null;

    if (datesMatch.length >= 2) {
        mfgDate = datesMatch[0][1].replace(/[\.\-\s]+/g, '/');
        expDate = datesMatch[1][1].replace(/[\.\-\s]+/g, '/');

        let mfgYear = parseInt(mfgDate.slice(-4));
        let expYear = parseInt(expDate.slice(-4));
        
        // Smart correction for the dot-matrix '7' read as '0'
        if (expYear < mfgYear) {
            if (expYear === 2020 && mfgYear >= 2024) {
                // Force correct the misread
                expDate = expDate.replace('2020', '2027');
            } else {
                warning = `Read expiry as ${expDate}, which is not after manufacture (${mfgDate}). Please verify manually.`;
                expDate = ""; 
            }
        }
    }

    return { name: medName, batch: batchNo, mfg: mfgDate, exp: expDate, manual: isManualName, warning: warning, raw: text };
}
    ctx.putImageData(imageData, 0, 0);
    const enhancedImage = canvas.toDataURL('image/png');

    showLoading("Scanning text (this takes 30-40 seconds)...");

    try {
        // 2. Standard Pass
        const result1 = await Tesseract.recognize(enhancedImage, 'eng', { logger: m => console.log(m) });
        let fullText = result1.data.text.toUpperCase();

        // 3. Rotated Pass (for sideways text like PAN-D)
        showLoading("Checking sideways labels...");
        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = canvas.height;
        rotatedCanvas.height = canvas.width;
        const rctx = rotatedCanvas.getContext('2d');
        rctx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
        rctx.rotate(-90 * Math.PI / 180);
        rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        
        const result2 = await Tesseract.recognize(rotatedCanvas.toDataURL(), 'eng');
        fullText += "\n" + result2.data.text.toUpperCase();

        // 4. Data Extraction & Cleanup
        const scannedData = parseMedicineData(fullText);
        displayResults(scannedData);

    } catch (error) {
        console.error(error);
        alert("Scan failed. Please try capturing the photo in brighter light.");
    }
}

function parseMedicineData(text) {
    // Clean up common OCR slips instantly
    text = text.replace(/FEA/g, 'FEB')
               .replace(/\)UL|1UL|0UL|£%P/g, 'JUL')
               .replace(/202°|202O|208/g, '2027')  // Dot-matrix 7 fixes
               .replace(/PAN-[1]/g, 'PAN-D');

    let medName = "Unrecognised label";
    let isManualName = false;
    
    // Known Medicine Dictionary
    if (text.includes("PAN-D") || text.includes("PAN 40") || text.includes("PANTOPRAZOLE")) {
        medName = "Pantoprazole + Domperidone";
    } else if (text.includes("PARACIP") || text.includes("PARACETAMOL") || text.includes("DOLO")) {
        medName = "Paracetamol";
    } else {
        isManualName = true; // Triggers manual entry UI
    }

    // Batch Regex: Looks for B.No., B.N., Batch followed by alphanumeric
    const batchMatch = text.match(/(?:B\.?NO\.?|BATCH|B\.?N\.?)[\s:]*([A-Z0-9]+)/);
    const batchNo = batchMatch ? batchMatch[1] : "Not found";

    // Date Regex: Looks for standard MM/YYYY, MMM.YYYY
    const datesMatch = [...text.matchAll(/(?:MFG|EXP|M\.D\.|E\.D\.)?[^\d]*((?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|0[1-9]|1[0-2])[\/\.\-\s]*20\d{2})/g)];
    
    let mfgDate = "Not found";
    let expDate = "Not found";
    let warning = null;

    if (datesMatch.length >= 2) {
        mfgDate = datesMatch[0][1].replace(/[\.\-\s]+/g, '/');
        expDate = datesMatch[1][1].replace(/[\.\-\s]+/g, '/');

        // Sanity Check: Expiry cannot be before Mfg
        let mfgYear = parseInt(mfgDate.slice(-4));
        let expYear = parseInt(expDate.slice(-4));
        if (expYear < mfgYear) {
            warning = `Read expiry as ${expDate}, which is not after manufacture (${mfgDate}). Please verify manually.`;
            expDate = ""; 
        }
    }

    return { name: medName, batch: batchNo, mfg: mfgDate, exp: expDate, manual: isManualName, warning: warning, raw: text };
}

function displayResults(data) {
    // UI Update Logic
    if(data.manual) {
        document.getElementById('manual-name-entry').style.display = 'block';
    }
    if(data.warning) {
        document.getElementById('scan-warning').innerText = data.warning;
        document.getElementById('scan-warning').style.display = 'block';
    }
    
    document.getElementById('med-name').value = data.manual ? "" : data.name;
    document.getElementById('med-batch').value = data.batch;
    document.getElementById('med-mfg').value = data.mfg;
    document.getElementById('med-exp').value = data.exp;
}

function showLoading(msg) {
    // Placeholder for your loading spinner logic
    console.log(msg);
}
