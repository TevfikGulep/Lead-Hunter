// utils.js

// --- CONFIGURATION ---
const SERVER_API_URL = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || 'https://varsayilan-url.com/traffic-api.php';

// ... (Diğer yardımcı fonksiyonlar - cleanDomain vb. aynı kalacak) ...
window.cleanDomain = (url) => { 
    if (!url) return '';
    try {
        let fullUrl = url.trim();
        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
            fullUrl = 'https://' + fullUrl;
        }
        const hostname = new URL(fullUrl).hostname;
        return hostname.replace(/^www\./, '');
    } catch (e) {
        return url.trim().replace(/^(?:https?:\/\/)?(?:www\.)?/i, "").split('/')[0];
    }
};

window.getRootDomain = (url) => {
    const domain = window.cleanDomain(url);
    const parts = domain.split('.');
    if (parts.length <= 2) return domain;
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    const multiPartSuffixes = ['com', 'co', 'org', 'net', 'gov', 'edu', 'ac', 'k12', 'gen', 'biz', 'web', 'av', 'dr', 'bel', 'pol'];
    if (tld.length === 2 && multiPartSuffixes.includes(sld)) { return parts.slice(-3).join('.'); }
    return parts.slice(-2).join('.');
};

window.parseCSV = (text) => {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/^\ufeff/, ''));
    return lines.slice(1).map(line => {
        const values = [];
        let inQuotes = false;
        let currentValue = '';
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) {
                values.push(currentValue.trim().replace(/^"|"$/g, ''));
                currentValue = '';
            } else { currentValue += char; }
        }
        values.push(currentValue.trim().replace(/^"|"$/g, ''));
        const entry = {};
        headers.forEach((h, i) => { entry[h] = values[i] || ''; });
        return entry;
    });
};

window.getLastInteractionDate = (item) => {
    const dates = [
        item.lastContactDate,
        item.history?.initial,
        item.history?.repeat1,
        item.history?.repeat2,
        item.history?.repeat3,
        item.history?.repeat4,
        item.history?.denied
    ].filter(d => d).map(d => new Date(d).getTime());
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates)).toISOString();
};

// --- CHECKERS ---

// SERVER-SIDE PHP API KULLANAN YENİ CHECKTRAFFIC
window.checkTraffic = async (siteUrl) => {
    const rootDomain = window.getRootDomain(siteUrl);
    
    if (SERVER_API_URL.includes('siteniz.com')) {
        console.error("LÜTFEN UTILS.JS İÇİNDEKİ SERVER_API_URL DEĞİŞKENİNİ GÜNCELLEYİN!");
        return { viable: false, label: 'API Ayarı Yok', value: 0, note: 'PHP URL Eksik' };
    }

    try {
        console.log(`%c[Traffic Check] ${rootDomain} sorgulanıyor...`, 'color: blue; font-weight: bold;');
        
        // Cache Buster eklendi
        const response = await fetch(`${SERVER_API_URL}?type=traffic&domain=${encodeURIComponent(rootDomain)}&_t=${Date.now()}`);
        
        // ÖNCE TEXT OLARAK AL (Hata Ayıklama İçin Kritik)
        const rawText = await response.text();
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonError) {
            console.error("⚠️ API YANITI JSON DEĞİL! İşte gelen ham veri:");
            console.log(rawText); // PHP Hatası veya HTML çıktısı burada görünecek
            return { viable: false, label: 'Sunucu Hatası', value: 0, note: 'JSON Parse Hatası' };
        }

        if (!response.ok) {
            throw new Error(`API Hatası: ${response.status}`);
        }

        // --- DEBUG LOGLARI ---
        if (data.debug && Array.isArray(data.debug)) {
            data.debug.forEach(log => console.log(`[Server Log] ${log}`));
        } else {
             console.log("[Server Log] Debug verisi gelmedi.");
        }
        // ---------------------

        if (data.success) {
            const numVal = parseFloat(data.value) || 0;
            const isViable = numVal > 20000;

            console.log(`%c✅ [Result] ${rootDomain}: ${data.raw} (${data.source})`, 'color: green; font-weight: bold;');

            return {
                viable: isViable,
                label: data.raw || 'Veri Yok',
                value: numVal,
                note: isViable ? 'İyi Trafik' : 'Düşük Trafik'
            };
        } else {
            console.warn(`⚠️ [No Data] ${rootDomain}: ${data.error}`);
            return { viable: false, label: 'Veri Yok', value: 0, note: data.error || 'Bulunamadı' };
        }

    } catch (e) {
        console.error(`❌ [Error] ${rootDomain}: ${e.message}`);
        return { viable: false, label: 'Hata', value: 0, note: 'API Hatası' };
    }
};

// SERVER-SIDE PHP API KULLANAN YENİ FIND EMAILS
window.findEmailsOnSite = async (url) => {
    const domain = window.cleanDomain(url);

    if (SERVER_API_URL.includes('siteniz.com')) {
        console.error("LÜTFEN UTILS.JS İÇİNDEKİ SERVER_API_URL DEĞİŞKENİNİ GÜNCELLEYİN!");
        return null;
    }

    try {
        console.log(`%c[Email Check] ${domain} taranıyor...`, 'color: purple; font-weight: bold;');
        
        const response = await fetch(`${SERVER_API_URL}?type=email&domain=${encodeURIComponent(domain)}&_t=${Date.now()}`);
        
        // ÖNCE TEXT OLARAK AL
        const rawText = await response.text();
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (jsonError) {
            console.error("⚠️ API YANITI JSON DEĞİL (Email)! İşte gelen ham veri:");
            console.log(rawText);
            return null;
        }
        
        if (!response.ok) {
            throw new Error(`API Hatası: ${response.status}`);
        }

        if (data.debug && Array.isArray(data.debug)) {
            data.debug.forEach(log => console.log(`[Server Log] ${log}`));
        }

        if (data.success) {
            if (Array.isArray(data.emails) && data.emails.length > 0) {
                const joinedEmails = data.emails.join(', ');
                console.log(`%c📧 [Result] ${domain}: ${joinedEmails}`, 'color: green; font-weight: bold;');
                return joinedEmails;
            } 
            else if (data.email) {
                console.log(`%c📧 [Result] ${domain}: ${data.email}`, 'color: green; font-weight: bold;');
                return data.email;
            }
        } 
        
        console.log(`⚪ [No Email] ${domain}`);
        return null;

    } catch (e) {
        console.error(`❌ [Error] ${domain}: ${e.message}`);
        return null;
    }
};

// ... (helper functions end) ...
window.decodeHtmlEntities = (text) => {
    if (!text) return '';
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
};

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