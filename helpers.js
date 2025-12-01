// helpers.js

// --- HELPER: Decode HTML Entities ---
window.decodeHtmlEntities = (text) => {
    if (!text) return '';
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
};

// --- HELPER: Parse Traffic String to Number ---
window.parseTrafficToNumber = (str) => {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    
    const s = str.toString().toLowerCase().trim().replace(/,/g, '.');
    let multiplier = 1;
    
    if (s.includes('b')) multiplier = 1000000000;
    else if (s.includes('m')) multiplier = 1000000;
    else if (s.includes('k')) multiplier = 1000;
    
    const numPart = s.replace(/[^0-9.]/g, '');
    const num = parseFloat(numPart);
    
    return isNaN(num) ? 0 : num * multiplier;
};