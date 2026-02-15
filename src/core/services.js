// LeadHunter_Services.js

const { useState, useRef, useEffect } = React;


// --- YARDIMCI FONKSİYON: KARAKTER DÜZELTME (TURKISH FIX) ---
window.fixEncoding = (str) => {
    if (!str) return '';
    let text = str;

    // 1. MIME Encoded Word Çözümü
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
        if (/[ÃÄÅ]/.test(text)) {
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

    // 3. GENİŞLETİLMİŞ MANUEL HARİTA (Manual Fallback)
    const replacements = {
        'Ä°': 'İ', 'Ä±': 'ı', 'Ã–': 'Ö', 'Ã¶': 'ö', 'Ãœ': 'Ü', 'Ã¼': 'ü',
        'Åž': 'Ş', 'ÅŸ': 'ş', 'Ã‡': 'Ç', 'Ã§': 'ç', 'ÄŸ': 'ğ', 'Äž': 'Ğ',
        'Ã¢': 'â', 'Ã‚': 'Â', 'Ã®': 'î', 'Ã®': 'î',
        'Ä\u00A0': 'Ğ', 'Ä\u009F': 'ğ', 'Ã\u0096': 'Ö', 'Ã\u00B6': 'ö',
        'Ã\u009C': 'Ü', 'Ã\u00BC': 'ü', 'Ã\u0087': 'Ç', 'Ã\u00A7': 'ç',
        'Å\u009E': 'Ş', 'Å\u009F': 'ş', 'â\u20AC\u201C': '-', 'Â': '',
        '&#304;': 'İ', '&#305;': 'ı', '&#214;': 'Ö', '&#246;': 'ö',
        '&#220;': 'Ü', '&#252;': 'ü', '&#199;': 'Ç', '&#231;': 'ç',
        '&#286;': 'Ğ', '&#287;': 'ğ', '&#350;': 'Ş', '&#351;': 'ş',
        '&amp;': '&', '&quot;': '"', '&apos;': "'", '&gt;': '>', '&lt;': '<'
    };

    // Önce en uzun anahtarları düzelt (Örn: Ã– yerine Ä° gibi spesifikleri öncele)
    const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);
    sortedKeys.forEach(key => {
        if (text.includes(key)) {
            const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            text = text.replace(regex, replacements[key]);
        }
    });

    // Son çare: Tekli Ã bozulması
    if (text.includes('Ã') && !/[a-zA-Z0-9]/.test(text.charAt(text.indexOf('Ã') + 1))) {
        text = text.replace(/Ã/g, 'İ');
    }

    return text.trim();
};


// --- YARDIMCI FONKSİYON: Email'den İsim Çıkarma ---
window.extractNameFromEmail = (fromStr) => {
    if (!fromStr) return '';

    // Önce karakterleri düzelt
    const cleanStr = window.fixEncoding(fromStr);

    // Format: "John Doe" <john@doe.com> veya John Doe <john@doe.com>
    const match = cleanStr.match(/^"?([^"<]+)"?\s*</);
    let name = '';

    if (match && match[1]) {
        name = match[1].trim();
    } else {
        // İsim formatı yoksa ve sadece mail varsa (örn: "info@site.com")
        const temp = cleanStr.replace(/<[^>]+>/g, '').trim();
        name = temp.includes('@') ? '' : temp.replace(/^"|"$/g, '');
    }

    // --- KARA LİSTE KONTROLÜ (İsim çekilirken anlık kontrol) ---
    const blackList = ['tevfik gülep', 'tevfik gulep', 'lead hunter', 'admin', 'info', 'iletisim', 'contact', 'support', 'destek', 'muhasebe', 'ik', 'hr', 'satis', 'sales'];

    if (name && blackList.some(b => name.toLowerCase().includes(b))) {
        return ''; // Yasaklı isimse boş döndür
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
    const [isScanning, setIsScanning] = useState(false);
    const [keywords, setKeywords] = useState('');
    const [searchDepth, setSearchDepth] = useState(30);
    const [hunterLogs, setHunterLogs] = useState([]);
    const [hunterProgress, setHunterProgress] = useState(0);

    const scanIntervalRef = useRef(false);
    const hunterLogsEndRef = useRef(null);
    const crmDataRef = useRef(crmData);
    useEffect(() => { crmDataRef.current = crmData; }, [crmData]);



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
            } catch (e) { console.warn("Tracking Sync Hatası:", e); }
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
                !['MAIL_ERROR', 'NOT_VIABLE', 'DEAL_ON', 'DEAL_OFF', 'DENIED', 'INTERESTED', 'IN_PROCESS', 'ASKED_MORE'].includes(l.statusKey)
            );
            if (candidates.length === 0) return;
            const sortedCandidates = [...candidates].sort((a, b) => new Date(b.lastContactDate || 0) - new Date(a.lastContactDate || 0)).slice(0, 50);
            try {
                const response = await fetch(settings.googleScriptUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'check_replies_bulk', threadIds: sortedCandidates.map(c => c.threadId) })
                });
                const data = await response.json();
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
                                    updates.activityLog = firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), type: 'BOUNCE', content: `Sistem: Mail İletilemedi (Otomatik Tespit)` });
                                }
                            } else {
                                // İSİM ÇEKME
                                if (result.from && !lead.contactName) {
                                    const extractedName = window.extractNameFromEmail(result.from);
                                    if (extractedName) updates.contactName = extractedName;
                                }

                                if (!['INTERESTED', 'ASKED_MORE', 'IN_PROCESS', 'DEAL_ON'].includes(lead.statusKey)) {
                                    updates.statusKey = 'INTERESTED';
                                    updates.statusLabel = 'Showed interest (Auto Check)';
                                    updates.lastContactDate = new Date().toISOString();
                                    updates.activityLog = firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), type: 'REPLY', content: `Sistem: Yeni Cevap Alındı (${result.snippet?.substring(0, 30)}...)` });
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
            alert("Dışa aktarılacak veri bulunamadı.");
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
        } catch (error) { alert("Rapor hatası: " + error.message); }
    };

    // --- 4. BAKIM ARACI: BOZUK İSİMLERİ VE KARA LİSTEYİ DÜZELTME ---
    const fixEncodedNames = async () => {
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        if (!confirm("Bozuk karakterli (Ã–, Ã¼ vb.) ve hatalı (Tevfik Gülep) isimler taranıp düzeltilecek. Bu işlem veritabanında kalıcı değişiklik yapar. Onaylıyor musunuz?")) return;

        let count = 0;
        let deletedCount = 0;
        let processedCount = 0;
        const currentLeads = crmDataRef.current;
        const blackList = ['tevfik gülep', 'tevfik gulep', 'lead hunter', 'admin', 'info', 'iletisim', 'sales', 'support'];

        // Firestore batch limiti 500'dür. Bu yüzden veriyi parçalara ayırıyoruz.
        const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
        const leadChunks = chunk(currentLeads, 400); // Güvenli olması için 400'erli gruplar

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
                alert(`İşlem Tamamlandı!\n\n${processedCount} kayıt tarandı.\n✅ ${count} isim karakterleri düzeltildi.\n🗑️ ${deletedCount} yasaklı isim silindi.`);
            } else {
                alert(`${processedCount} kayıt tarandı. Düzeltilecek veya silinecek kayıt bulunamadı.`);
            }
        } catch (error) {
            console.error("Fix Names Error:", error);
            alert("İşlem sırasında bir hata oluştu: " + error.message);
        }
    };


    const openMailModal = (lead) => {
        const info = getStageInfo(lead.stage || 0, lead.language);
        if (info.isFinished) return alert("Süreç tamamlanmış.");
        const domain = window.cleanDomain(lead.url);
        setSelectedLead({ ...lead, currentLabel: info.label, draft: { to: lead.email ? lead.email.split(',')[0].trim() : '', subject: info.template.subject.replace(/{{Website}}/g, domain), body: info.template.body.replace(/{{Website}}/g, domain) }, allEmails: lead.email });
    };

    const openPromotionModal = (lead) => {
        const domain = window.cleanDomain(lead.url);
        const promoTemplate = lead.language === 'EN'
            ? settings.promotionTemplateEN
            : settings.promotionTemplateTR;

        if (!promoTemplate) return alert("Promosyon şablonu bulunamadı.");

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
            const response = await fetch(settings.googleScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'send_mail', to: selectedLead.draft.to, subject: selectedLead.draft.subject, body: plainBody, htmlBody: htmlContent, threadId: selectedLead.threadId || null }) });
            const result = await response.json();
            if (result.status === 'error') throw new Error(result.message);
            if (isDbConnected) {
                const newLog = { date: new Date().toISOString(), type: 'MAIL', content: `Mail Gönderildi: ${selectedLead.currentLabel}` };
                const updateData = { statusKey: 'NO_REPLY', statusLabel: window.LEAD_STATUSES['NO_REPLY'].label, stage: (selectedLead.stage || 0) + 1, lastContactDate: new Date().toISOString(), [`history.${selectedLead.stage === 0 ? 'initial' : `repeat${selectedLead.stage}`}`]: new Date().toISOString(), activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) };
                if (result.threadId) updateData.threadId = result.threadId;
                await dbInstance.collection("leads").doc(selectedLead.id).update(updateData);
                setCrmData(prev => prev.map(p => p.id === selectedLead.id ? { ...p, ...updateData, activityLog: [...(p.activityLog || []), newLog] } : p));
            }
            alert("Mail gönderildi!");
            setSelectedLead(null);
        } catch (e) { alert("Hata: " + e.message); }
        setIsSending(false);
    };

    const executeBulkSend = async () => {
        if (!confirm(`${selectedIds.size} site için toplu gönderim yapılacak. Onaylıyor musunuz?`)) return;
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
            else { const info = getStageInfo(targetStage, mainLead.language || bulkConfig.language); if (info.isFinished) { addBulkLog(`${email}: Süreç bitmiş`, false); continue; } template = info.template; }
            if (!template) { addBulkLog(`${email}: Şablon yok`, false); continue; }
            try {
                const subject = template.subject.replace(/{{Website}}/g, domainsString);
                const body = template.body.replace(/{{Website}}/g, uniqueDomains.join(', '));
                const messageHtml = body.replace(/\n/g, '<br>');
                let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';
                const trackingPixel = serverUrl ? `<img src="${serverUrl}?type=track&id=${mainLead.id}" width="1" height="1" style="display:none;" alt="" />` : '';
                const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>${trackingPixel}`;
                const plainBody = body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');
                const response = await fetch(settings.googleScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'send_mail', to: email, subject: subject, body: plainBody, htmlBody: htmlContent, threadId: mainLead.threadId || null }) });
                const result = await response.json();
                if (result.status === 'error') throw new Error(result.message);
                addBulkLog(`${email}: Gönderildi`, true);
                if (isDbConnected) {
                    const batch = dbInstance.batch();
                    group.forEach(l => {
                        const newLog = { date: new Date().toISOString(), type: 'MAIL', content: `Toplu Gönderildi: ${targetStage}. Aşama` };
                        const ref = dbInstance.collection("leads").doc(l.id);
                        const updateData = { statusKey: 'NO_REPLY', statusLabel: window.LEAD_STATUSES['NO_REPLY'].label, stage: targetStage + 1, lastContactDate: new Date().toISOString(), [`history.${targetStage === 0 ? 'initial' : `repeat${targetStage}`}`]: new Date().toISOString(), activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) };
                        if (result.threadId) updateData.threadId = result.threadId;
                        batch.update(ref, updateData);
                    });
                    await batch.commit();
                }
            } catch (e) { addBulkLog(`${email}: Hata - ${e.message}`, false); }
            if (index < totalGroups) await new Promise(r => setTimeout(r, 2000));
        }
        setIsBulkSending(false); setSelectedIds(new Set()); alert("Tamamlandı."); setShowBulkModal(false);
    };

    const executeBulkPromotion = async () => {
        if (!bulkConfig.promotionSubject || !bulkConfig.promotionBody) {
            return alert("Lütfen promosyon konusunu ve içeriğini doldurun!");
        }
        if (!confirm(`${selectedIds.size} site için promosyon maili gönderilecek. Onaylıyor musunuz?`)) return;

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

            try {
                // Promosyon maili için subject ve body
                const subject = (bulkConfig.promotionSubject || '').replace(/{{Website}}/g, uniqueDomains.join(', '));
                const body = (bulkConfig.promotionBody || '').replace(/{{Website}}/g, uniqueDomains.join(', '));

                const messageHtml = body.replace(/\n/g, '<br>');
                let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';
                const trackingPixel = serverUrl ? `<img src="${serverUrl}?type=track&id=${mainLead.id}" width="1" height="1" style="display:none;" alt="" />` : '';
                const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>${trackingPixel}`;
                const plainBody = body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');

                const response = await fetch(settings.googleScriptUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'send_mail', to: email, subject: subject, body: plainBody, htmlBody: htmlContent, threadId: null })
                });
                const result = await response.json();
                if (result.status === 'error') throw new Error(result.message);

                addBulkLog(`${email}: Promosyon gönderildi`, true);

                if (isDbConnected) {
                    const batch = dbInstance.batch();
                    group.forEach(l => {
                        const newLog = { date: new Date().toISOString(), type: 'MAIL', content: `Promosyon Mail Gönderildi` };
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
            } catch (e) { addBulkLog(`${email}: Hata - ${e.message}`, false); }
            if (index < totalGroups) await new Promise(r => setTimeout(r, 2000));
        }
        setIsBulkSending(false); setSelectedIds(new Set()); alert("Promosyon gönderimi tamamlandı!"); setShowBulkModal(false);
    };

    const handleBulkReplyCheck = async () => {
        if (selectedIds.size === 0) return alert("Kayıt seçin.");
        const candidates = crmData.filter(lead => selectedIds.has(lead.id) && lead.threadId);
        if (candidates.length === 0) return alert("Thread ID bulunamadı.");
        if (!confirm(`${candidates.length} kayıt kontrol edilecek. Devam?`)) return;
        setIsCheckingBulk(true);
        try {
            const response = await fetch(settings.googleScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'check_replies_bulk', threadIds: candidates.map(c => c.threadId) }) });
            const data = await response.json();
            if (data.status === 'success') {
                const results = data.results; let updatedCount = 0; let bounceCount = 0; const batch = dbInstance.batch(); let hasUpdates = false;
                candidates.forEach(lead => {
                    const result = results[lead.threadId];
                    if (result && result.hasReply) {
                        const ref = dbInstance.collection("leads").doc(lead.id);
                        const updates = {};
                        if (result.isBounce) {
                            if (lead.statusKey !== 'MAIL_ERROR') {
                                updates.statusKey = 'MAIL_ERROR'; updates.statusLabel = 'Error in mail (Bounced)'; updates.email = ''; updates.lastContactDate = new Date().toISOString(); updates.activityLog = firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), type: 'BOUNCE', content: `Otomatik Tarama: Mail İletilemedi (Bounce)` }); bounceCount++;
                            }
                        } else {
                            if (result.from && !lead.contactName) {
                                const extractedName = window.extractNameFromEmail(result.from);
                                if (extractedName) updates.contactName = extractedName;
                            }
                            if (!['INTERESTED', 'DEAL_ON', 'NOT_POSSIBLE', 'DENIED', 'MAIL_ERROR', 'IN_PROCESS', 'ASKED_MORE'].includes(lead.statusKey)) {
                                updates.statusKey = 'INTERESTED'; updates.statusLabel = 'Showed interest (Reply Found)'; updates.lastContactDate = new Date().toISOString(); updates.activityLog = firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), type: 'REPLY', content: `Yeni Cevap Alındı: ${result.snippet?.substring(0, 50)}...` }); updatedCount++;
                            }
                        }
                        if (Object.keys(updates).length > 0) { batch.update(ref, updates); hasUpdates = true; }
                    }
                });
                if (hasUpdates) { await batch.commit(); alert(`Tarama Tamamlandı!\n✅ ${updatedCount} yeni cevap\n❌ ${bounceCount} bounce`); } else { alert("Değişiklik yok."); }
            } else { alert("Hata: " + data.message); }
        } catch (e) { alert("Bağlantı Hatası: " + e.message); }
        setIsCheckingBulk(false);
    };

    const bulkUpdateStatus = async (newStatusKey) => {
        if (selectedIds.size === 0) return alert("Lütfen kayıt seçin.");
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        const statusLabel = window.LEAD_STATUSES[newStatusKey]?.label || newStatusKey;
        if (!confirm(`Seçili ${selectedIds.size} kaydın durumu '${statusLabel}' olarak güncellenecek. Onaylıyor musunuz?`)) return;
        const batch = dbInstance.batch(); const timestamp = new Date().toISOString();
        const newLog = { date: timestamp, type: 'SYSTEM', content: `Durum manuel olarak '${statusLabel}' yapıldı (Toplu İşlem).` };
        selectedIds.forEach(id => { const ref = dbInstance.collection("leads").doc(id); batch.update(ref, { statusKey: newStatusKey, statusLabel: statusLabel, activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) }); });
        try { await batch.commit(); setCrmData(prev => prev.map(item => { if (selectedIds.has(item.id)) { return { ...item, statusKey: newStatusKey, statusLabel: statusLabel, activityLog: [...(item.activityLog || []), newLog] }; } return item; })); setSelectedIds(new Set()); alert("Durumlar başarıyla güncellendi."); } catch (e) { alert("Hata: " + e.message); }
    };

    const bulkAddNotViable = async () => {
        if (selectedIds.size === 0 || !isDbConnected) return;
        if (!confirm(`${selectedIds.size} adet site 'Not Viable' olarak eklenecek.`)) return;
        const batch = dbInstance.batch(); let count = 0;
        selectedIds.forEach(id => { const lead = leads.find(l => l.id === id); if (lead && !crmData.some(c => window.cleanDomain(c.url) === window.cleanDomain(lead.url))) { batch.set(dbInstance.collection("leads").doc(), { url: lead.url, email: lead.email || '', statusKey: 'NOT_VIABLE', statusLabel: 'Not Viable', stage: 0, language: 'TR', trafficStatus: lead.trafficStatus || { viable: false }, addedDate: new Date().toISOString() }); count++; } });
        if (count > 0) { await batch.commit(); setLeads(prev => prev.filter(l => !selectedIds.has(l.id))); setSelectedIds(new Set()); alert(`${count} site eklendi.`); }
    };

    const fixAllTrafficData = async () => {
        if (!isDbConnected) return alert("Veritabanı bağlı değil."); if (!confirm("Trafik verileri düzeltilecek. Onay?")) return;
        const batch = dbInstance.batch(); let count = 0;
        crmData.forEach(lead => { if (lead.trafficStatus && lead.trafficStatus.label && (lead.trafficStatus.value === undefined || lead.trafficStatus.value === 0)) { const parsedValue = window.parseTrafficToNumber(lead.trafficStatus.label); batch.update(dbInstance.collection("leads").doc(lead.id), { trafficStatus: { ...lead.trafficStatus, value: parsedValue } }); count++; } });
        if (count > 0) { await batch.commit(); alert(`${count} kayıt güncellendi!`); } else { alert("Düzeltilecek kayıt yok."); }
    };

    const enrichDatabase = async (mode = 'BOTH') => {
        const negativeStatuses = ['NOT_VIABLE', 'NOT_POSSIBLE', 'DENIED', 'DEAL_OFF', 'NON_RESPONSIVE'];
        const targets = crmData.filter(item => { if (negativeStatuses.includes(item.statusKey)) return false; const missingEmail = !item.email || item.email.length < 5 || item.email === '-' || item.statusKey === 'MAIL_ERROR'; const missingTraffic = !item.trafficStatus || !item.trafficStatus.label || ['Bilinmiyor', 'Veri Yok', 'Hata', '-', 'API Ayarı Yok'].includes(item.trafficStatus.label) || !item.trafficStatus.value || item.trafficStatus.value < 100; if (mode === 'EMAIL') return missingEmail; if (mode === 'TRAFFIC') return missingTraffic; return missingEmail || missingTraffic; });
        if (targets.length === 0) return alert("Seçilen kriterlere uygun eksik veri bulunamadı.");
        setShowEnrichModal(true); setIsEnriching(true); setEnrichLogs([]); setEnrichProgress({ current: 0, total: targets.length });
        const addEnrichLog = (msg, type = 'info') => { setEnrichLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: msg, type: type }]); };
        addEnrichLog(`Toplam ${targets.length} site taranacak...`, 'info');
        for (let i = 0; i < targets.length; i++) {
            const lead = targets[i]; let updates = {}; setEnrichProgress(prev => ({ ...prev, current: i + 1 }));
            const missingEmail = !lead.email || lead.email.length < 5 || lead.statusKey === 'MAIL_ERROR'; const missingTraffic = !lead.trafficStatus || !lead.trafficStatus.label || ['Bilinmiyor', 'Veri Yok', 'Hata', '-', 'API Ayarı Yok'].includes(lead.trafficStatus.label) || !lead.trafficStatus.value || lead.trafficStatus.value < 100;
            addEnrichLog(`${window.cleanDomain(lead.url)} analizi başlıyor...`, 'info');
            if ((mode === 'TRAFFIC' || mode === 'BOTH') && missingTraffic) { addEnrichLog(`> Trafik aranıyor...`, 'warning'); try { const t = await window.checkTraffic(lead.url); if (t && t.label !== 'Hata' && t.label !== 'API Ayarı Yok') { updates.trafficStatus = t; addEnrichLog(`> Trafik bulundu: ${t.label}`, 'success'); } else { addEnrichLog(`> Trafik verisi alınamadı (${t.label}).`, 'error'); } } catch (e) { addEnrichLog(`> Trafik API hatası: ${e.message}`, 'error'); } }
            if ((mode === 'EMAIL' || mode === 'BOTH') && missingEmail) { addEnrichLog(`> Email taranıyor...`, 'warning'); try { const e = await window.findEmailsOnSite(lead.url); if (e) { updates.email = e; addEnrichLog(`> Email bulundu: ${e}`, 'success'); if (lead.statusKey === 'MAIL_ERROR') { updates.statusKey = 'New'; updates.stage = 0; addEnrichLog(`> Durum düzeltildi (New).`, 'success'); } } else { addEnrichLog(`> Email bulunamadı.`, 'error'); } } catch (err) { addEnrichLog(`> Email hatası: ${err.message}`, 'error'); } }
            const hasUpdates = Object.keys(updates).length > 0;
            if (hasUpdates && isDbConnected) { try { await dbInstance.collection("leads").doc(lead.id).update(updates); addEnrichLog(`✓ Veritabanı güncellendi.`, 'success'); setCrmData(prev => prev.map(p => p.id === lead.id ? { ...p, ...updates } : p)); } catch (dbErr) { addEnrichLog(`x DB Yazma Hatası: ${dbErr.message}`, 'error'); } } else { addEnrichLog(`- Güncelleme yapılmadı.`, 'info'); }
            await new Promise(r => setTimeout(r, 1000));
        }
        addEnrichLog(`Tüm işlemler tamamlandı.`, 'success'); setIsEnriching(false);
    };

    const startScan = async () => {
        const keywordList = keywords.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
        if (keywordList.length === 0) return alert("Kelime giriniz.");

        scanIntervalRef.current = true;
        setIsScanning(true);
        setLeads([]);
        setHunterLogs([]);
        setHunterProgress(0);

        const addLog = (msg, type = 'info') => setHunterLogs(p => [...p, { time: new Date().toLocaleTimeString(), message: msg, type }]);
        const existingDomains = new Set(crmData.map(c => window.cleanDomain(c.url)));
        addLog(`Veritabanında ${existingDomains.size} kayıt var, bunlar filtrelenecek.`, 'warning');

        for (let i = 0; i < keywordList.length; i++) {
            if (!scanIntervalRef.current) break;
            const kw = keywordList[i];
            addLog(`Aranıyor: ${kw}`);

            try {
                const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
                if (!serverUrl) { addLog("HATA: Server API URL tanımlı değil.", 'error'); continue; }

                const country = searchLocation || 'TR';
                const apiKey = settings.googleApiKey || '';
                const cx = settings.searchEngineId || '';
                const url = `${serverUrl}?type=search&q=${encodeURIComponent(kw)}&depth=${searchDepth}&gl=${country}&apiKey=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}`;

                const response = await fetch(url);
                const text = await response.text();
                let json = JSON.parse(text);

                if (json.success && Array.isArray(json.results)) {
                    const filteredResults = json.results.filter(r => !existingDomains.has(window.cleanDomain(r.url)));
                    if (filteredResults.length > 0) {
                        const newLeads = filteredResults.map(r => ({
                            id: Math.random().toString(36).substr(2, 9),
                            url: r.url,
                            title: r.title,
                            description: r.snippet,
                            trafficStatus: { label: 'Analiz Ediliyor...', value: 0 },
                            email: 'Aranıyor...'
                        }));
                        setLeads(prev => [...prev, ...newLeads]);
                        newLeads.forEach(async (lead) => {
                            try {
                                const tCheck = await window.checkTraffic(lead.url);
                                setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, trafficStatus: tCheck } : l));
                            } catch (e) { }
                            try {
                                const eCheck = await window.findEmailsOnSite(lead.url);
                                setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, email: eCheck || null } : l));
                            } catch (e) { }
                        });
                    }
                }
            } catch (err) { addLog(`Hata: ${err.message}`, 'error'); }
            await new Promise(r => setTimeout(r, 1000));
            setHunterProgress(((i + 1) / keywordList.length) * 100);
        }
        setIsScanning(false);
        scanIntervalRef.current = false;
        addLog("Bitti.", 'success');
    };

    const stopScan = () => { scanIntervalRef.current = false; setIsScanning(false); };

    // --- AUTO FOLLOWUP SYSTEM ---
    // Her 5 dakikada bir takip maillerini kontrol eder ve gönderir
    // Mevcut workflow şablonlarını (İlk Temas → Takip 1 → Takip 2 → ...) sırayla kullanır
    useEffect(() => {
        if (!isDbConnected || !settings.googleScriptUrl) return;

        const executeFollowups = async () => {
            const now = new Date();
            const candidates = crmDataRef.current.filter(l =>
                l.autoFollowupEnabled &&
                l.nextFollowupDate &&
                new Date(l.nextFollowupDate) <= now &&
                !['INTERESTED', 'ASKED_MORE', 'IN_PROCESS', 'DEAL_ON', 'DEAL_OFF', 'DENIED', 'NOT_VIABLE', 'MAIL_ERROR'].includes(l.statusKey)
            );

            if (candidates.length === 0) return;

            console.log(`[AutoFollowup] ${candidates.length} takip maili gönderilecek`);

            for (const lead of candidates) {
                try {
                    const domain = window.cleanDomain(lead.url);
                    const lang = lead.language || 'TR';
                    
                    // Mevcut workflow şablonlarını al
                    const workflow = lang === 'EN' ? settings.workflowEN : settings.workflowTR;
                    
                    // Lead'in mevcut stage'ine göre bir sonraki şablonu kullan
                    // stage 0 = İlk Temas, stage 1 = Takip 1, vb.
                    const currentStage = lead.stage || 0;
                    const nextStage = currentStage + 1;
                    
                    // Maksimum 6 aşama (İlk Temas + 5 Takip)
                    if (nextStage >= workflow.length) {
                        console.log(`[AutoFollowup] Tüm aşamalar tamamlandı: ${lead.id}`);
                        continue;
                    }

                    const template = workflow[nextStage];

                    if (!template || !template.subject || !template.body) {
                        console.warn(`[AutoFollowup] Şablon bulunamadı: ${lead.id}, stage: ${nextStage}`);
                        continue;
                    }

                    const subject = template.subject.replace(/{{Website}}/g, domain);
                    const body = template.body.replace(/{{Website}}/g, domain);
                    const messageHtml = body.replace(/\n/g, '<br>');

                    let signatureHtml = settings.signature
                        ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"')
                        : '';
                    const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
                    const trackingPixel = serverUrl
                        ? `<img src="${serverUrl}?type=track&id=${lead.id}" width="1" height="1" style="display:none;" alt="" />`
                        : '';
                    const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>${trackingPixel}`;
                    const plainBody = body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');

                    const response = await fetch(settings.googleScriptUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'send_mail',
                            to: lead.email ? lead.email.split(',')[0].trim() : '',
                            subject: subject,
                            body: plainBody,
                            htmlBody: htmlContent,
                            threadId: lead.threadId || null
                        })
                    });
                    const result = await response.json();

                    if (result.status === 'success') {
                        const nextFollowupDate = new Date();
                        nextFollowupDate.setDate(nextFollowupDate.getDate() + 7);

                        const batch = dbInstance.batch();
                        const ref = dbInstance.collection("leads").doc(lead.id);
                        const newFollowupCount = (lead.followupCount || 0) + 1;
                        const newLog = {
                            date: new Date().toISOString(),
                            type: 'MAIL',
                            content: `Otomatik Takip: ${template.label} gönderildi`
                        };

                        // Stage'i bir artır
                        batch.update(ref, {
                            stage: nextStage,
                            statusKey: 'NO_REPLY',
                            statusLabel: window.LEAD_STATUSES['NO_REPLY']?.label || 'No Reply',
                            nextFollowupDate: nextFollowupDate.toISOString(),
                            followupCount: newFollowupCount,
                            lastContactDate: new Date().toISOString(),
                            [`history.${nextStage === 0 ? 'initial' : `repeat${nextStage}`}`]: new Date().toISOString(),
                            activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
                        });

                        await batch.commit();
                        console.log(`[AutoFollowup] ${template.label} gönderildi: ${domain}`);
                    }
                } catch (e) {
                    console.error(`[AutoFollowup] Hata: ${lead.id}`, e);
                }

                // Her mail arasında 2 saniye bekle
                await new Promise(r => setTimeout(r, 2000));
            }
        };

        const intervalId = setInterval(executeFollowups, 5 * 60 * 1000); // 5 dakika
        const timeoutId = setTimeout(executeFollowups, 10000); // 10 saniye sonra ilk kontrol

        return () => { clearInterval(intervalId); clearTimeout(timeoutId); };
    }, [isDbConnected, settings.googleScriptUrl, settings.workflowTR, settings.workflowEN, settings.signature]);

    // --- START AUTO FOLLOWUP ---
    const startAutoFollowup = async (leadIds) => {
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        if (!leadIds || leadIds.size === 0) return alert("Kayıt seçin.");

        const leadsToUpdate = crmDataRef.current.filter(l => leadIds.has(l.id));
        const validLeads = leadsToUpdate.filter(l => l.email && l.email.length > 5);

        if (validLeads.length === 0) return alert("Geçerli emaili olan kayıt bulunamadı.");

        if (!confirm(`${validLeads.length} kayıt için otomatik takip başlatılacak. İlk takip maili hemen gönderilecek. Devam edilsin mi?`)) return;

        const batch = dbInstance.batch();
        const now = new Date();
        const nextFollowupDate = new Date();
        nextFollowupDate.setDate(nextFollowupDate.getDate() + 7);

        for (const lead of validLeads) {
            const domain = window.cleanDomain(lead.url);
            const template = lead.language === 'EN'
                ? settings.followupTemplateEN
                : settings.followupTemplateTR;

            // İlk takip mailini hemen gönder
            if (template && template.subject && template.body) {
                try {
                    const subject = template.subject.replace(/{{Website}}/g, domain);
                    const body = template.body.replace(/{{Website}}/g, domain);
                    const messageHtml = body.replace(/\n/g, '<br>');

                    let signatureHtml = settings.signature
                        ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"')
                        : '';
                    const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
                    const trackingPixel = serverUrl
                        ? `<img src="${serverUrl}?type=track&id=${lead.id}" width="1" height="1" style="display:none;" alt="" />`
                        : '';
                    const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>${trackingPixel}`;
                    const plainBody = body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');

                    await fetch(settings.googleScriptUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'send_mail',
                            to: lead.email.split(',')[0].trim(),
                            subject: subject,
                            body: plainBody,
                            htmlBody: htmlContent,
                            threadId: lead.threadId || null
                        })
                    });
                } catch (e) {
                    console.error(`[AutoFollowup] İlk mail gönderim hatası: ${lead.id}`, e);
                }
            }

            const ref = dbInstance.collection("leads").doc(lead.id);
            const newLog = {
                date: now.toISOString(),
                type: 'MAIL',
                content: `Otomatik Takip başlatıldı (7 gün ara ile)`
            };

            batch.update(ref, {
                autoFollowupEnabled: true,
                autoFollowupStartedAt: now.toISOString(),
                nextFollowupDate: nextFollowupDate.toISOString(),
                followupCount: 1,
                lastContactDate: now.toISOString(),
                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
            });

            // Her işlem arasında bekle
            await new Promise(r => setTimeout(r, 2000));
        }

        await batch.commit();
        alert(`${validLeads.length} kayıt için otomatik takip başlatıldı!`);
    };

    // --- STOP AUTO FOLLOWUP ---
    const stopAutoFollowup = async (leadIds) => {
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        if (!leadIds || leadIds.size === 0) return alert("Kayıt seçin.");

        const leadsToUpdate = crmDataRef.current.filter(l => leadIds.has(l.id) && l.autoFollowupEnabled);

        if (leadsToUpdate.length === 0) return alert("Otomatik takibi aktif olan kayıt bulunamadı.");

        if (!confirm(`${leadsToUpdate.length} kaydın otomatik takibi durdurulacak. Devam edilsin mi?`)) return;

        const batch = dbInstance.batch();

        for (const lead of leadsToUpdate) {
            const ref = dbInstance.collection("leads").doc(lead.id);
            const newLog = {
                date: new Date().toISOString(),
                type: 'SYSTEM',
                content: `Otomatik Takip durduruldu (${lead.followupCount || 0} takip yapıldı)`
            };

            batch.update(ref, {
                autoFollowupEnabled: false,
                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
            });
        }

        await batch.commit();
        alert(`${leadsToUpdate.length} kaydın otomatik takibi durduruldu.`);
    };

    // --- AUTO HUNTER SCAN SYSTEM ---
    // Her Pazartesi saat 7:00'de otomatik tarama yapar

    const autoHunterRef = useRef({
        isRunning: false,
        currentIlceIndex: 0,
        foundCount: 0,
        addedCount: 0
    });

    // Haftalık otomatik tarama kontrolü
    useEffect(() => {
        if (!settings.autoHunterEnabled || !settings.ilceListesi) return;

        const checkAndRunAutoHunter = () => {
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 = Pazar, 1 = Pazartesi
            const hours = now.getHours();
            
            // Her Pazartesi saat 7:00'de kontrol et
            if (dayOfWeek === 1 && hours >= 7 && hours < 8) {
                const lastRun = settings.lastHunterRunDate ? new Date(settings.lastHunterRunDate) : null;
                const daysSinceLastRun = lastRun ? Math.floor((now - lastRun) / (1000 * 60 * 60 * 24)) : 999;
                
                // Son çalışmadan en az 6 gün geçmişse (bir hafta)
                if (!lastRun || daysSinceLastRun >= 6) {
                    console.log("[AutoHunter] Haftalık tarama başlıyor...");
                    runAutoHunterScan();
                }
            }
        };

        // Her saat başı kontrol et
        const intervalId = setInterval(checkAndRunAutoHunter, 60 * 60 * 1000);
        
        // İlk yüklemede de kontrol et
        const timeoutId = setTimeout(checkAndRunAutoHunter, 10000);

        return () => { clearInterval(intervalId); clearTimeout(timeoutId); };
    }, [settings.autoHunterEnabled, settings.ilceListesi, settings.lastHunterRunDate]);

    // Manuel olarak otomatik taramayı başlat
    const runAutoHunterScan = async () => {
        if (!isDbConnected) {
            console.warn("[AutoHunter] Veritabanı bağlı değil");
            return;
        }

        if (!settings.ilceListesi || settings.ilceListesi.trim().length === 0) {
            console.warn("[AutoHunter] İlçe listesi boş");
            return;
        }

        if (autoHunterRef.current.isRunning) {
            console.warn("[AutoHunter] Zaten çalışıyor");
            return;
        }

        autoHunterRef.current.isRunning = true;
        const ilceList = settings.ilceListesi.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const targetCount = settings.hunterTargetCount || 100;
        const keywords = ['haberleri', 'son dakika', 'güncel', 'haber', 'gazete'];
        
        const existingDomains = new Set(crmDataRef.current.map(c => window.cleanDomain(c.url)));
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
        
        console.log(`[AutoHunter] Hedef: ${targetCount} site, İlçe sayısı: ${ilceList.length}`);

        let currentIlceIndex = settings.lastHunterIlceIndex || 0;
        let foundViableCount = 0;
        let totalSearches = 0;
        let maxSearches = ilceList.length * keywords.length; // Maximum searches per week

        for (let i = 0; i < ilceList.length; i++) {
            if (foundViableCount >= targetCount) break;
            if (autoHunterRef.current.isRunning === false) break;

            const ilce = ilceList[currentIlceIndex % ilceList.length];
            
            for (const kw of keywords) {
                if (foundViableCount >= targetCount) break;
                if (totalSearches >= maxSearches) break;

                const query = `${ilce} ${kw}`;
                totalSearches++;

                try {
                    console.log(`[AutoHunter] Aranıyor: ${query}`);

                    const apiKey = settings.googleApiKey || '';
                    const cx = settings.searchEngineId || '';
                    const url = `${serverUrl}?type=search&q=${encodeURIComponent(query)}&depth=30&gl=TR&apiKey=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}`;

                    const response = await fetch(url);
                    const text = await response.text();
                    let json = JSON.parse(text);

                    if (json.success && Array.isArray(json.results)) {
                        // Sonuçları filtrele ve trafiği kontrol et
                        const newResults = json.results.filter(r => {
                            const domain = window.cleanDomain(r.url);
                            return !existingDomains.has(domain);
                        });

                        for (const r of newResults) {
                            if (foundViableCount >= targetCount) break;

                            const domain = window.cleanDomain(r.url);
                            
                            try {
                                // Trafik kontrolü yap
                                const trafficCheck = await window.checkTraffic(r.url);
                                
                                if (trafficCheck && trafficCheck.viable && trafficCheck.value > 0) {
                                    // Site uygun, CRM'e ekle
                                    const newLead = {
                                        url: r.url,
                                        email: '', // Email sonra aranacak
                                        statusKey: 'New',
                                        statusLabel: 'New',
                                        stage: 0,
                                        language: 'TR',
                                        trafficStatus: trafficCheck,
                                        addedDate: new Date().toISOString(),
                                        source: 'AutoHunter',
                                        sourceQuery: query,
                                        activityLog: [{
                                            date: new Date().toISOString(),
                                            type: 'INFO',
                                            content: `Otomatik Tarama ile eklendi (${query})`
                                        }]
                                    };

                                    if (isDbConnected) {
                                        await dbInstance.collection("leads").add(newLead);
                                    }

                                    existingDomains.add(domain);
                                    foundViableCount++;
                                    console.log(`[AutoHunter] Eklendi: ${domain} (Trafik: ${trafficCheck.label})`);
                                }
                            } catch (e) {
                                console.warn(`[AutoHunter] Trafik kontrol hatası: ${domain}`, e);
                            }

                            // API rate limit aşımı için bekle
                            await new Promise(r => setTimeout(r, 500));
                        }
                    }
                } catch (e) {
                    console.error(`[AutoHunter] Arama hatası: ${query}`, e);
                }

                // Her arama arasında kısa bekle
                await new Promise(r => setTimeout(r, 1000));
            }

            // İlçe indeksini güncelle
            currentIlceIndex++;
        }

        // Durumu kaydet
        if (isDbConnected) {
            try {
                await dbInstance.collection('system').doc('config').set({
                    lastHunterIlceIndex: currentIlceIndex % ilceList.length,
                    lastHunterRunDate: new Date().toISOString()
                }, { merge: true });
            } catch (e) {
                console.error("[AutoHunter] Durum kaydetme hatası:", e);
            }
        }

        autoHunterRef.current.isRunning = false;
        console.log(`[AutoHunter] Tamamlandı. Bulunan uygun site: ${foundViableCount}`);
    };

    // Otomatik taramayı durdur
    const stopAutoHunterScan = () => {
        autoHunterRef.current.isRunning = false;
        console.log("[AutoHunter] Durduruldu");
    };

    // --- FINAL CHECK ---
    const servicesObj = {
        selectedLead, setSelectedLead, isSending, openMailModal, openPromotionModal, handleSendMail, showBulkModal, setShowBulkModal, isBulkSending, bulkProgress, bulkConfig, setBulkConfig, executeBulkSend, executeBulkPromotion, isCheckingBulk, handleBulkReplyCheck, bulkUpdateStatus, bulkAddNotViable, isEnriching, showEnrichModal, setShowEnrichModal, enrichLogs, enrichProgress, enrichDatabase, isScanning, keywords, setKeywords, searchDepth, setSearchDepth, hunterLogs, hunterProgress, hunterLogsEndRef, startScan, stopScan, fixAllTrafficData, handleExportData, fixEncodedNames, startAutoFollowup, stopAutoFollowup, runAutoHunterScan, stopAutoHunterScan
    };

    return servicesObj;
};

