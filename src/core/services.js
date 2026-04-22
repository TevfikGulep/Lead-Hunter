// LeadHunter_Services.js

const { useState, useRef, useEffect } = React;


// --- YARDIMCI FONKSÄ°YON: KARAKTER DÃœZELTME (TURKISH FIX) ---
window.fixEncoding = (str) => {
    if (!str) return '';
    let text = str;

    // 1. MIME Encoded Word Ã‡Ã¶zÃ¼mÃ¼
    if (text.includes('=?') && text.includes('?=')) {
        text = text.replace(/=\?([^?]+)\?([QBqb])\?([^?]*)\?=/g, (match, charset, encoding, content) => {
            try {
                if (encoding.toUpperCase() === 'B') {
                    const binary = atob(content);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    return new TextDecoder(charset.toLowerCase() || 'utf-8').decode(bytes);
                } else if (encoding.toUpperCase() === 'Q') {
                    return content.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
                }
            } catch (e) { return match; }
            return match;
        });
    }

    // 2. "SMART FIX" (UTF-8 in Latin1/Win1252)
    try {
        if (/[ÃƒÃ„Ã…]/.test(text)) {
            const bytes = new Uint8Array(text.length);
            let possible = true;
            for (let i = 0; i < text.length; i++) {
                const code = text.charCodeAt(i);
                if (code > 255) { possible = false; break; }
                bytes[i] = code;
            }
            if (possible) {
                const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                if (decoded && decoded !== text) text = decoded;
            }
        }
    } catch (e) { }

    // 3. GENÄ°ÅLETÄ°LMÄ°Å MANUEL HARÄ°TA (Manual Fallback)
    const replacements = {
        'Ã„Â°': 'Ä°', 'Ã„Â±': 'Ä±', 'Ãƒâ€“': 'Ã–', 'ÃƒÂ¶': 'Ã¶', 'ÃƒÅ“': 'Ãœ', 'ÃƒÂ¼': 'Ã¼',
        'Ã…Å¾': 'Å', 'Ã…Å¸': 'ÅŸ', 'Ãƒâ€¡': 'Ã‡', 'ÃƒÂ§': 'Ã§', 'Ã„Å¸': 'ÄŸ', 'Ã„Å¾': 'Ä',
        'ÃƒÂ¢': 'Ã¢', 'Ãƒâ€š': 'Ã‚', 'ÃƒÂ®': 'Ã®', 'ÃƒÂ®': 'Ã®',
        'Ã„\u00A0': 'Ä', 'Ã„\u009F': 'ÄŸ', 'Ãƒ\u0096': 'Ã–', 'Ãƒ\u00B6': 'Ã¶',
        'Ãƒ\u009C': 'Ãœ', 'Ãƒ\u00BC': 'Ã¼', 'Ãƒ\u0087': 'Ã‡', 'Ãƒ\u00A7': 'Ã§',
        'Ã…\u009E': 'Å', 'Ã…\u009F': 'ÅŸ', 'Ã¢\u20AC\u201C': '-', 'Ã‚': '',
        '&#304;': 'Ä°', '&#305;': 'Ä±', '&#214;': 'Ã–', '&#246;': 'Ã¶',
        '&#220;': 'Ãœ', '&#252;': 'Ã¼', '&#199;': 'Ã‡', '&#231;': 'Ã§',
        '&#286;': 'Ä', '&#287;': 'ÄŸ', '&#350;': 'Å', '&#351;': 'ÅŸ',
        '&amp;': '&', '&quot;': '"', '&apos;': "'", '&gt;': '>', '&lt;': '<'
    };

    // Ã–nce en uzun anahtarlarÄ± dÃ¼zelt (Ã–rn: Ãƒâ€“ yerine Ã„Â° gibi spesifikleri Ã¶ncele)
    const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);
    sortedKeys.forEach(key => {
        if (text.includes(key)) {
            const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            text = text.replace(regex, replacements[key]);
        }
    });

    // Son Ã§are: Tekli Ãƒ bozulmasÄ±
    if (text.includes('Ãƒ') && !/[a-zA-Z0-9]/.test(text.charAt(text.indexOf('Ãƒ') + 1))) {
        text = text.replace(/Ãƒ/g, 'Ä°');
    }

    return text.trim();
};


// --- YARDIMCI FONKSÄ°YON: Email'den Ä°sim Ã‡Ä±karma ---
window.extractNameFromEmail = (fromStr) => {
    if (!fromStr) return '';

    // Ã–nce karakterleri dÃ¼zelt
    const cleanStr = window.fixEncoding(fromStr);

    // Format: "John Doe" <john@doe.com> veya John Doe <john@doe.com>
    const match = cleanStr.match(/^"?([^"<]+)"?\s*</);
    let name = '';

    if (match && match[1]) {
        name = match[1].trim();
    } else {
        // Ä°sim formatÄ± yoksa ve sadece mail varsa (Ã¶rn: "info@site.com")
        const temp = cleanStr.replace(/<[^>]+>/g, '').trim();
        name = temp.includes('@') ? '' : temp.replace(/^"|"$/g, '');
    }

    // --- KARA LÄ°STE KONTROLÃœ (Ä°sim Ã§ekilirken anlÄ±k kontrol) ---
    const blackList = ['tevfik gÃ¼lep', 'tevfik gulep', 'lead hunter', 'admin', 'info', 'iletisim', 'contact', 'support', 'destek', 'muhasebe', 'ik', 'hr', 'satis', 'sales'];

    if (name && blackList.some(b => name.toLowerCase().includes(b))) {
        return ''; // YasaklÄ± isimse boÅŸ dÃ¶ndÃ¼r
    }

    return name;
};

window.useLeadHunterServices = (
    dbInstance,
    isDbConnected,
    settings,
    crmData,
    setCrmData,
    selectedIds,
    setSelectedIds,
    leads,
    setLeads,
    getStageInfo,
    searchLocation
) => {
    // --- STATE ---
    const [selectedLead, setSelectedLead] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [isBulkSending, setIsBulkSending] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, logs: [] });
    const [bulkConfig, setBulkConfig] = useState({ templateType: 'AUTO', specificStage: 0, language: 'TR' });
    const [isCheckingBulk, setIsCheckingBulk] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    const [showEnrichModal, setShowEnrichModal] = useState(false);
    const [enrichLogs, setEnrichLogs] = useState([]);
    const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 });
    const enrichPollRef = useRef(null);
    const [isScanning, setIsScanning] = useState(false);
    const [keywords, setKeywords] = useState('');
    const [searchDepth, setSearchDepth] = useState(30);
    const [hunterLogs, setHunterLogs] = useState([]);
    const [hunterProgress, setHunterProgress] = useState(0);
    const [isHunterRunning, setIsHunterRunning] = useState(false);

    // AutoHunter (otomatik tarama) canlÄ± log ve istatistikleri
    const [autoHunterLogs, setAutoHunterLogs] = useState([]);
    const [autoHunterStats, setAutoHunterStats] = useState({ totalFound: 0, fullData: 0 });
    const [isFixingConsistency, setIsFixingConsistency] = useState(false);
    const [fixConsistencyLogs, setFixConsistencyLogs] = useState([]);
    const [showFixLogModal, setShowFixLogModal] = useState(false);

    const scanIntervalRef = useRef(false);
    const hunterLogsEndRef = useRef(null);
    const autoHunterLogsEndRef = useRef(null);
    const autoHunterRef = useRef({ isRunning: false });
    const crmDataRef = useRef(crmData);
    useEffect(() => { crmDataRef.current = crmData; }, [crmData]);

    const startScan = async () => {
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        if (!keywords.trim()) return alert("Anahtar kelime girin.");
        setIsScanning(true);
        setHunterLogs([{ time: new Date().toLocaleTimeString(), message: "Tarama başlatıldı...", type: "info" }]);
        setHunterProgress(0);

        const addLog = (message, type = 'info') => {
            const time = new Date().toLocaleTimeString('tr-TR');
            setHunterLogs(prev => [...prev.slice(-99), { time, message, type }]);
        };

        try {
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
            const searchQueries = keywords.split(',').map(k => k.trim()).filter(Boolean);
            
            let allResults = [];
            for (const query of searchQueries) {
                addLog(`🔍 Sorgu: ${query}`, 'info');
                const url = `${serverUrl}?type=search&q=${encodeURIComponent(query)}&depth=${searchDepth}`;
                const resp = await fetch(url);
                const data = await resp.json();
                if (data.success && data.results) {
                    allResults = [...allResults, ...data.results];
                }
            }

            const uniqueResults = [];
            const seenDomains = new Set();
            allResults.forEach(r => {
                const domain = window.normalizeMainDomain(r.url);
                if (domain && !seenDomains.has(domain)) {
                    seenDomains.add(domain);
                    uniqueResults.push(r);
                }
            });

            addLog(`✅ ${uniqueResults.length} benzersiz site bulundu. Veriler analiz ediliyor...`, 'success');
            
            const analyzedLeads = [];
            for (let i = 0; i < uniqueResults.length; i++) {
                const res = uniqueResults[i];
                const domain = window.normalizeMainDomain(res.url);
                const traffic = await window.checkTraffic(domain);
                if (traffic && traffic.viable) {
                    const email = await window.findEmailsOnSite(domain);
                    analyzedLeads.push({
                        ...res,
                        url: domain,
                        email: email || '',
                        trafficStatus: traffic
                    });
                    addLog(`🎯 Uygun site: ${domain}`, 'success');
                }
                setHunterProgress(Math.round(((i + 1) / uniqueResults.length) * 100));
            }

            setLeads(analyzedLeads);
            addLog(`🏁 Tarama bitti. ${analyzedLeads.length} uygun site bulundu.`, 'success');
        } catch (err) {
            addLog(`❌ Hata: ${err.message}`, 'error');
        } finally {
            setIsScanning(false);
        }
    };

    const stopScan = () => {
        setIsScanning(false);
        setHunterLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message: "Tarama durduruldu.", type: "warning" }]);
    };



    // --- 1. TRACKING SYNC ---
    useEffect(() => {
        if (!isDbConnected) return;
        const checkOpens = async () => {
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
            if (!serverUrl) return;
            try {
                const response = await fetch(`${serverUrl}?type=sync_opens&_t=${Date.now()}`);
                const result = await response.json();
                if (result.success && result.data) {
                    const trackingData = result.data;
                    const batch = dbInstance.batch();
                    let updateCount = 0;
                    const currentLeads = crmDataRef.current;

                    currentLeads.forEach(lead => {
                        const openedAt = trackingData[lead.id];
                        if (openedAt && (!lead.mailOpenedAt || new Date(openedAt).getTime() > new Date(lead.mailOpenedAt).getTime())) {
                            const ref = dbInstance.collection("leads").doc(lead.id);
                            const updates = { mailOpenedAt: openedAt };
                            if (!lead.mailOpenedAt) {
                                updates.activityLog = firebase.firestore.FieldValue.arrayUnion({
                                    date: openedAt,
                                    type: 'INFO',
                                    content: 'Mail ilk kez okundu (Tracking Pixel)'
                                });
                            }
                            batch.update(ref, updates);
                            updateCount++;
                        }
                    });
                    if (updateCount > 0) batch.commit();
                }
            } catch (e) { console.warn("Tracking Sync HatasÄ±:", e); }
        };
        const intervalId = setInterval(checkOpens, 60000);
        const timeoutId = setTimeout(checkOpens, 5000);
        return () => { clearInterval(intervalId); clearTimeout(timeoutId); };
    }, [isDbConnected]);

    // --- 2. AUTO REPLY CHECK ---
    useEffect(() => {
        if (!isDbConnected || !settings.googleScriptUrl) return;
        const autoCheckReplies = async () => {
            const currentData = crmDataRef.current;
            const candidates = currentData.filter(l =>
                l.threadId &&
                !['MAIL_ERROR', 'NOT_VIABLE', 'DEAL_ON', 'DEAL_OFF', 'DENIED', 'INTERESTED', 'IN_PROCESS', 'ASKED_MORE', 'NOT_POSSIBLE'].includes(l.statusKey)
            );
            if (candidates.length === 0) return;
            const sortedCandidates = [...candidates].sort((a, b) => new Date(b.lastContactDate || 0) - new Date(a.lastContactDate || 0)).slice(0, 50);
            try {
                const data = await window.callGoogleScript(settings.googleScriptUrl, { action: 'check_replies_bulk', threadIds: sortedCandidates.map(c => c.threadId) });
                if (data.status === 'success' && data.results) {
                    const batch = dbInstance.batch();
                    let updatesCount = 0;

                    sortedCandidates.forEach(lead => {
                        const result = data.results[lead.threadId];
                        if (result && result.hasReply) {
                            const ref = dbInstance.collection("leads").doc(lead.id);
                            const updates = {};

                            if (result.isBounce) {
                                if (lead.statusKey !== 'MAIL_ERROR') {
                                    updates.statusKey = 'MAIL_ERROR';
                                    updates.statusLabel = 'Error in mail (Bounced)';
                                    updates.email = '';
                                    updates.lastContactDate = new Date().toISOString();
                                    updates.activityLog = firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), type: 'BOUNCE', content: `Sistem: Mail Ä°letilemedi (Otomatik Tespit)` });
                                }
                            } else {
                                // Ä°SÄ°M Ã‡EKME
                                if (result.from && !lead.contactName) {
                                    const extractedName = window.extractNameFromEmail(result.from);
                                    if (extractedName) updates.contactName = extractedName;
                                }

                                if (!['INTERESTED', 'ASKED_MORE', 'IN_PROCESS', 'DEAL_ON'].includes(lead.statusKey)) {
                                    // Smart reply categorization
                                    const replyCategory = window.categorizeReply(result.snippet, result.from);
                                    const categoryStatusMap = {
                                        'INTERESTED': 'INTERESTED',
                                        'ASKED_MORE': 'ASKED_MORE',
                                        'DENIED': 'DENIED',
                                        'FOLLOW_LATER': 'FOLLOW_LATER',
                                        'NEEDS_REVIEW': 'NEEDS_REVIEW'
                                    };
                                    const newStatus = categoryStatusMap[replyCategory.category] || 'NEEDS_REVIEW';
                                    const statusLabel = window.LEAD_STATUSES[newStatus]?.label || replyCategory.category;

                                    updates.statusKey = newStatus;
                                    updates.statusLabel = statusLabel + ' (Auto)';
                                    updates.lastContactDate = new Date().toISOString();
                                    updates.activityLog = firebase.firestore.FieldValue.arrayUnion({
                                        date: new Date().toISOString(),
                                        type: 'REPLY',
                                        content: `Sistem: ${replyCategory.suggestion} (${result.snippet?.substring(0, 40)}...)`
                                    });

                                    // If denied, stop auto followup
                                    if (newStatus === 'DENIED' || newStatus === 'FOLLOW_LATER') {
                                        updates.autoFollowupEnabled = false;
                                    }
                                }
                            }

                            if (Object.keys(updates).length > 0) {
                                batch.update(ref, updates);
                                updatesCount++;
                            }
                        }
                    });
                    if (updatesCount > 0) batch.commit();
                }
            } catch (e) { console.warn("[Auto Reply] Hata:", e); }
        };
        const intervalId = setInterval(autoCheckReplies, 600000);
        const timeoutId = setTimeout(autoCheckReplies, 15000);
        return () => { clearInterval(intervalId); clearTimeout(timeoutId); };
    }, [isDbConnected, settings.googleScriptUrl]);

    // --- 3. EXPORT FUNCTION ---
    const handleExportData = (dataToExport) => {
        if (!dataToExport || dataToExport.length === 0) {
            alert("DÄ±ÅŸa aktarÄ±lacak veri bulunamadÄ±.");
            return;
        }
        try {
            const headers = [
                "Website", "Email", "Contact Name", "Potential (k)", "Status", "Last Contact",
                "Stage", "Lang", "Initial Date", "Repeat 1", "Repeat 2",
                "Repeat 3", "Repeat 4", "Denied Date", "Notes"
            ];
            const formatDate = (dateStr) => {
                if (!dateStr) return "-";
                try { return new Date(dateStr).toLocaleDateString('tr-TR'); } catch (e) { return "-"; }
            };
            const rows = dataToExport.map(lead => [
                window.cleanDomain(lead.url),
                lead.email || '-',
                lead.contactName || '-',
                lead.trafficStatus?.label || '-',
                window.LEAD_STATUSES[lead.statusKey]?.label || lead.statusLabel || 'New',
                formatDate(lead.lastContactDate),
                getStageInfo((lead.stage || 0) - 1, lead.language).label,
                lead.language || 'TR',
                formatDate(lead.history?.initial),
                formatDate(lead.history?.repeat1),
                formatDate(lead.history?.repeat2),
                formatDate(lead.history?.repeat3),
                formatDate(lead.history?.repeat4),
                formatDate(lead.history?.denied),
                (lead.notes || '').replace(/,/g, ';').replace(/\n/g, ' ').replace(/"/g, '""')
            ]);
            const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
            const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = window.URL.createObjectURL(blob);
            link.href = url;
            link.download = `LeadHunter_Report_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 100);
        } catch (error) { alert("Rapor hatasÄ±: " + error.message); }
    };

    // --- 4. BAKIM ARACI: BOZUK Ä°SÄ°MLERÄ° VE KARA LÄ°STEYÄ° DÃœZELTME ---
    const fixEncodedNames = async () => {
        if (!isDbConnected) return alert("VeritabanÄ± baÄŸlÄ± deÄŸil.");
        if (!confirm("Bozuk karakterli (Ãƒâ€“, ÃƒÂ¼ vb.) ve hatalÄ± (Tevfik GÃ¼lep) isimler taranÄ±p dÃ¼zeltilecek. Bu iÅŸlem veritabanÄ±nda kalÄ±cÄ± deÄŸiÅŸiklik yapar. OnaylÄ±yor musunuz?")) return;

        let count = 0;
        let deletedCount = 0;
        let processedCount = 0;
        const currentLeads = crmDataRef.current;
        const blackList = ['tevfik gÃ¼lep', 'tevfik gulep', 'lead hunter', 'admin', 'info', 'iletisim', 'sales', 'support'];

        // Firestore batch limiti 500'dÃ¼r. Bu yÃ¼zden veriyi parÃ§alara ayÄ±rÄ±yoruz.
        const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
        const leadChunks = chunk(currentLeads, 400); // GÃ¼venli olmasÄ± iÃ§in 400'erli gruplar

        try {
            for (const leads of leadChunks) {
                const batch = dbInstance.batch();
                let batchOpCount = 0;

                leads.forEach(lead => {
                    processedCount++;
                    if (lead.contactName) {
                        let cleanName = window.fixEncoding(lead.contactName);
                        let shouldUpdate = false;

                        if (blackList.some(b => cleanName.toLowerCase().includes(b))) {
                            cleanName = '';
                            shouldUpdate = true;
                        } else if (cleanName !== lead.contactName) {
                            shouldUpdate = true;
                        }

                        if (shouldUpdate) {
                            const ref = dbInstance.collection("leads").doc(lead.id);
                            if (cleanName === '') {
                                batch.update(ref, { contactName: firebase.firestore.FieldValue.delete() });
                                deletedCount++;
                            } else {
                                batch.update(ref, { contactName: cleanName });
                                count++;
                            }
                            batchOpCount++;
                        }
                    }
                });

                if (batchOpCount > 0) {
                    await batch.commit();
                }
            }

            if (count > 0 || deletedCount > 0) {
                alert(`Ä°ÅŸlem TamamlandÄ±!\n\n${processedCount} kayÄ±t tarandÄ±.\nâœ… ${count} isim karakterleri dÃ¼zeltildi.\nğŸ—‘ï¸  ${deletedCount} yasaklÄ± isim silindi.`);
            } else {
                alert(`${processedCount} kayÄ±t tarandÄ±. DÃ¼zeltilecek veya silinecek kayÄ±t bulunamadÄ±.`);
            }
        } catch (error) {
            console.error("Fix Names Error:", error);
            alert("Ä°ÅŸlem sÄ±rasÄ±nda bir hata oluÅŸtu: " + error.message);
        }
    };

    const startAutoFollowup = async (ids) => {
        if (!ids || ids.size === 0) return alert("Kayıt seçin.");
        if (!confirm(`${ids.size} kayıt için otomatik takip (7 gün ara ile) başlatılacak. Onaylıyor musunuz?`)) return;
        
        const batch = dbInstance.batch();
        const now = new Date();
        const nextDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const newLog = { date: now.toISOString(), type: 'SYSTEM', content: 'Otomatik takip başlatıldı (7 gün periyot).' };

        ids.forEach(id => {
            const ref = dbInstance.collection("leads").doc(id);
            batch.update(ref, { 
                autoFollowupEnabled: true, 
                nextFollowupDate: nextDate,
                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
            });
        });

        try {
            await batch.commit();
            setCrmData(prev => prev.map(item => ids.has(item.id) ? { ...item, autoFollowupEnabled: true, nextFollowupDate: nextDate, activityLog: [...(item.activityLog || []), newLog] } : item));
            setSelectedIds(new Set());
            alert("Otomatik takip başlatıldı.");
        } catch (e) { alert("Hata: " + e.message); }
    };

    const stopAutoFollowup = async (ids) => {
        if (!ids || ids.size === 0) return alert("Kayıt seçin.");
        if (!confirm(`${ids.size} kayıt için otomatik takip durdurulacak.`)) return;
        
        const batch = dbInstance.batch();
        const now = new Date();
        const newLog = { date: now.toISOString(), type: 'SYSTEM', content: 'Otomatik takip durduruldu.' };

        ids.forEach(id => {
            const ref = dbInstance.collection("leads").doc(id);
            batch.update(ref, { 
                autoFollowupEnabled: false, 
                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
            });
        });

        try {
            await batch.commit();
            setCrmData(prev => prev.map(item => ids.has(item.id) ? { ...item, autoFollowupEnabled: false, activityLog: [...(item.activityLog || []), newLog] } : item));
            setSelectedIds(new Set());
            alert("Otomatik takip durduruldu.");
        } catch (e) { alert("Hata: " + e.message); }
    };


    const openMailModal = (lead) => {
        const info = getStageInfo(lead.stage || 0, lead.language);
        if (info.isFinished) return alert("SÃ¼reÃ§ tamamlanmÄ±ÅŸ.");
        const domain = window.cleanDomain(lead.url);
        setSelectedLead({ ...lead, currentLabel: info.label, draft: { to: lead.email ? lead.email.split(',')[0].trim() : '', subject: info.template.subject.replace(/{{Website}}/g, domain), body: info.template.body.replace(/{{Website}}/g, domain) }, allEmails: lead.email });
    };

    const openPromotionModal = (lead) => {
        const domain = window.cleanDomain(lead.url);
        const promoTemplate = lead.language === 'EN'
            ? settings.promotionTemplateEN
            : settings.promotionTemplateTR;

        if (!promoTemplate) return alert("Promosyon ÅŸablonu bulunamadÄ±.");

        setSelectedLead({
            ...lead,
            currentLabel: promoTemplate.label || 'Promosyon',
            isPromotion: true,
            draft: {
                to: lead.email ? lead.email.split(',')[0].trim() : '',
                subject: (promoTemplate.subject || '').replace(/{{Website}}/g, domain),
                body: (promoTemplate.body || '').replace(/{{Website}}/g, domain)
            },
            allEmails: lead.email
        });
    };

    const handleSendMail = async () => {
        if (!selectedLead) return;
        setIsSending(true);
        try {
            const messageHtml = selectedLead.draft.body.replace(/\n/g, '<br>');
            let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
            const trackingPixel = serverUrl ? `<img src="${serverUrl}?type=track&id=${selectedLead.id}" width="1" height="1" style="display:none;" alt="" />` : '';
            const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>${trackingPixel}`;
            const plainBody = selectedLead.draft.body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');
            const result = await window.callGoogleScript(settings.googleScriptUrl, { action: 'send_mail', to: selectedLead.draft.to, subject: selectedLead.draft.subject, body: plainBody, htmlBody: htmlContent, threadId: selectedLead.threadId || null });
            if (result.status === 'error') throw new Error(result.message);
            if (isDbConnected) {
                const newLog = { date: new Date().toISOString(), type: 'MAIL', content: `Mail GÃ¶nderildi: ${selectedLead.currentLabel}` };
                const updateData = { statusKey: 'NO_REPLY', statusLabel: window.LEAD_STATUSES['NO_REPLY'].label, stage: (selectedLead.stage || 0) + 1, lastContactDate: new Date().toISOString(), [`history.${selectedLead.stage === 0 ? 'initial' : `repeat${selectedLead.stage}`}`]: new Date().toISOString(), activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) };
                if (result.threadId) updateData.threadId = result.threadId;
                await dbInstance.collection("leads").doc(selectedLead.id).update(updateData);
                setCrmData(prev => prev.map(p => p.id === selectedLead.id ? { ...p, ...updateData, activityLog: [...(p.activityLog || []), newLog] } : p));
            }
            alert("Mail gÃ¶nderildi!");
            setSelectedLead(null);
        } catch (e) { alert("Hata: " + e.message); }
        setIsSending(false);
    };

    const executeBulkSend = async () => {
        if (!confirm(`${selectedIds.size} site iÃ§in toplu gÃ¶nderim yapÄ±lacak. OnaylÄ±yor musunuz?`)) return;
        setIsBulkSending(true);
        const selectedLeads = crmData.filter(l => selectedIds.has(l.id));
        const grouped = {};
        selectedLeads.forEach(lead => { if (lead.email && lead.email.length > 5) { const m = lead.email.split(',')[0].trim(); if (!grouped[m]) grouped[m] = []; grouped[m].push(lead); } });
        const totalGroups = Object.keys(grouped).length;
        setBulkProgress({ current: 0, total: totalGroups, logs: [] });
        const addBulkLog = (msg, success) => setBulkProgress(prev => ({ ...prev, logs: [...prev.logs, { msg, success }] }));
        let index = 0;
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
        for (const email in grouped) {
            index++;
            setBulkProgress(prev => ({ ...prev, current: index }));
            const group = grouped[email];
            const mainLead = group[0];
            const uniqueDomains = [...new Set(group.map(l => window.cleanDomain(l.url)))];
            const domainsString = uniqueDomains.length > 2 ? `${uniqueDomains[0]}, ${uniqueDomains[1]}...` : uniqueDomains.join(' ve ');
            let template = null;
            let targetStage = mainLead.stage || 0;
            if (bulkConfig.templateType === 'SPECIFIC') { targetStage = parseInt(bulkConfig.specificStage); template = getStageInfo(targetStage, mainLead.language || bulkConfig.language).template; }
            else { const info = getStageInfo(targetStage, mainLead.language || bulkConfig.language); if (info.isFinished) { addBulkLog(`${email}: SÃ¼reÃ§ bitmiÅŸ`, false); continue; } template = info.template; }
            if (!template) { addBulkLog(`${email}: Åžablon yok`, false); continue; }
            // A/B Test: Assign variant if A/B test is active
            const abVariant = Math.random() < 0.5 ? 'A' : 'B';
            try {
                const subject = template.subject.replace(/{{Website}}/g, domainsString);
                const body = template.body.replace(/{{Website}}/g, uniqueDomains.join(', '));
                const messageHtml = body.replace(/\n/g, '<br>');
                let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';
                const trackingPixel = serverUrl ? `<img src="${serverUrl}?type=track&id=${mainLead.id}" width="1" height="1" style="display:none;" alt="" />` : '';
                const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>${trackingPixel}`;
                const plainBody = body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');
                const result = await window.callGoogleScript(settings.googleScriptUrl, { action: 'send_mail', to: email, subject: subject, body: plainBody, htmlBody: htmlContent, threadId: mainLead.threadId || null });
                if (result.status === 'error') throw new Error(result.message);
                addBulkLog(`${email}: GÃ¶nderildi`, true);
                if (isDbConnected) {
                    const batch = dbInstance.batch();
                    group.forEach(l => {
                        const newLog = { date: new Date().toISOString(), type: 'MAIL', content: `Toplu GÃ¶nderildi: ${targetStage}. AÅŸama` };
                        const ref = dbInstance.collection("leads").doc(l.id);
                        const updateData = { statusKey: 'NO_REPLY', statusLabel: window.LEAD_STATUSES['NO_REPLY'].label, stage: targetStage + 1, lastContactDate: new Date().toISOString(), [`history.${targetStage === 0 ? 'initial' : `repeat${targetStage}`}`]: new Date().toISOString(), activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) };
                        if (result.threadId) updateData.threadId = result.threadId;
                        updateData.abVariant = abVariant;
                        batch.update(ref, updateData);
                    });
                    await batch.commit();
                }
            } catch (e) { addBulkLog(`${email}: Hata - ${e.message}`, false); }
            if (index < totalGroups) await new Promise(r => setTimeout(r, 2000));
        }
        setIsBulkSending(false); setSelectedIds(new Set()); alert("TamamlandÄ±."); setShowBulkModal(false);
    };

    const executeBulkPromotion = async () => {
        if (!bulkConfig.promotionSubject || !bulkConfig.promotionBody) {
            return alert("LÃ¼tfen promosyon konusunu ve iÃ§eriÄŸini doldurun!");
        }
        if (!confirm(`${selectedIds.size} site iÃ§in promosyon maili gÃ¶nderilecek. OnaylÄ±yor musunuz?`)) return;

        setIsBulkSending(true);
        const selectedLeads = crmData.filter(l => selectedIds.has(l.id));
        const grouped = {};
        selectedLeads.forEach(lead => { if (lead.email && lead.email.length > 5) { const m = lead.email.split(',')[0].trim(); if (!grouped[m]) grouped[m] = []; grouped[m].push(lead); } });
        const totalGroups = Object.keys(grouped).length;
        setBulkProgress({ current: 0, total: totalGroups, logs: [] });
        const addBulkLog = (msg, success) => setBulkProgress(prev => ({ ...prev, logs: [...prev.logs, { msg, success }] }));
        let index = 0;
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';

        // Google Script URL kontrolÃ¼
        if (!settings.googleScriptUrl) {
            addBulkLog("Google Script URL ayarlanmamÄ±ÅŸ!", false);
            setIsBulkSending(false);
            alert("Google Script URL ayarlanmamÄ±ÅŸ! LÃ¼tfen ayarlardan Google Script URL'nizi girin.");
            return;
        }

        for (const email in grouped) {
            index++;
            setBulkProgress(prev => ({ ...prev, current: index }));
            const group = grouped[email];
            const mainLead = group[0];
            const uniqueDomains = [...new Set(group.map(l => window.cleanDomain(l.url)))];

            try {
                // Promosyon maili iÃ§in subject ve body
                const subject = (bulkConfig.promotionSubject || '').replace(/{{Website}}/g, uniqueDomains.join(', '));
                const body = (bulkConfig.promotionBody || '').replace(/{{Website}}/g, uniqueDomains.join(', '));

                const messageHtml = body.replace(/\n/g, '<br>');
                let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';
                const trackingPixel = serverUrl ? `<img src="${serverUrl}?type=track&id=${mainLead.id}" width="1" height="1" style="display:none;" alt="" />` : '';
                const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>${trackingPixel}`;
                const plainBody = body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');

                console.log("Promosyon maili gÃ¶nderiliyor:", { to: email, subject: subject });

                const result = await window.callGoogleScript(settings.googleScriptUrl, { action: 'send_mail', to: email, subject: subject, body: plainBody, htmlBody: htmlContent, threadId: null });
                console.log("JSON yanÄ±tÄ±:", result);

                if (result.status === 'error') throw new Error(result.message || 'Bilinmeyen hata');

                addBulkLog(`${email}: Promosyon gÃ¶nderildi`, true);

                if (isDbConnected) {
                    const batch = dbInstance.batch();
                    group.forEach(l => {
                        const newLog = { date: new Date().toISOString(), type: 'MAIL', content: `Promosyon Mail GÃ¶nderildi` };
                        const ref = dbInstance.collection("leads").doc(l.id);
                        const updateData = {
                            statusKey: 'NO_REPLY',
                            statusLabel: window.LEAD_STATUSES['NO_REPLY'].label,
                            lastContactDate: new Date().toISOString(),
                            activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
                        };
                        if (result.threadId) updateData.threadId = result.threadId;
                        batch.update(ref, updateData);
                    });
                    await batch.commit();
                }
            } catch (e) {
                console.error("Promosyon gÃ¶nderim hatasÄ±:", e);
                addBulkLog(`${email}: Hata - ${e.message}`, false);
            }
            if (index < totalGroups) await new Promise(r => setTimeout(r, 2000));
        }
        setIsBulkSending(false); setSelectedIds(new Set()); alert("Promosyon gönderimi tamamlandı!"); setShowBulkModal(false);
    };

    const handleBulkReplyCheck = async () => {
        if (selectedIds.size === 0) return alert("Kayıt seçin.");
        setIsCheckingBulk(true);
        setIsFixingConsistency(true);
        setShowFixLogModal(true);
        setFixConsistencyLogs([]);
        const addLog = (msg, type = 'info') => {
            const time = new Date().toLocaleTimeString('tr-TR');
            setFixConsistencyLogs(prev => [...prev, { time, msg, type }]);
        };

        addLog(`${selectedIds.size} kayıt için Gmail cevap kontrolü başladı...`, 'info');

        // 1. Thread ID'si olmayan ama emaili olan kayıtları bul ve Gmail'den thread'lerini kurtarmayı dene
        const missingThreadLeads = crmData.filter(lead => selectedIds.has(lead.id) && !lead.threadId && lead.email && lead.email.length > 5);
        let recoveredCount = 0;
        let recoveryApiMissing = false;
        let recoveryLastError = '';

        if (missingThreadLeads.length > 0) {
            addLog(`${missingThreadLeads.length} kayıt için eksik Thread ID kurtarma denemesi yapılıyor...`, 'info');
            for (const lead of missingThreadLeads) {
                try {
                    const email = lead.email.split(',')[0].trim();
                    const result = await window.callGoogleScript(settings.googleScriptUrl, { action: 'check_thread_by_email', to: email });
                    if (result.status === 'success' && result.threadId) {
                        await dbInstance.collection("leads").doc(lead.id).update({ threadId: result.threadId });
                        lead.threadId = result.threadId;
                        setCrmData(prev => prev.map(p => p.id === lead.id ? { ...p, threadId: result.threadId } : p));
                        recoveredCount++;
                        addLog(`🔗 Thread kurtarıldı: ${window.cleanDomain(lead.url)}`, 'success');
                    } else if (result.status === 'error') {
                        const msg = (result.message || '').toString();
                        recoveryLastError = msg || 'Thread recovery error';
                        if (msg.toLowerCase().includes('bilinmeyen') || msg.toLowerCase().includes('unknown')) {
                            recoveryApiMissing = true;
                        }
                    }
                } catch (e) { console.warn(`Thread recovery failed for ${lead.id}:`, e); }
                await new Promise(r => setTimeout(r, 500));
            }
        }

        if (recoveryApiMissing) {
            setIsCheckingBulk(false);
            setIsFixingConsistency(false);
            setShowFixLogModal(false);
            return alert("Google Script güncel değil: 'check_thread_by_email' action'ı bulunamadı. Apps Script'e son google-script.js kodunu deploy etmelisin.");
        }

        // 2. Artık thread ID'si olan tüm kayıtları kontrol et
        const candidates = crmData.filter(lead => selectedIds.has(lead.id) && lead.threadId);
        if (candidates.length === 0) {
            setIsCheckingBulk(false);
            setIsFixingConsistency(false);
            const extra = recoveryLastError ? `\nDetay: ${recoveryLastError}` : '';
            addLog("Eşleşen Thread ID bulunamadı.", 'warning');
            return alert("Thread ID bulunamadı. Seçili kayıtlar için Gmail'de yazışma kaydı bulunamadı." + extra);
        }
        
        addLog(`${candidates.length} kayıt için toplu cevap kontrolü yapılıyor...`, 'info');

        if (!confirm(`${candidates.length} kayıt kontrol edilecek${recoveredCount > 0 ? ` (${recoveredCount} kayıt için thread kurtarıldı)` : ''}. Devam?`)) {
            setIsCheckingBulk(false);
            setIsFixingConsistency(false);
            setShowFixLogModal(false);
            return;
        }
        try {
            const data = await window.callGoogleScript(settings.googleScriptUrl, { action: 'check_replies_bulk', threadIds: candidates.map(c => c.threadId) });
            if (data.status === 'success') {
                const results = data.results; let updatedCount = 0; let bounceCount = 0; const batch = dbInstance.batch(); let hasUpdates = false;
                candidates.forEach(lead => {
                    const result = results[lead.threadId];
                    if (result && result.hasReply) {
                        const ref = dbInstance.collection("leads").doc(lead.id);
                        const updates = {};
                        const domain = window.cleanDomain(lead.url);

                        if (result.isBounce) {
                            if (lead.statusKey !== 'MAIL_ERROR') {
                                updates.statusKey = 'MAIL_ERROR'; updates.statusLabel = 'Error in mail (Bounced)'; updates.email = ''; updates.lastContactDate = new Date().toISOString(); updates.activityLog = firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), type: 'BOUNCE', content: `Otomatik Tarama: Mail İletilemedi (Bounce)` }); bounceCount++;
                                addLog(`❌ Bounce: ${domain}`, 'error');
                            }
                        } else {
                            if (result.from && !lead.contactName) {
                                const extractedName = window.extractNameFromEmail(result.from);
                                if (extractedName) updates.contactName = extractedName;
                            }
                            if (!['INTERESTED', 'DEAL_ON', 'NOT_POSSIBLE', 'DENIED', 'MAIL_ERROR', 'IN_PROCESS', 'ASKED_MORE'].includes(lead.statusKey)) {
                                // Smart reply categorization
                                const replyCategory = window.categorizeReply(result.snippet, result.from);
                                const categoryStatusMap = {
                                    'INTERESTED': 'INTERESTED',
                                    'ASKED_MORE': 'ASKED_MORE',
                                    'DENIED': 'DENIED',
                                    'FOLLOW_LATER': 'FOLLOW_LATER',
                                    'NEEDS_REVIEW': 'NEEDS_REVIEW'
                                };
                                const newStatus = categoryStatusMap[replyCategory.category] || 'NEEDS_REVIEW';
                                const statusLabel = window.LEAD_STATUSES[newStatus]?.label || replyCategory.category;

                                updates.statusKey = newStatus;
                                updates.statusLabel = statusLabel + ' (Auto)';
                                updates.lastContactDate = new Date().toISOString();
                                updates.activityLog = firebase.firestore.FieldValue.arrayUnion({
                                    date: new Date().toISOString(),
                                    type: 'REPLY',
                                    content: `Sistem: ${replyCategory.suggestion} (${result.snippet?.substring(0, 40)}...)`
                                });

                                // If denied, stop auto followup
                                if (newStatus === 'DENIED' || newStatus === 'FOLLOW_LATER') {
                                    updates.autoFollowupEnabled = false;
                                }

                                updatedCount++;
                                addLog(`✅ Cevap: ${domain} -> ${newStatus}`, 'success');
                            }
                        }
                        if (Object.keys(updates).length > 0) { batch.update(ref, updates); hasUpdates = true; }
                    }
                });
                if (hasUpdates) { 
                    addLog(`Toplu gÃ¼ncelleme yapÄ±lÄ±yor (${updatedCount} lead)...`, 'info');
                    addLog(`Toplu güncelleme yapılıyor (${updatedCount} lead)...`, 'info');
                    await batch.commit(); 
                    addLog("İşlem başarıyla tamamlandı.", 'success');
                    alert(`Tarama Tamamlandı!\n✅ ${updatedCount} yeni cevap\n❌ ${bounceCount} bounce${recoveredCount > 0 ? `\n🔗 ${recoveredCount} eksik thread kurtarıldı` : ''}`); 
                } else { 
                    addLog("Yeni bir cevap veya bounce bulunamadı.", 'warning');
                    alert(`Değişiklik yok.${recoveredCount > 0 ? ` (${recoveredCount} eksik thread kurtarıldı)` : ''}`); 
                }
            } else { 
                addLog(`Hata: ${data.message}`, 'error');
                alert("Hata: " + data.message); 
            }
        } catch (e) { 
            addLog(`Bağlantı Hatası: ${e.message}`, 'error');
            alert("Bağlantı Hatası: " + e.message); 
        } finally {
            addLog("İşlem bitti.");
            setIsCheckingBulk(false);
            setTimeout(() => {
                setIsFixingConsistency(false);
                setShowFixLogModal(false);
            }, 3000);
        }
    };


    // --- HIZLI INBOX SENKRONU (YENÄ° MODEL) ---
    const syncInboxReplies = async (limit = 100) => {
        if (!isDbConnected || !dbInstance) return alert("VeritabanÄ± baÄŸlÄ± deÄŸil!");
        if (!settings.googleScriptUrl) return alert("Google Script URL ayarlÄ± deÄŸil!");

        setIsCheckingBulk(true);
        setIsFixingConsistency(true);
        setShowFixLogModal(true);
        setFixConsistencyLogs([]);
        const addLog = (msg, type = 'info') => {
            const time = new Date().toLocaleTimeString('tr-TR');
            setFixConsistencyLogs(prev => [...prev, { time, msg, type }]);
        };

        addLog(`Gmail inbox senkronizasyonu baÅŸladÄ±... (Limit: ${limit})`, 'info');
        
        try {
            const data = await window.callGoogleScript(settings.googleScriptUrl, { action: 'sync_inbox', limit: limit, query: 'label:inbox' });
            if (data.status !== 'success') throw new Error(data.message || "Gmail baÄŸlantÄ± hatasÄ±");
            
            const gmailReplies = data.results || [];
            addLog(`Gmail'den ${gmailReplies.length} adet gÃ¼ncel mesaj Ã§ekildi.`, 'info');
            
            if (gmailReplies.length === 0) {
                addLog("Inbox'ta yeni cevap bulunamadÄ±.", 'warning');
                return;
            }

            let matchedCount = 0;
            const batch = dbInstance.batch();
            const localUpdates = {};
            const emailMap = new Map();
            const threadMap = new Map();
            
            addLog("VeritabanÄ± eÅŸleÅŸtirmesi iÃ§in domain haritasÄ± Ã§Ä±karÄ±lÄ±yor...", 'info');
            crmData.forEach(l => {
                if (l.email) l.email.split(',').map(e => e.trim().toLowerCase()).filter(Boolean).forEach(e => emailMap.set(e, l));
                if (l.threadId) threadMap.set(l.threadId, l);
            });

            gmailReplies.forEach((reply, idx) => {
                let matchedLead = threadMap.get(reply.threadId);
                if (!matchedLead) {
                    const fromEmail = (reply.from.match(/<([^>]+)>/)?.[1] || reply.from).trim().toLowerCase();
                    matchedLead = emailMap.get(fromEmail);
                }
                
                if (matchedLead) {
                    const domain = window.cleanDomain(matchedLead.url);
                    const sk = matchedLead.statusKey || 'New';
                    if (['New', 'NO_REPLY', 'READY_TO_SEND', 'MAIL_ERROR'].includes(sk)) {
                        const ref = dbInstance.collection("leads").doc(matchedLead.id);
                        const category = window.categorizeReply(reply.snippet, reply.from);
                        const newStatus = ['INTERESTED', 'ASKED_MORE', 'DENIED', 'FOLLOW_LATER'].includes(category.category) ? category.category : 'NEEDS_REVIEW';
                        
                        const updates = {
                            statusKey: newStatus,
                            statusLabel: (window.LEAD_STATUSES[newStatus]?.label || newStatus) + ' (Fast Sync)',
                            lastContactDate: new Date().toISOString(),
                            threadId: reply.threadId,
                            activityLog: firebase.firestore.FieldValue.arrayUnion({ 
                                date: new Date().toISOString(), 
                                type: 'REPLY', 
                                content: `Inbox Sync: ${reply.snippet.substring(0, 60)}...` 
                            })
                        };
                        
                        if (newStatus === 'DENIED' || newStatus === 'FOLLOW_LATER') updates.autoFollowupEnabled = false;
                        
                        batch.update(ref, updates);
                        localUpdates[matchedLead.id] = updates;
                        matchedCount++;
                        addLog(`âœ… EÅŸleÅŸti: ${domain} (${newStatus})`, 'success');
                    }
                }
                
                if (idx > 0 && idx % 20 === 0) {
                    addLog(`${idx} mesaj kontrol edildi...`, 'info');
                }
            });

            if (matchedCount > 0) {
                addLog(`${matchedCount} kayÄ±t iÃ§in toplu gÃ¼ncelleme yapÄ±lÄ±yor...`, 'info');
                await batch.commit();
                setCrmData(prev => prev.map(l => localUpdates[l.id] ? { ...l, ...localUpdates[l.id], activityLog: [...(l.activityLog || []), { date: new Date().toISOString(), type: 'REPLY', content: 'HÄ±zlÄ± senkron ile gÃ¼ncellendi.' }] } : l));
                addLog(`Ä°ÅŸlem baÅŸarÄ±yla tamamlandÄ±! ${matchedCount} lead gÃ¼ncellendi.`, 'success');
                alert(`${matchedCount} lead iÃ§in yeni cevap eÅŸleÅŸtirildi ve gÃ¼ncellendi!`);
            } else {
                addLog("EÅŸleÅŸen yeni bir mesaj bulunamadÄ±.", 'warning');
                alert("Inbox'taki mesajlar mevcut lead'lerle eÅŸleÅŸmedi.");
            }
        } catch (err) {
            addLog(`Hata: ${err.message}`, 'error');
            alert("Hata: " + err.message);
        } finally {
            addLog("Ä°ÅŸlem bitti.");
            setTimeout(() => setIsFixingConsistency(false), 2000);
        }
    };

    const bulkUpdateStatus = async (newStatusKey) => {
        if (selectedIds.size === 0) return alert("LÃ¼tfen kayÄ±t seÃ§in.");
        if (!isDbConnected) return alert("VeritabanÄ± baÄŸlÄ± deÄŸil.");
        const statusLabel = window.LEAD_STATUSES[newStatusKey]?.label || newStatusKey;
        if (!confirm(`SeÃ§ili ${selectedIds.size} kaydÄ±n durumu '${statusLabel}' olarak gÃ¼ncellenecek. OnaylÄ±yor musunuz?`)) return;
        const batch = dbInstance.batch(); const timestamp = new Date().toISOString();
        const newLog = { date: timestamp, type: 'SYSTEM', content: `Durum manuel olarak '${statusLabel}' yapÄ±ldÄ± (Toplu Ä°ÅŸlem).` };
        selectedIds.forEach(id => { const ref = dbInstance.collection("leads").doc(id); batch.update(ref, { statusKey: newStatusKey, statusLabel: statusLabel, activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) }); });
        try { await batch.commit(); setCrmData(prev => prev.map(item => { if (selectedIds.has(item.id)) { return { ...item, statusKey: newStatusKey, statusLabel: statusLabel, activityLog: [...(item.activityLog || []), newLog] }; } return item; })); setSelectedIds(new Set()); alert("Durumlar baÅŸarÄ±yla gÃ¼ncellendi."); } catch (e) { alert("Hata: " + e.message); }
    };

    const bulkUpdateLanguage = async (newLang) => {
        if (selectedIds.size === 0) return alert("LÃ¼tfen kayÄ±t seÃ§in.");
        if (!isDbConnected) return alert("VeritabanÄ± baÄŸlÄ± deÄŸil.");
        if (!['TR', 'EN'].includes(newLang)) return alert("GeÃ§ersiz dil.");
        if (!confirm(`SeÃ§ili ${selectedIds.size} kaydÄ±n dili '${newLang}' olarak gÃ¼ncellenecek. OnaylÄ±yor musunuz?`)) return;
        const batch = dbInstance.batch();
        const timestamp = new Date().toISOString();
        const newLog = { date: timestamp, type: 'SYSTEM', content: `Dil manuel olarak '${newLang}' yapÄ±ldÄ± (Toplu Ä°ÅŸlem).` };
        selectedIds.forEach(id => {
            const ref = dbInstance.collection("leads").doc(id);
            batch.update(ref, { language: newLang, activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) });
        });
        try {
            await batch.commit();
            setCrmData(prev => prev.map(item => selectedIds.has(item.id) ? { ...item, language: newLang, activityLog: [...(item.activityLog || []), newLog] } : item));
            setSelectedIds(new Set());
            alert("Diller baÅŸarÄ±yla gÃ¼ncellendi.");
        } catch (e) { alert("Hata: " + e.message); }
    };

    const bulkUpdateStage = async (newStage) => {
        if (selectedIds.size === 0) return alert("LÃ¼tfen kayÄ±t seÃ§in.");
        if (!isDbConnected) return alert("VeritabanÄ± baÄŸlÄ± deÄŸil.");
        const stageInt = parseInt(newStage);
        if (isNaN(stageInt) || stageInt < 0) return alert("GeÃ§ersiz aÅŸama.");
        // stage deÄŸeri "son gÃ¶nderilen + 1" ÅŸeklinde saklanÄ±yor (workflow index + 1)
        // KullanÄ±cÄ±ya gÃ¶sterilen "son gÃ¶nderilen" deÄŸerine karÅŸÄ±lÄ±k DB'deki stage = value + 1
        const workflow = settings.workflowTR || [];
        const label = stageInt === 0 ? 'HenÃ¼z GÃ¶nderilmedi' : (workflow[stageInt - 1]?.label || `AÅŸama ${stageInt}`);
        if (!confirm(`SeÃ§ili ${selectedIds.size} kaydÄ±n son gÃ¶nderilen maili '${label}' olarak gÃ¼ncellenecek. OnaylÄ±yor musunuz?`)) return;
        const batch = dbInstance.batch();
        const timestamp = new Date().toISOString();
        const newLog = { date: timestamp, type: 'SYSTEM', content: `Son gÃ¶nderilen mail manuel olarak '${label}' yapÄ±ldÄ± (Toplu Ä°ÅŸlem).` };
        selectedIds.forEach(id => {
            const ref = dbInstance.collection("leads").doc(id);
            batch.update(ref, { stage: stageInt, activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) });
        });
        try {
            await batch.commit();
            setCrmData(prev => prev.map(item => selectedIds.has(item.id) ? { ...item, stage: stageInt, activityLog: [...(item.activityLog || []), newLog] } : item));
            setSelectedIds(new Set());
            alert("AÅŸamalar baÅŸarÄ±yla gÃ¼ncellendi.");
        } catch (e) { alert("Hata: " + e.message); }
    };

    const bulkAddNotViable = async () => {
        if (selectedIds.size === 0 || !isDbConnected) return;
        if (!confirm(`${selectedIds.size} adet site 'Not Viable' olarak eklenecek.`)) return;
        const batch = dbInstance.batch(); let count = 0;
        selectedIds.forEach(id => { const lead = leads.find(l => l.id === id); if (lead && !crmData.some(c => window.normalizeMainDomain(c.url) === window.normalizeMainDomain(lead.url))) { batch.set(dbInstance.collection("leads").doc(), { url: window.normalizeMainDomain(lead.url), email: lead.email || '', statusKey: 'NOT_VIABLE', statusLabel: 'Not Viable', stage: 0, language: 'TR', trafficStatus: lead.trafficStatus || { viable: false }, addedDate: new Date().toISOString() }); count++; } });
        if (count > 0) { await batch.commit(); setLeads(prev => prev.filter(l => !selectedIds.has(l.id))); setSelectedIds(new Set()); alert(`${count} site eklendi.`); }
    };

    // --- ARKA PLAN VERÄ° ZENGÄ°NLEÅžTÄ°RME (Sunucu TarafÄ±nda) ---
    const enrichDatabase = async (mode = 'BOTH') => {
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
        if (!serverUrl) return alert('Sunucu URL tanÄ±mlÄ± deÄŸil!');

        // Enrich endpoint URL'si (traffic-api.php ile aynÄ± dizinde)
        const enrichApiUrl = serverUrl.replace('traffic-api.php', 'cron/enrich-background.php');

        setShowEnrichModal(true);
        setIsEnriching(true);
        setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'Sunucuya istek gÃ¶nderiliyor...', type: 'info' }]);
        setEnrichProgress({ current: 0, total: 0 });

        try {
            // Sunucuya baÅŸlatma isteÄŸi gÃ¶nder
            const startResp = await fetch(`${enrichApiUrl}?action=start&mode=${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const startResult = await startResp.json();

            if (!startResult.success) {
                if (startResult.status === 'already_running') {
                    setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'Bir zenginleÅŸtirme iÅŸlemi zaten Ã§alÄ±ÅŸÄ±yor! Durumu takip ediliyor...', type: 'warning' }]);
                } else {
                    setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'Hata: ' + startResult.message, type: 'error' }]);
                    setIsEnriching(false);
                    return;
                }
            } else {
                setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'Ä°ÅŸlem sunucuda baÅŸlatÄ±ldÄ±! TarayÄ±cÄ±yÄ± kapatabilirsiniz.', type: 'success' }]);
            }

            // Polling baÅŸlat: Sunucudan progress bilgisini her 3 saniyede Ã§ek
            if (enrichPollRef.current) clearInterval(enrichPollRef.current);

            enrichPollRef.current = setInterval(async () => {
                try {
                    const statusResp = await fetch(`${enrichApiUrl}?action=status`);
                    const statusResult = await statusResp.json();

                    if (statusResult.success && statusResult.data) {
                        const d = statusResult.data;

                        // Progress gÃ¼ncelle
                        setEnrichProgress({ current: d.current || 0, total: d.total || 0 });

                        // Log'larÄ± gÃ¼ncelle (sunucudan gelen tÃ¼m loglarÄ± yansÄ±t)
                        if (d.logs && Array.isArray(d.logs)) {
                            setEnrichLogs(d.logs);
                        }

                        // Ä°ÅŸlem tamamlandÄ± / durduruldu / hata
                        if (d.status === 'completed' || d.status === 'error') {
                            clearInterval(enrichPollRef.current);
                            enrichPollRef.current = null;
                            setIsEnriching(false);

                            // Firestore'dan gÃ¼ncel verileri tekrar yÃ¼kle
                            if (isDbConnected) {
                                try {
                                    const snapshot = await dbInstance.collection('leads').get();
                                    const freshData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                                    setCrmData(freshData);
                                } catch (e) { console.warn('Veri yenileme hatasÄ±:', e); }
                            }
                        }
                    }
                } catch (pollErr) {
                    console.warn('Enrich polling hatasÄ±:', pollErr);
                }
            }, 3000);

        } catch (err) {
            setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'Sunucu baÄŸlantÄ± hatasÄ±: ' + err.message, type: 'error' }]);
            setIsEnriching(false);
        }
    };

    // Arka plan zenginleÅŸtirmeyi durdur
    const stopEnrichBackground = async () => {
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
        const enrichApiUrl = serverUrl.replace('traffic-api.php', 'cron/enrich-background.php');
        try {
            await fetch(`${enrichApiUrl}?action=stop`, { method: 'POST' });
            setEnrichLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: 'Durdurma isteÄŸi gÃ¶nderildi...', type: 'warning' }]);
        } catch (e) {
            alert('Durdurma hatasÄ±: ' + e.message);
        }
    };

    const runAutoHunterScan = async () => {
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        if (!settings.ilceListesi) return alert("İlçe listesi boş.");
        if (isHunterRunning) return;

        setIsHunterRunning(true);
        autoHunterRef.current.isRunning = true;
        
        const addLog = (message, type = 'info') => {
            const time = new Date().toLocaleTimeString('tr-TR');
            setAutoHunterLogs(prev => [...prev.slice(-199), { time, message, type }]);
        };

        const saveProgress = async (msg) => {
            try {
                await dbInstance.collection('settings').doc('general').update({
                    lastHunterIlceIndex: currentIlceIndex,
                    lastHunterRunDate: new Date().toISOString()
                });
            } catch (e) { console.error("Progress save error:", e); }
        };

        const ilceler = settings.ilceListesi.split('\n').map(s => s.trim()).filter(Boolean);
        let currentIlceIndex = settings.lastHunterIlceIndex || 0;
        const targetCount = settings.hunterTargetCount || 100;

        let totalSearches = 0;
        let totalAdded = 0;
        let fullDataCount = 0;

        addLog(`🚀 Otomatik tarama başladı. Hedef: ${targetCount} site.`, 'success');

        try {
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
            const existingDomains = new Set(crmData.map(l => window.normalizeMainDomain(l.url)).filter(Boolean));

            while (autoHunterRef.current.isRunning && currentIlceIndex < ilceler.length) {
                const ilce = ilceler[currentIlceIndex];
                let foundViableCount = 0;

                const searchQueries = [
                    `${ilce} haberleri`,
                    `${ilce} son dakika haber`,
                    `${ilce} yerel haberler`,
                    `${ilce} gazete`,
                    `${ilce} haber sitesi`
                ];

                for (const query of searchQueries) {
                    if (!autoHunterRef.current.isRunning) break;
                    if (foundViableCount >= targetCount) break;

                    addLog(`🔍 Sorgu: ${query}`, 'info');
                    totalSearches++;

                    let searchResult = null;
                    let googleFailed = false, braveFailed = false, bingFailed = false, duckduckgoFailed = false, dataforseoFailed = false;

                    // Google Search (Proxy)
                    try {
                        const url = `${serverUrl}?type=search&q=${encodeURIComponent(query)}&depth=20`;
                        const response = await fetch(url);
                        const text = await response.text();
                        let json = JSON.parse(text);
                        if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                            searchResult = { results: json.results, engine: 'google' };
                        } else {
                            googleFailed = true;
                        }
                    } catch (e) {
                        googleFailed = true;
                    }

                    // Brave Search (Google başarısızsa)
                    if (!searchResult && !braveFailed) {
                        console.log(`[AutoHunter] Brave deneniyor: ${query}`);
                        const url = `${serverUrl}?type=search_brave&q=${encodeURIComponent(query)}&depth=20`;
                        try {
                            const response = await fetch(url);
                            const text = await response.text();
                            let json = JSON.parse(text);
                            if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                                searchResult = { results: json.results, engine: 'brave' };
                            } else {
                                braveFailed = true;
                            }
                        } catch (e) {
                            braveFailed = true;
                        }
                    }
                // Bing Search API (Brave baÃ…Å¸arÃ„Â±sÃ„Â±zsa)
                if (!searchResult && !bingFailed) {
                    console.log(`[AutoHunter] Bing deneniyor: ${query}`);
                    const url = `${serverUrl}?type=search_bing&q=${encodeURIComponent(query)}&depth=20&gl=tr`;
                    try {
                        const response = await fetch(url);
                        const text = await response.text();
                        let json = JSON.parse(text);
                        if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                            searchResult = { results: json.results, engine: 'bing' };
                        } else {
                            bingFailed = true;
                        }
                    } catch (e) {
                        bingFailed = true;
                    }
                }
                
                // DuckDuckGo (Scraper) (Bing baÃ…Å¸arÃ„Â±sÃ„Â±zsa)
                if (!searchResult && !duckduckgoFailed) {
                    console.log(`[AutoHunter] DDG deneniyor: ${query}`);
                    const url = `${serverUrl}?type=search_ddg&q=${encodeURIComponent(query)}&depth=20`;
                    try {
                        const response = await fetch(url);
                        const text = await response.text();
                        let json = JSON.parse(text);
                        if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                            searchResult = { results: json.results, engine: 'ddg' };
                        } else {
                            duckduckgoFailed = true;
                        }
                    } catch (e) {
                        duckduckgoFailed = true;
                    }
                }
                
                // DataForSEO API (DuckDuckGo baÃ…Å¸arÃ„Â±sÃ„Â±zsa - SON Ãƒâ€¡ARE)
                if (!searchResult && !dataforseoFailed) {
                    console.log(`[AutoHunter] DataForSEO deneniyor: ${query}`);
                    const url = `${serverUrl}?type=search_dataforseo&q=${encodeURIComponent(query)}&depth=20`;
                    try {
                        const response = await fetch(url);
                        const text = await response.text();
                        let json = JSON.parse(text);
                        if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                            searchResult = { results: json.results, engine: 'dataforseo' };
                        } else {
                            dataforseoFailed = true;
                        }
                    } catch (e) {
                        dataforseoFailed = true;
                    }
                }

                if (searchResult) {
                    const engineEmoji = { google: 'ÄŸÅ¸â€ Â¬', brave: 'ÄŸÅ¸Â¦\u0081', bing: 'ÄŸÅ¸â€™Â¶', ddg: 'ÄŸÅ¸Â¦â€ ', dataforseo: 'ÄŸÅ¸â€™Â°' }[searchResult.engine] || 'ÄŸÅ¸â€ \u008D';
                    addLog(`${engineEmoji} ${query} iÃƒÂ§in ${searchResult.results.length} site bulundu.`, 'info');

                    for (const r of searchResult.results) {
                        if (!autoHunterRef.current.isRunning) break;
                        if (foundViableCount >= targetCount) break;

                        const domain = window.normalizeMainDomain(r.url);
                        if (!domain || existingDomains.has(domain)) continue;

                        // Belirgin haber portalÃ„Â± deÃ„Å¸ilse atla
                        if (!/\.(bel|gov|edu|k12|pol|tsk|mil)\.tr$/i.test(domain)) {
                            existingDomains.add(domain);
                            
                            // Traffic Check
                            const traffic = await window.checkTraffic(domain);
                            if (traffic && traffic.viable) {
                                foundViableCount++;
                                setAutoHunterStats(prev => ({ ...prev, totalFound: foundViableCount }));
                                
                                // Email Check
                                const email = await window.findEmailsOnSite(domain);
                                let hasFullData = email && email.length > 5;
                                
                                if (hasFullData) {
                                    fullDataCount++;
                                    setAutoHunterStats(prev => ({ ...prev, fullData: fullDataCount }));
                                }

                                // Firestore Save
                                try {
                                    const leadId = Math.random().toString(36).substr(2, 9);
                                    const leadData = {
                                        url: domain,
                                        email: email || '',
                                        statusKey: 'New',
                                        statusLabel: 'New',
                                        stage: 0,
                                        language: 'TR',
                                        trafficStatus: traffic,
                                        addedDate: new Date().toISOString(),
                                        source: `AutoHunter (${ilce})`
                                    };
                                    
                                    await dbInstance.collection('leads').add(leadData);
                                    totalAdded++;
                                    addLog(`Ã¢Å“â€¦ Eklendi: ${domain} (${hasFullData ? 'E-posta OK' : 'E-posta yok'})`, 'success');
                                    
                                    // Local state gÃƒÂ¼ncelle
                                    setCrmData(prev => [...prev, { id: leadId, ...leadData }]);
                                    
                                } catch (e) {
                                    addLog(`Ã¢ Å’ Firestore kayÃ„Â±t hatasÃ„Â±: ${domain} - ${e.message}`, 'error');
                                }
                            }
                        }
                        // API'yi yormamak iÃƒÂ§in kÃ„Â±sa bekleme
                        await new Promise(r => setTimeout(r, 500));
                    }
                } else {
                    addLog(`Ã¢Å¡Â Ã¯Â¸  TÃƒÂ¼m arama motorlarÃ„Â± kota veya hata verdi: ${query}`, 'warn');
                    // TÃƒÂ¼m arama motorlarÃ„Â± patladÃ„Â±ysa bir sÃƒÂ¼re bekle
                    await new Promise(r => setTimeout(r, 10000));
                    
                    // EÃ„Å¸er tÃƒÂ¼m motorlar baÃ…Å¸arÃ„Â±sÃ„Â±zsa ve henÃƒÂ¼z hiÃƒÂ§bir Ã…Å¸ey bulamadÃ„Â±ysak durdurabiliriz
                    if (googleFailed && braveFailed && bingFailed && duckduckgoFailed && dataforseoFailed) {
                        addLog(`Ã¢â‚¬Â¼Ã¯Â¸  KRÃ„Â°TÃ„Â°K: TÃƒÂ¼m arama API'larÃ„Â± devre dÃ„Â±Ã…Å¸Ã„Â±! Tarama durduruluyor.`, 'error');
                        autoHunterRef.current.isRunning = false;
                        break;
                    }
                }
                
                // Sorgular arasÃ„Â± bekleme
                await new Promise(r => setTimeout(r, 1500));
            }
            
            currentIlceIndex++;
            // Her ilÃƒÂ§e bitiminde progress kaydet
            await saveProgress('ilÃƒÂ§e geÃƒÂ§iÃ…Å¸i');
            
            // Kota dostu bekleme
            await new Promise(r => setTimeout(r, 3000));
        }
        } catch (fatalErr) {
            addLog(`ÄŸÅ¸â€™Â¥ Kritik Tarama HatasÃ„Â±: ${fatalErr.message}`, 'error');
            console.error("[AutoHunter] FATAL ERROR:", fatalErr);
        }

        autoHunterRef.current.isRunning = false;
        setIsHunterRunning(false);
        addLog(`ÄŸÅ¸\u008F\u0081 Tarama Bitti. Toplam: ${totalSearches} arama, ${totalAdded} yeni site, ${fullDataCount} tam verili.`, 'success');
        
        await saveProgress('final');
        alert(`Otomatik tarama tamamlandÃ„Â±!\nEklenen: ${totalAdded}\nTam Verili: ${fullDataCount}`);
    };

    const stopAutoHunterScan = () => {
        autoHunterRef.current.isRunning = false;
        setIsHunterRunning(false);
        const time = new Date().toLocaleTimeString('tr-TR');
        setAutoHunterLogs(prev => [...prev, { time, message: "ÄŸÅ¸â€ºâ€˜ KullanÃ„Â±cÃ„Â± tarafÃ„Â±ndan durduruldu.", type: 'warning' }]);
    };

    const fixLeadConsistency = async () => {
        if (!isDbConnected) return alert("VeritabanÃ„Â± baÃ„Å¸lÃ„Â± deÃ„Å¸il.");
        if (!confirm("TÃƒÂ¼m lead verileri taranacak ve dÃƒÂ¼zeltilecek (Bozuk URL'ler, YanlÃ„Â±Ã…Å¸ Statusler vb.). Devam edilsin mi?")) return;
        
        let fixCount = 0;
        let urlFixCount = 0;
        const allLeads = crmData;
        const batch = dbInstance.batch();
        let batchCount = 0;
        const allUpdates = {};

        for (const lead of allLeads) {
            const updates = {};
            
            // 1. URL DÃƒÅ“ZELTME (YanlÃ„Â±Ã…Å¸ formatlarÃ„Â± ciplak domaine cevir)
            const cleanUrl = window.normalizeMainDomain(lead.url);
            if (cleanUrl && cleanUrl !== lead.url) {
                updates.url = cleanUrl;
                urlFixCount++;
            }

            // 2. STATUS TUTARLILIÃ„\u009EI
            // Eger statusKey yoksa veya New ise ama stage > 0 ise NO_REPLY yap
            if ((!lead.statusKey || lead.statusKey === 'New') && (lead.stage || 0) > 0) {
                updates.statusKey = 'NO_REPLY';
                updates.statusLabel = window.LEAD_STATUSES['NO_REPLY'].label;
            }

            // 3. BOUNCE KONTROLÃƒÅ“ (Activity logda BOUNCE varsa statusu MAIL_ERROR yap)
            const hasBounce = Array.isArray(lead.activityLog) && lead.activityLog.some(a => a.type === 'BOUNCE');
            if (hasBounce && lead.statusKey !== 'MAIL_ERROR') {
                updates.statusKey = 'MAIL_ERROR';
                updates.statusLabel = 'Error in mail (Bounced)';
            }

            if (Object.keys(updates).length > 0) {
                const ref = dbInstance.collection("leads").doc(lead.id);
                batch.update(ref, updates);
                allUpdates[lead.id] = updates;
                batchCount++;
                fixCount++;
                
                if (batchCount >= 450) {
                    await batch.commit();
                    batchCount = 0;
                }
            }
        }

        if (batchCount > 0) await batch.commit();
        setCrmData(prev => prev.map(p => allUpdates[p.id] ? { ...p, ...allUpdates[p.id] } : p));
        alert(`${allLeads.length} lead tarandÃ„Â±.\n${fixCount} tanesi dÃƒÂ¼zeltildi.\n(${urlFixCount} tanesinin URL'si yalÃ„Â±n domaine ÃƒÂ§evrildi.)`);
    };

    // --- VERI TUTARLILIGI V2 (CIplak domain + merge) ---
    const fixLeadConsistencyV2 = async () => {
        if (!isDbConnected || !dbInstance) return alert("Veritabani bagli degil!");
        if (!confirm("Tutarsiz lead verileri duzeltilecek ve ayni ciplak domaine ait mukerrer satirlar birlestirilecek.\nDevam edilsin mi?")) return;
        setIsFixingConsistency(true);
        setShowFixLogModal(true);
        setFixConsistencyLogs([]);
        const addFixLog = (message, type = 'info') => {
            const time = new Date().toLocaleTimeString('tr-TR');
            setFixConsistencyLogs(prev => [...prev.slice(-299), { time, message, type }]);
        };
        addFixLog('Veri tutarliligi islemi basladi.');

        try {

        const leadScore = (lead) => {
            let score = 0;
            if (lead.email && lead.email.length > 5) score += 4;
            if ((lead.stage || 0) > 0) score += 3 + (lead.stage || 0);
            if (lead.lastContactDate) score += 2;
            if (lead.mailOpenedAt) score += 2;
            if (lead.threadId) score += 2;
            if (Array.isArray(lead.activityLog) && lead.activityLog.length > 0) score += 1;
            if (lead.statusKey && lead.statusKey !== 'New') score += 2;
            return score;
        };

        const getLatestIso = (...values) => {
            const valid = values.filter(v => v && !isNaN(new Date(v).getTime()));
            if (valid.length === 0) return null;
            valid.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
            return valid[0];
        };

        const mergeEmails = (a, b) => {
            const split = (s) => (s || '')
                .split(',')
                .map(x => x.trim().toLowerCase())
                .filter(Boolean);
            return [...new Set([...split(a), ...split(b)])].join(', ');
        };

        const mergeActivity = (a, b) => {
            const left = Array.isArray(a) ? a : [];
            const right = Array.isArray(b) ? b : [];
            const map = new Map();
            [...left, ...right].forEach(entry => {
                const key = `${entry?.date || ''}|${entry?.type || ''}|${entry?.content || ''}`;
                if (!map.has(key)) map.set(key, entry);
            });
            return Array.from(map.values()).sort((x, y) => {
                const tx = new Date(x?.date || 0).getTime();
                const ty = new Date(y?.date || 0).getTime();
                return tx - ty;
            });
        };

        const mergeHistory = (a, b) => {
            const out = { ...(a || {}) };
            Object.entries(b || {}).forEach(([k, v]) => {
                if (!out[k]) out[k] = v;
            });
            return out;
        };

        let allLeads = [];
        try {
            const snapshot = await dbInstance.collection('leads').get();
            allLeads = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log(`[fixLeadConsistencyV2] Firestore'dan ${allLeads.length} lead cekildi`);
            addFixLog(`Firestore'dan ${allLeads.length} lead cekildi.`);
        } catch (e) {
            addFixLog(`Lead cekme hatasi: ${e.message}`, 'error');
            return alert("Lead'ler cekilemedi: " + e.message);
        }
        if (allLeads.length === 0) {
            addFixLog('Duzeltilecek lead bulunamadi.', 'warn');
            return alert("Duzeltilecek lead bulunamadi.");
        }

        // Opsiyonel: Gmail gecmis taramasi (gonderilmis mailleri history'ye yansit)
        let scannedMailCount = 0;
        let foundSentHistoryCount = 0;
        let recoveredThreadCount = 0;
        let mailScanErrorCount = 0;
        let mailScanApiMissing = false;
        let mailScanTimeoutCount = 0;

        if (settings?.googleScriptUrl) {
            // Tum kayitlari degil, gecmis senkronuna ihtiyaci olma ihtimali yuksek olanlari tara.
            const scanCandidates = allLeads.filter(l => {
                if ((l.email || '').length <= 5) return false;
                const sk = (l.statusKey || '').toUpperCase();
                const needsStatusFix = !sk || sk === 'NEW' || sk === 'READY_TO_SEND';
                const missingHistory = !l.lastContactDate || !l.threadId || !(l.history && l.history.initial);
                return needsStatusFix || missingHistory;
            });
            addFixLog(`Gmail gecmisi taramasi basladi. Aday kayit: ${scanCandidates.length} (toplam: ${allLeads.length})`);
            let scannedProgress = 0;

            const callGoogleScriptWithTimeout = async (payload, timeoutMs = 15000) => {
                let timeoutId;
                try {
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error(`Google Script timeout (${timeoutMs}ms)`)), timeoutMs);
                    });
                    return await Promise.race([
                        window.callGoogleScript(settings.googleScriptUrl, payload),
                        timeoutPromise
                    ]);
                } finally {
                    if (timeoutId) clearTimeout(timeoutId);
                }
            };

            for (const lead of scanCandidates) {
                try {
                    const email = (lead.email || '').split(',')[0].trim();
                    if (!email) continue;

                    let threadId = lead.threadId || '';
                    if (!threadId) {
                        const recover = await callGoogleScriptWithTimeout({ action: 'check_thread_by_email', to: email }, 12000);
                        if (recover?.status === 'error') {
                            const msg = (recover.message || '').toString().toLowerCase();
                            if (msg.includes('bilinmeyen') || msg.includes('unknown')) {
                                mailScanApiMissing = true;
                                break;
                            }
                        }
                        if (recover?.status === 'success' && recover.threadId) {
                            threadId = recover.threadId;
                            recoveredThreadCount++;
                        }
                    }
                    if (!threadId) continue;

                    scannedMailCount++;
                    const sentInfo = await callGoogleScriptWithTimeout({ action: 'check_thread_sent', threadId }, 12000);
                    if (sentInfo?.status === 'error') {
                        const msg = (sentInfo.message || '').toString().toLowerCase();
                        if (msg.includes('bilinmeyen') || msg.includes('unknown')) {
                            mailScanApiMissing = true;
                            break;
                        }
                    }

                    if (sentInfo?.status === 'success' && sentInfo.hasSent) {
                        const sentAt = sentInfo.lastSentAt || new Date().toISOString();
                        const prevLast = lead.lastContactDate || null;
                        lead.threadId = threadId;
                        lead.lastContactDate = getLatestIso(prevLast, sentAt) || sentAt;
                        lead.stage = Math.max(Number(lead.stage || 0), 1);
                        lead.history = { ...(lead.history || {}) };
                        if (!lead.history.initial) lead.history.initial = sentAt;
                        lead.__mailScanTouched = true;

                        if (!lead.statusKey || lead.statusKey === 'New' || lead.statusKey === 'READY_TO_SEND') {
                            lead.statusKey = 'NO_REPLY';
                            lead.statusLabel = window.LEAD_STATUSES['NO_REPLY']?.label || 'No reply yet';
                        }

                        if (!prevLast) {
                            lead.activityLog = mergeActivity(lead.activityLog, [{
                                date: new Date().toISOString(),
                                type: 'SYSTEM',
                                content: `Gmail gecmis taramasi: Gonderilmis mail bulundu (${email})`
                            }]);
                        }
                        foundSentHistoryCount++;
                    }
                } catch (e) {
                    mailScanErrorCount++;
                    if ((e.message || '').toLowerCase().includes('timeout')) mailScanTimeoutCount++;
                    if (mailScanErrorCount <= 5 || mailScanErrorCount % 50 === 0) {
                        addFixLog(`Mail tarama hatasi (${mailScanErrorCount}): ${e.message}`, 'warn');
                    }
                }
                scannedProgress++;
                if (scannedProgress % 10 === 0) addFixLog(`Gmail tarama ilerleme: ${scannedProgress}/${scanCandidates.length} (Bulunan: ${foundSentHistoryCount}, Hata: ${mailScanErrorCount})`);
                await new Promise(r => setTimeout(r, 100));
            }
            addFixLog(`Gmail taramasi bitti. Taranan: ${scannedMailCount}, bulunan gonderim: ${foundSentHistoryCount}`);
            if (mailScanTimeoutCount > 0) addFixLog(`Gmail timeout: ${mailScanTimeoutCount}`, 'warn');
        } else {
            addFixLog('Google Script URL bos oldugu icin Gmail gecmis taramasi atlandi.', 'warn');
        }

        const groups = new Map();
        allLeads.forEach(lead => {
            const normalized = window.normalizeMainDomain(lead.url || '');
            const key = normalized || window.cleanDomain(lead.url || '');
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ ...lead, __normalizedUrl: normalized || key });
        });
        addFixLog(`Domain gruplari olusturuldu: ${groups.size}`);

        const todayIso = new Date().toISOString();
        let statusFixCount = 0;
        let urlFixCount = 0;
        let mergedDomainCount = 0;
        let mergedRowDeleteCount = 0;
        let updatedPrimaryCount = 0;

        let batch = dbInstance.batch();
        let batchCount = 0;
        const localUpdateMap = {};
        const deletedIds = new Set();

        const queueUpdate = async (id, payload) => {
            batch.update(dbInstance.collection("leads").doc(id), payload);
            batchCount++;
            localUpdateMap[id] = { ...(localUpdateMap[id] || {}), ...payload };
            if (batchCount >= 450) {
                await batch.commit();
                batch = dbInstance.batch();
                batchCount = 0;
            }
        };

        const queueDelete = async (id) => {
            batch.delete(dbInstance.collection("leads").doc(id));
            batchCount++;
            deletedIds.add(id);
            if (batchCount >= 450) {
                await batch.commit();
                batch = dbInstance.batch();
                batchCount = 0;
            }
        };

        let groupIndex = 0;
        const totalGroups = groups.size;
        for (const [, leadsInDomain] of groups.entries()) {
            groupIndex++;
            const sorted = [...leadsInDomain].sort((a, b) => leadScore(b) - leadScore(a));
            const primary = sorted[0];
            const duplicates = sorted.slice(1);
            const merged = { ...primary };

            duplicates.forEach(dup => {
                if (dup.__mailScanTouched) merged.__mailScanTouched = true;
                merged.email = mergeEmails(merged.email, dup.email);
                merged.activityLog = mergeActivity(merged.activityLog, dup.activityLog);
                merged.history = mergeHistory(merged.history, dup.history);
                merged.notes = [merged.notes, dup.notes]
                    .filter(Boolean)
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .join('\n');

                if (!merged.threadId && dup.threadId) merged.threadId = dup.threadId;
                if (!merged.googleMessageId && dup.googleMessageId) merged.googleMessageId = dup.googleMessageId;
                if (!merged.language && dup.language) merged.language = dup.language;

                const mergedTrafficVal = Number(merged.trafficStatus?.value || 0);
                const dupTrafficVal = Number(dup.trafficStatus?.value || 0);
                if (dupTrafficVal > mergedTrafficVal) merged.trafficStatus = dup.trafficStatus;

                merged.stage = Math.max(Number(merged.stage || 0), Number(dup.stage || 0));
                merged.lastContactDate = getLatestIso(merged.lastContactDate, dup.lastContactDate) || merged.lastContactDate;
                merged.mailOpenedAt = getLatestIso(merged.mailOpenedAt, dup.mailOpenedAt) || merged.mailOpenedAt;
                merged.addedDate = getLatestIso(merged.addedDate, dup.addedDate) || merged.addedDate;

                const mergedStatus = merged.statusKey || 'New';
                const dupStatus = dup.statusKey || 'New';
                if (mergedStatus === 'New' && dupStatus !== 'New') {
                    merged.statusKey = dupStatus;
                    merged.statusLabel = dup.statusLabel || window.LEAD_STATUSES[dupStatus]?.label || dupStatus;
                }
            });

            const updates = {};
            const sk = merged.statusKey || '';
            const isNewOrEmpty = !sk || sk === 'New';
            const hasBounce = Array.isArray(merged.activityLog) && merged.activityLog.some(a => a.type === 'BOUNCE');
            const hasBeenContacted = !!merged.lastContactDate;
            const hasBeenOpened = !!merged.mailOpenedAt;
            const hasNoEmail = !merged.email || merged.email.length < 5 || merged.email === '-';

            if (hasBounce && sk !== 'MAIL_ERROR') {
                updates.statusKey = 'MAIL_ERROR';
                updates.statusLabel = 'Error in mail (Bounced)';
                statusFixCount++;
            } else if (hasNoEmail && hasBeenContacted && isNewOrEmpty) {
                updates.statusKey = 'MAIL_ERROR';
                updates.statusLabel = 'Error in mail';
                statusFixCount++;
            } else if ((hasBeenContacted || hasBeenOpened) && isNewOrEmpty) {
                updates.statusKey = 'NO_REPLY';
                updates.statusLabel = window.LEAD_STATUSES['NO_REPLY']?.label || 'No reply yet';
                if ((merged.stage || 0) === 0) updates.stage = 1;
                statusFixCount++;
            }

            if (!merged.addedDate) updates.addedDate = merged.lastContactDate || todayIso;
            if (merged.__normalizedUrl && merged.__normalizedUrl !== merged.url) {
                updates.url = merged.__normalizedUrl;
                urlFixCount++;
            }

            if (merged.__mailScanTouched) {
                if (merged.threadId) updates.threadId = merged.threadId;
                if (merged.lastContactDate) updates.lastContactDate = merged.lastContactDate;
                if (merged.history) updates.history = merged.history;
                if (merged.activityLog) updates.activityLog = merged.activityLog;
                updates.stage = Math.max(Number(updates.stage || 0), Number(merged.stage || 0));
                if (!updates.statusKey && merged.statusKey === 'NO_REPLY') {
                    updates.statusKey = 'NO_REPLY';
                    updates.statusLabel = window.LEAD_STATUSES['NO_REPLY']?.label || 'No reply yet';
                }
            }

            if (duplicates.length > 0) {
                updates.email = merged.email || '';
                updates.activityLog = merged.activityLog || [];
                updates.history = merged.history || {};
                updates.notes = merged.notes || '';
                updates.stage = Number(merged.stage || updates.stage || 0);
                if (merged.lastContactDate || updates.lastContactDate) updates.lastContactDate = merged.lastContactDate || updates.lastContactDate;
                if (merged.mailOpenedAt || updates.mailOpenedAt) updates.mailOpenedAt = merged.mailOpenedAt || updates.mailOpenedAt;
                updates.threadId = merged.threadId || '';
                updates.googleMessageId = merged.googleMessageId || '';
                updates.trafficStatus = merged.trafficStatus || { viable: false, value: 0, label: 'Veri Yok' };
                updates.statusKey = updates.statusKey || merged.statusKey || 'New';
                updates.statusLabel = updates.statusLabel || merged.statusLabel || (window.LEAD_STATUSES[updates.statusKey]?.label || updates.statusKey);
                mergedDomainCount++;
            }

            if (Object.keys(updates).length > 0) {
                await queueUpdate(primary.id, updates);
                updatedPrimaryCount++;
            }

            for (const dup of duplicates) {
                await queueDelete(dup.id);
                mergedRowDeleteCount++;
            }
            if (groupIndex % 200 === 0) addFixLog(`Merge ilerleme: ${groupIndex}/${totalGroups}`);
        }

        if (batchCount > 0) await batch.commit();
        addFixLog('Batch commit tamamlandi, lokal state guncelleniyor.');

        setCrmData(prev => prev
            .filter(item => !deletedIds.has(item.id))
            .map(item => localUpdateMap[item.id] ? { ...item, ...localUpdateMap[item.id] } : item)
        );
        addFixLog('Lokal state guncellendi.');

        alert(
            `${allLeads.length} lead tarandi.\n` +
            `${updatedPrimaryCount} kayit guncellendi.\n` +
            `${urlFixCount} kayitta URL ciplak domaine cevrildi.\n` +
            `${mergedDomainCount} domain grubunda birlestirme yapildi.\n` +
            `${mergedRowDeleteCount} mukerrer satir silindi.\n` +
            `${statusFixCount} status/stage tutarsizligi duzeltildi.\n` +
            `${scannedMailCount} kayitta Gmail gecmisi tarandi, ${foundSentHistoryCount} kayitta gonderilmis mail history'ye islendi` +
            (recoveredThreadCount > 0 ? ` (${recoveredThreadCount} thread kurtarildi)` : '') +
            (mailScanErrorCount > 0 ? `\nMail tarama hatasi: ${mailScanErrorCount}` : '') +
            (mailScanTimeoutCount > 0 ? `\nMail tarama timeout: ${mailScanTimeoutCount}` : '') +
            (mailScanApiMissing ? `\nUYARI: Apps Script'te 'check_thread_sent' action'i yok. google-script.js'i yeniden deploy et.` : '')
        );
        } catch (e) {
            addFixLog(`Islem hatasi: ${e.message}`, 'error');
            alert("Veri tutarliligi isleminde hata: " + e.message);
        } finally {
            addFixLog('Islem tamamlandi.');
            setIsFixingConsistency(false);
        }
    };

    // --- FINAL CHECK ---
    const servicesObj = {
        selectedLead, setSelectedLead, isSending, openMailModal, openPromotionModal, handleSendMail, showBulkModal, setShowBulkModal, isBulkSending, bulkProgress, bulkConfig, setBulkConfig, executeBulkSend, executeBulkPromotion, isCheckingBulk, handleBulkReplyCheck, syncInboxReplies, bulkUpdateStatus, bulkUpdateLanguage, bulkUpdateStage, bulkAddNotViable, isEnriching, showEnrichModal, setShowEnrichModal, enrichLogs, enrichProgress, enrichDatabase, stopEnrichBackground, isScanning, keywords, setKeywords, searchDepth, setSearchDepth, hunterLogs, hunterProgress, hunterLogsEndRef, startScan, stopScan, handleExportData, fixEncodedNames, startAutoFollowup, stopAutoFollowup, runAutoHunterScan, stopAutoHunterScan, isHunterRunning, autoHunterLogs, autoHunterStats, autoHunterLogsEndRef, fixLeadConsistency: fixLeadConsistencyV2,
        fixConsistencyLogs,
        isFixingConsistency,
        showFixLogModal,
        setShowFixLogModal
    };

    return servicesObj;
};
