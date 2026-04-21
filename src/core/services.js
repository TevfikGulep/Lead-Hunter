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
    const enrichPollRef = useRef(null);
    const [isScanning, setIsScanning] = useState(false);
    const [keywords, setKeywords] = useState('');
    const [searchDepth, setSearchDepth] = useState(30);
    const [hunterLogs, setHunterLogs] = useState([]);
    const [hunterProgress, setHunterProgress] = useState(0);
    const [isHunterRunning, setIsHunterRunning] = useState(false);

    // AutoHunter (otomatik tarama) canlı log ve istatistikleri
    const [autoHunterLogs, setAutoHunterLogs] = useState([]);
    const [autoHunterStats, setAutoHunterStats] = useState({ totalFound: 0, fullData: 0 });

    const scanIntervalRef = useRef(false);
    const hunterLogsEndRef = useRef(null);
    const autoHunterLogsEndRef = useRef(null);
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
                                    updates.activityLog = firebase.firestore.FieldValue.arrayUnion({ date: new Date().toISOString(), type: 'BOUNCE', content: `Sistem: Mail İletilemedi (Otomatik Tespit)` });
                                }
                            } else {
                                // İSİM ÇEKME
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
            const result = await window.callGoogleScript(settings.googleScriptUrl, { action: 'send_mail', to: selectedLead.draft.to, subject: selectedLead.draft.subject, body: plainBody, htmlBody: htmlContent, threadId: selectedLead.threadId || null });
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
                addBulkLog(`${email}: Gönderildi`, true);
                if (isDbConnected) {
                    const batch = dbInstance.batch();
                    group.forEach(l => {
                        const newLog = { date: new Date().toISOString(), type: 'MAIL', content: `Toplu Gönderildi: ${targetStage}. Aşama` };
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

        // Google Script URL kontrolü
        if (!settings.googleScriptUrl) {
            addBulkLog("Google Script URL ayarlanmamış!", false);
            setIsBulkSending(false);
            alert("Google Script URL ayarlanmamış! Lütfen ayarlardan Google Script URL'nizi girin.");
            return;
        }

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

                console.log("Promosyon maili gönderiliyor:", { to: email, subject: subject });

                const result = await window.callGoogleScript(settings.googleScriptUrl, { action: 'send_mail', to: email, subject: subject, body: plainBody, htmlBody: htmlContent, threadId: null });
                console.log("JSON yanıtı:", result);

                if (result.status === 'error') throw new Error(result.message || 'Bilinmeyen hata');

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
            } catch (e) {
                console.error("Promosyon gönderim hatası:", e);
                addBulkLog(`${email}: Hata - ${e.message}`, false);
            }
            if (index < totalGroups) await new Promise(r => setTimeout(r, 2000));
        }
        setIsBulkSending(false); setSelectedIds(new Set()); alert("Promosyon gönderimi tamamlandı!"); setShowBulkModal(false);
    };

    const handleBulkReplyCheck = async () => {
        if (selectedIds.size === 0) return alert("Kayıt seçin.");
        setIsCheckingBulk(true);

        // 1. Thread ID'si olmayan ama emaili olan kayıtları bul ve Gmail'den thread'lerini kurtarmayı dene
        const missingThreadLeads = crmData.filter(lead => selectedIds.has(lead.id) && !lead.threadId && lead.email && lead.email.length > 5);
        let recoveredCount = 0;
        let recoveryApiMissing = false;
        let recoveryLastError = '';

        if (missingThreadLeads.length > 0) {
            for (const lead of missingThreadLeads) {
                try {
                    const email = lead.email.split(',')[0].trim();
                    const result = await window.callGoogleScript(settings.googleScriptUrl, { action: 'check_thread_by_email', to: email });
                    if (result.status === 'success' && result.threadId) {
                        await dbInstance.collection("leads").doc(lead.id).update({ threadId: result.threadId });
                        lead.threadId = result.threadId;
                        setCrmData(prev => prev.map(p => p.id === lead.id ? { ...p, threadId: result.threadId } : p));
                        recoveredCount++;
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
            return alert("Google Script güncel değil: 'check_thread_by_email' action'ı bulunamadı. Apps Script'e son google-script.js kodunu deploy etmelisin.");
        }

        // 2. Artık thread ID'si olan tüm kayıtları kontrol et
        const candidates = crmData.filter(lead => selectedIds.has(lead.id) && lead.threadId);
        if (candidates.length === 0) {
            setIsCheckingBulk(false);
            const extra = recoveryLastError ? `\nDetay: ${recoveryLastError}` : '';
            return alert("Thread ID bulunamadı. Seçili kayıtlar için Gmail'de yazışma kaydı bulunamadı." + extra);
        }
        if (!confirm(`${candidates.length} kayıt kontrol edilecek${recoveredCount > 0 ? ` (${recoveredCount} kayıt için thread kurtarıldı)` : ''}. Devam?`)) {
            setIsCheckingBulk(false);
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
                            }
                        }
                        if (Object.keys(updates).length > 0) { batch.update(ref, updates); hasUpdates = true; }
                    }
                });
                if (hasUpdates) { await batch.commit(); alert(`Tarama Tamamlandı!\n✅ ${updatedCount} yeni cevap\n❌ ${bounceCount} bounce${recoveredCount > 0 ? `\n🔗 ${recoveredCount} eksik thread kurtarıldı` : ''}`); } else { alert(`Değişiklik yok.${recoveredCount > 0 ? ` (${recoveredCount} eksik thread kurtarıldı)` : ''}`); }
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

    const bulkUpdateLanguage = async (newLang) => {
        if (selectedIds.size === 0) return alert("Lütfen kayıt seçin.");
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        if (!['TR', 'EN'].includes(newLang)) return alert("Geçersiz dil.");
        if (!confirm(`Seçili ${selectedIds.size} kaydın dili '${newLang}' olarak güncellenecek. Onaylıyor musunuz?`)) return;
        const batch = dbInstance.batch();
        const timestamp = new Date().toISOString();
        const newLog = { date: timestamp, type: 'SYSTEM', content: `Dil manuel olarak '${newLang}' yapıldı (Toplu İşlem).` };
        selectedIds.forEach(id => {
            const ref = dbInstance.collection("leads").doc(id);
            batch.update(ref, { language: newLang, activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) });
        });
        try {
            await batch.commit();
            setCrmData(prev => prev.map(item => selectedIds.has(item.id) ? { ...item, language: newLang, activityLog: [...(item.activityLog || []), newLog] } : item));
            setSelectedIds(new Set());
            alert("Diller başarıyla güncellendi.");
        } catch (e) { alert("Hata: " + e.message); }
    };

    const bulkUpdateStage = async (newStage) => {
        if (selectedIds.size === 0) return alert("Lütfen kayıt seçin.");
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        const stageInt = parseInt(newStage);
        if (isNaN(stageInt) || stageInt < 0) return alert("Geçersiz aşama.");
        // stage değeri "son gönderilen + 1" şeklinde saklanıyor (workflow index + 1)
        // Kullanıcıya gösterilen "son gönderilen" değerine karşılık DB'deki stage = value + 1
        const workflow = settings.workflowTR || [];
        const label = stageInt === 0 ? 'Henüz Gönderilmedi' : (workflow[stageInt - 1]?.label || `Aşama ${stageInt}`);
        if (!confirm(`Seçili ${selectedIds.size} kaydın son gönderilen maili '${label}' olarak güncellenecek. Onaylıyor musunuz?`)) return;
        const batch = dbInstance.batch();
        const timestamp = new Date().toISOString();
        const newLog = { date: timestamp, type: 'SYSTEM', content: `Son gönderilen mail manuel olarak '${label}' yapıldı (Toplu İşlem).` };
        selectedIds.forEach(id => {
            const ref = dbInstance.collection("leads").doc(id);
            batch.update(ref, { stage: stageInt, activityLog: firebase.firestore.FieldValue.arrayUnion(newLog) });
        });
        try {
            await batch.commit();
            setCrmData(prev => prev.map(item => selectedIds.has(item.id) ? { ...item, stage: stageInt, activityLog: [...(item.activityLog || []), newLog] } : item));
            setSelectedIds(new Set());
            alert("Aşamalar başarıyla güncellendi.");
        } catch (e) { alert("Hata: " + e.message); }
    };

    const bulkAddNotViable = async () => {
        if (selectedIds.size === 0 || !isDbConnected) return;
        if (!confirm(`${selectedIds.size} adet site 'Not Viable' olarak eklenecek.`)) return;
        const batch = dbInstance.batch(); let count = 0;
        selectedIds.forEach(id => { const lead = leads.find(l => l.id === id); if (lead && !crmData.some(c => window.cleanDomain(c.url) === window.cleanDomain(lead.url))) { batch.set(dbInstance.collection("leads").doc(), { url: window.cleanDomain(lead.url), email: lead.email || '', statusKey: 'NOT_VIABLE', statusLabel: 'Not Viable', stage: 0, language: 'TR', trafficStatus: lead.trafficStatus || { viable: false }, addedDate: new Date().toISOString() }); count++; } });
        if (count > 0) { await batch.commit(); setLeads(prev => prev.filter(l => !selectedIds.has(l.id))); setSelectedIds(new Set()); alert(`${count} site eklendi.`); }
    };

    // --- ARKA PLAN VERİ ZENGİNLEŞTİRME (Sunucu Tarafında) ---
    const enrichDatabase = async (mode = 'BOTH') => {
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
        if (!serverUrl) return alert('Sunucu URL tanımlı değil!');

        // Enrich endpoint URL'si (traffic-api.php ile aynı dizinde)
        const enrichApiUrl = serverUrl.replace('traffic-api.php', 'cron/enrich-background.php');

        setShowEnrichModal(true);
        setIsEnriching(true);
        setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'Sunucuya istek gönderiliyor...', type: 'info' }]);
        setEnrichProgress({ current: 0, total: 0 });

        try {
            // Sunucuya başlatma isteği gönder
            const startResp = await fetch(`${enrichApiUrl}?action=start&mode=${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const startResult = await startResp.json();

            if (!startResult.success) {
                if (startResult.status === 'already_running') {
                    setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'Bir zenginleştirme işlemi zaten çalışıyor! Durumu takip ediliyor...', type: 'warning' }]);
                } else {
                    setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'Hata: ' + startResult.message, type: 'error' }]);
                    setIsEnriching(false);
                    return;
                }
            } else {
                setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'İşlem sunucuda başlatıldı! Tarayıcıyı kapatabilirsiniz.', type: 'success' }]);
            }

            // Polling başlat: Sunucudan progress bilgisini her 3 saniyede çek
            if (enrichPollRef.current) clearInterval(enrichPollRef.current);

            enrichPollRef.current = setInterval(async () => {
                try {
                    const statusResp = await fetch(`${enrichApiUrl}?action=status`);
                    const statusResult = await statusResp.json();

                    if (statusResult.success && statusResult.data) {
                        const d = statusResult.data;

                        // Progress güncelle
                        setEnrichProgress({ current: d.current || 0, total: d.total || 0 });

                        // Log'ları güncelle (sunucudan gelen tüm logları yansıt)
                        if (d.logs && Array.isArray(d.logs)) {
                            setEnrichLogs(d.logs);
                        }

                        // İşlem tamamlandı / durduruldu / hata
                        if (d.status === 'completed' || d.status === 'error') {
                            clearInterval(enrichPollRef.current);
                            enrichPollRef.current = null;
                            setIsEnriching(false);

                            // Firestore'dan güncel verileri tekrar yükle
                            if (isDbConnected) {
                                try {
                                    const snapshot = await dbInstance.collection('leads').get();
                                    const freshData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                                    setCrmData(freshData);
                                } catch (e) { console.warn('Veri yenileme hatası:', e); }
                            }
                        }
                    }
                } catch (pollErr) {
                    console.warn('Enrich polling hatası:', pollErr);
                }
            }, 3000);

        } catch (err) {
            setEnrichLogs([{ time: new Date().toLocaleTimeString(), msg: 'Sunucu bağlantı hatası: ' + err.message, type: 'error' }]);
            setIsEnriching(false);
        }
    };

    // Arka plan zenginleştirmeyi durdur
    const stopEnrichBackground = async () => {
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
        const enrichApiUrl = serverUrl.replace('traffic-api.php', 'cron/enrich-background.php');
        try {
            await fetch(`${enrichApiUrl}?action=stop`, { method: 'POST' });
            setEnrichLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: 'Durdurma isteği gönderildi...', type: 'warning' }]);
        } catch (e) {
            alert('Durdurma hatası: ' + e.message);
        }
    };

    // Sayfa açıldığında devam eden bir arka plan işlemi var mı kontrol et
    useEffect(() => {
        const checkRunningEnrichment = async () => {
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
            if (!serverUrl) return;
            const enrichApiUrl = serverUrl.replace('traffic-api.php', 'cron/enrich-background.php');
            try {
                const resp = await fetch(`${enrichApiUrl}?action=status`);
                const result = await resp.json();
                if (result.success && result.data && result.data.status === 'running') {
                    // Devam eden işlem var - modal'ı aç ve polling başlat
                    setShowEnrichModal(true);
                    setIsEnriching(true);
                    setEnrichProgress({ current: result.data.current || 0, total: result.data.total || 0 });
                    if (result.data.logs) setEnrichLogs(result.data.logs);

                    enrichPollRef.current = setInterval(async () => {
                        try {
                            const sr = await fetch(`${enrichApiUrl}?action=status`);
                            const sd = await sr.json();
                            if (sd.success && sd.data) {
                                setEnrichProgress({ current: sd.data.current || 0, total: sd.data.total || 0 });
                                if (sd.data.logs) setEnrichLogs(sd.data.logs);
                                if (sd.data.status === 'completed' || sd.data.status === 'error') {
                                    clearInterval(enrichPollRef.current);
                                    enrichPollRef.current = null;
                                    setIsEnriching(false);
                                    if (isDbConnected) {
                                        try {
                                            const snapshot = await dbInstance.collection('leads').get();
                                            const freshData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                                            setCrmData(freshData);
                                        } catch (e) { console.warn('Veri yenileme hatası:', e); }
                                    }
                                }
                            }
                        } catch (e) { console.warn('Enrich resume polling hatası:', e); }
                    }, 3000);
                }
            } catch (e) { /* suskunluk */ }
        };
        const t = setTimeout(checkRunningEnrichment, 2000);
        return () => { clearTimeout(t); if (enrichPollRef.current) clearInterval(enrichPollRef.current); };
    }, [isDbConnected]);

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
                    const filteredResults = json.results.filter(r => {
                        const d = window.cleanDomain(r.url);
                        if (/\.(bel|gov|edu|k12|pol|tsk|mil)\.tr$/i.test(d)) return false;
                        return !existingDomains.has(d);
                    });
                    if (filteredResults.length > 0) {
                        const newLeads = filteredResults.map(r => ({
                            id: Math.random().toString(36).substr(2, 9),
                            url: window.cleanDomain(r.url),
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
    // Frontend executeFollowups removed to eliminate duplicate emails. Automated follow-ups are completely managed by cron/followup.php.

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
            const workflow = lead.language === 'EN' ? settings.workflowEN : settings.workflowTR;
            const currentStage = lead.stage || 0;
            
            if (currentStage >= workflow.length) {
                console.log(`[AutoFollowup] Tüm aşamalar tamamlanmış, atlanıyor: ${lead.id}`);
                continue;
            }
            
            const template = workflow[currentStage];

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

                    const result = await window.callGoogleScript(settings.googleScriptUrl, {
                        action: 'send_mail',
                        to: lead.email.split(',')[0].trim(),
                        subject: subject,
                        body: plainBody,
                        htmlBody: htmlContent,
                        threadId: lead.threadId || null
                    });
                    if (result.status === 'error') throw new Error(result.message);
                    if (result.threadId) {
                        lead.threadId = result.threadId;
                    }
                } catch (e) {
                    console.error(`[AutoFollowup] İlk mail gönderim hatası: ${lead.id}`, e);
                }
            }

            const ref = dbInstance.collection("leads").doc(lead.id);
            const newLog = {
                date: now.toISOString(),
                type: 'MAIL',
                content: `Otomatik Takip başlatıldı (${template.label} gönderildi, 7 gün ara ile)`
            };

            const updatePayload = {
                stage: currentStage + 1,
                statusKey: 'NO_REPLY',
                statusLabel: window.LEAD_STATUSES['NO_REPLY']?.label || 'No Reply',
                autoFollowupEnabled: true,
                autoFollowupStartedAt: now.toISOString(),
                nextFollowupDate: nextFollowupDate.toISOString(),
                followupCount: (lead.followupCount || 0) + 1,
                lastContactDate: now.toISOString(),
                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog),
                [`history.${currentStage === 0 ? 'initial' : `repeat${currentStage}`}`]: now.toISOString()
            };
            if (lead.threadId) updatePayload.threadId = lead.threadId;

            batch.update(ref, updatePayload);

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
            alert("Veritabanı bağlı değil!");
            return;
        }

        if (!settings.ilceListesi || settings.ilceListesi.trim().length === 0) {
            console.warn("[AutoHunter] İlçe listesi boş");
            alert("Lütfen önce ilçe listesini doldurun!");
            return;
        }

        if (autoHunterRef.current.isRunning) {
            console.warn("[AutoHunter] Zaten çalışıyor");
            return;
        }

        autoHunterRef.current.isRunning = true;
        setIsHunterRunning(true);
        setAutoHunterLogs([]);
        setAutoHunterStats({ totalFound: 0, fullData: 0 });

        // Canlı log helper — hem console'a hem UI state'ine yazar
        const addLog = (msg, type = 'info') => {
            const time = new Date().toLocaleTimeString('tr-TR');
            console.log(`[AutoHunter] ${msg}`);
            setAutoHunterLogs(prev => [...prev.slice(-199), { time, message: msg, type }]);
        };

        alert("Tarama başladı! Tarayıcıyı kapatmayın.");
        const ilceList = settings.ilceListesi.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const targetCount = settings.hunterTargetCount || 100;
        const keywords = ['haberleri', 'son dakika', 'güncel', 'haber', 'gazete'];

        const existingDomains = new Set(crmDataRef.current.map(c => window.cleanDomain(c.url)));
        const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';

        addLog(`🎯 Hedef: ${targetCount} site | İlçe sayısı: ${ilceList.length}`, 'info');

        let currentIlceIndex = settings.lastHunterIlceIndex || 0;
        let foundViableCount = 0;
        let totalSearches = 0;
        let maxSearches = ilceList.length * keywords.length;
        let totalAdded = 0;
        let fullDataCount = 0;

        // Progress'i her çıkış yolunda kaydet
        const saveProgress = async (reason) => {
            if (!isDbConnected) return;
            try {
                await dbInstance.collection('system').doc('config').update({
                    lastHunterIlceIndex: currentIlceIndex % ilceList.length,
                    lastHunterRunDate: new Date().toISOString()
                });
                console.log(`[AutoHunter] 💾 Progress kaydedildi (${reason}): ilçe=${currentIlceIndex % ilceList.length}, eklenen=${totalAdded}`);
            } catch (e) {
                console.error("[AutoHunter] Progress kaydetme hatası:", e);
            }
        };
        
        // Fallback search engine chain: Google CSE → Brave → Bing → DuckDuckGo → DataForSEO
        let googleFailed = false;
        let braveFailed = false;
        let bingFailed = false;
        let duckduckgoFailed = false;
        let dataforseoFailed = false;

        try {
        for (let i = 0; i < ilceList.length; i++) {
            if (foundViableCount >= targetCount) break;
            if (autoHunterRef.current.isRunning === false) break;

            const ilce = ilceList[currentIlceIndex % ilceList.length];
            addLog(`📍 İlçe #${currentIlceIndex % ilceList.length}: ${ilce}`, 'info');

            for (const kw of keywords) {
                if (!autoHunterRef.current.isRunning) break;
                if (foundViableCount >= targetCount) break;
                if (totalSearches >= maxSearches) break;

                const query = `${ilce} ${kw}`;
                totalSearches++;

                // FARKLI ARAMA MOTORLARINI DENE - FALLBACK SİSTEMİ
                // Sıra: Google CSE → Brave → Bing → DuckDuckGo → DataForSEO (son çare)
                let searchResult = null;

                // PRIMARY: Google Custom Search
                if (!searchResult && !googleFailed) {
                    console.log(`[AutoHunter] Google deneniyor: ${query}`);
                    const apiKey = settings.googleApiKey || '';
                    const cx = settings.searchEngineId || '';
                    const url = `${serverUrl}?type=search&q=${encodeURIComponent(query)}&depth=30&gl=TR&apiKey=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}`;
                    
                    try {
                        const response = await fetch(url);
                        const text = await response.text();
                        console.log(`[AutoHunter] 🔍 Google HTTP ${response.status}, length: ${text.length}`);
                        
                        let json;
                        try {
                            json = JSON.parse(text);
                        } catch(e) {
                            console.log(`[AutoHunter] ❌ Google JSON parse hatası: ${e.message}`);
                            console.log(`[AutoHunter] 📄 Gelen veri: ${text.substring(0, 500)}`);
                            googleFailed = true;
                            continue;
                        }
                        
                        // Detaylı debug
                        console.log(`[AutoHunter] 📊 Google response: success=${json.success}, results=${json.results?.length || 0}, debug=`, json.debug);
                        
                        if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                            searchResult = { results: json.results, engine: 'google' };
                        } else {
                            addLog(`⚠️ Google CSE başarısız (oturum için devre dışı): ${json.error || 'kota veya yanıt yok'}`, 'warn');
                            googleFailed = true;
                        }
                    } catch (e) {
                        addLog(`❌ Google CSE hata: ${e.message}`, 'error');
                        googleFailed = true;
                    }
                }
                
                // Brave Search API (Google başarısızsa)
                if (!searchResult && !braveFailed) {
                    console.log(`[AutoHunter] Brave deneniyor: ${query}`);
                    const url = `${serverUrl}?type=search_brave&q=${encodeURIComponent(query)}&depth=20&gl=tr`;
                    try {
                        const response = await fetch(url);
                        const text = await response.text();
                        console.log(`[AutoHunter] 🔍 Brave HTTP ${response.status}, length: ${text.length}`);
                        let json;
                        try {
                            json = JSON.parse(text);
                        } catch(e) {
                            console.log(`[AutoHunter] ❌ Brave JSON parse hatası: ${e.message}`);
                            braveFailed = true;
                            continue;
                        }
                        if (json.rate_limited) {
                            addLog(`⚠️ Brave rate limit (oturum için devre dışı)`, 'warn');
                            braveFailed = true;
                        } else if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                            searchResult = { results: json.results, engine: 'brave' };
                        } else {
                            addLog(`⚠️ Brave başarısız (oturum için devre dışı)`, 'warn');
                            braveFailed = true;
                        }
                    } catch (e) {
                        addLog(`❌ Brave hata: ${e.message}`, 'error');
                        braveFailed = true;
                    }
                }

                // Bing (Google ve Brave başarısızsa)
                if (!searchResult && !bingFailed) {
                    console.log(`[AutoHunter] Bing deneniyor: ${query}`);
                    const url = `${serverUrl}?type=search_bing&q=${encodeURIComponent(query)}&depth=30&gl=TR`;
                    
                    try {
                        const response = await fetch(url);
                        const text = await response.text();
                        console.log(`[AutoHunter] 🔍 Bing HTTP ${response.status}, length: ${text.length}`);
                        
                        let json;
                        try {
                            json = JSON.parse(text);
                        } catch(e) {
                            console.log(`[AutoHunter] ❌ Bing JSON parse hatası: ${e.message}`);
                            console.log(`[AutoHunter] 📄 Bing ham veri: ${text.substring(0, 500)}`);
                            bingFailed = true;
                            continue;
                        }
                        
                        console.log(`[AutoHunter] 📊 Bing response: success=${json.success}, results=${json.results?.length || 0}, debug=`, json.debug);
                        
                        if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                            searchResult = { results: json.results, engine: 'bing' };
                        } else {
                            addLog(`⚠️ Bing başarısız (oturum için devre dışı)`, 'warn');
                            bingFailed = true;
                        }
                    } catch (e) {
                        addLog(`❌ Bing hata: ${e.message}`, 'error');
                        bingFailed = true;
                    }
                }
                
                // DuckDuckGo (sadece Google ve Bing başarısız olmuşsa ve daha önce başarısız olmamışsa)
                if (!searchResult && !duckduckgoFailed) {
                    console.log(`[AutoHunter] DuckDuckGo deneniyor: ${query}`);
                    const url = `${serverUrl}?type=search_duckduckgo&q=${encodeURIComponent(query)}&depth=30&gl=TR`;
                    
                    try {
                        const response = await fetch(url);
                        const text = await response.text();
                        console.log(`[AutoHunter] 🔍 DDG HTTP ${response.status}, length: ${text.length}`);
                        
                        let json;
                        try {
                            json = JSON.parse(text);
                        } catch(e) {
                            console.log(`[AutoHunter] ❌ DDG JSON parse hatası: ${e.message}`);
                            console.log(`[AutoHunter] 📄 DDG ham veri: ${text.substring(0, 500)}`);
                            duckduckgoFailed = true;
                            continue;
                        }
                        
                        console.log(`[AutoHunter] 📊 DDG response: success=${json.success}, results=${json.results?.length || 0}, debug=`, json.debug);
                        
                        if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                            searchResult = { results: json.results, engine: 'duckduckgo' };
                        } else {
                            addLog(`⚠️ DuckDuckGo başarısız (oturum için devre dışı)`, 'warn');
                            duckduckgoFailed = true;
                        }
                    } catch (e) {
                        addLog(`❌ DuckDuckGo hata: ${e.message}`, 'error');
                        duckduckgoFailed = true;
                    }
                }
                
                // DataForSEO (SON ÇARE - hepsi başarısız olursa)
                if (!searchResult && !dataforseoFailed) {
                    console.log(`[AutoHunter] DataForSEO deneniyor (son çare): ${query}`);
                    const url = `${serverUrl}?type=search_dataforseo&q=${encodeURIComponent(query)}&depth=10&gl=TR`;
                    try {
                        const response = await fetch(url);
                        const text = await response.text();
                        let json;
                        try {
                            json = JSON.parse(text);
                        } catch(e) {
                            console.log(`[AutoHunter] ❌ DataForSEO JSON parse hatası: ${e.message}`);
                            dataforseoFailed = true;
                            continue;
                        }
                        if (json.rate_limited) {
                            addLog(`⚠️ DataForSEO rate limit (oturum için devre dışı)`, 'warn');
                            dataforseoFailed = true;
                        } else if (json.success && Array.isArray(json.results) && json.results.length > 0) {
                            searchResult = { results: json.results, engine: 'dataforseo' };
                        } else {
                            addLog(`⚠️ DataForSEO başarısız (oturum için devre dışı)`, 'warn');
                            dataforseoFailed = true;
                        }
                    } catch (e) {
                        addLog(`❌ DataForSEO hata: ${e.message}`, 'error');
                        dataforseoFailed = true;
                    }
                }

                // Eğer hiçbir arama motoru çalışmıyorsa taramayı durdur
                if (!searchResult && googleFailed && braveFailed && bingFailed && duckduckgoFailed && dataforseoFailed) {
                    console.log(`[AutoHunter] 🚫 TÜM ARAMA MOTORLARI BAŞARISIZ! Tarama durduruluyor.`);
                    alert(`Hiçbir arama motoru çalışmıyor!\n\nTarama durduruldu.\nO ana kadar eklenen: ${totalAdded} site.`);
                    autoHunterRef.current.isRunning = false;
                    break;
                }
                
                // Sonuçları işle
                if (searchResult && searchResult.results.length > 0) {
                    addLog(`🔎 "${ilce} ${kw}" (${searchResult.engine}): ${searchResult.results.length} sonuç`, 'info');

                    const newResults = searchResult.results.filter(r => {
                        const domain = window.cleanDomain(r.url);
                        if (/\.(bel|gov|edu|k12|pol|tsk|mil)\.tr$/i.test(domain)) {
                            return false;
                        }
                        return !existingDomains.has(domain);
                    });

                    if (newResults.length === 0) {
                        addLog(`↩️ Yeni site yok (hepsi mevcut veya filtreli)`, 'info');
                    } else {
                        addLog(`➕ ${newResults.length} yeni site işleniyor...`, 'info');
                    }

                    for (const r of newResults) {
                        if (!autoHunterRef.current.isRunning) break;
                        if (foundViableCount >= targetCount) break;

                        // SUBDOMAIN KONTROLÜ - Ana domain değilse atla
                        const domain = window.cleanDomain(r.url);
                        const rootDomain = window.getRootDomain(r.url);
                        
                        // Eğer domain root domain değilse (subdomain ise) atla
                        if (domain !== rootDomain) {
                            console.log(`[AutoHunter] ⏭️ Subdomain atlandı: ${domain} (root: ${rootDomain})`);
                            continue;
                        }
                        
                        console.log(`[AutoHunter] Kontrol ediliyor: ${domain}`);
                        
                        // ANINDA EKLEME - Önce siteyi hemen ekle, sonra trafik/email kontrol et
                        // Trafik kontrolü başlat (beklemeden)
                        const trafficCheckPromise = window.checkTraffic(r.url);
                        // Email kontrolü başlat (beklemeden)  
                        const emailCheckPromise = window.findEmailsOnSite(r.url);
                        
                        try {
                            // Her ikisini de bekle
                            const trafficCheck = await trafficCheckPromise;
                            const emailFound = await emailCheckPromise;
                            
                            console.log(`[AutoHunter] Trafik sonucu: ${JSON.stringify(trafficCheck)}`);
                            console.log(`[AutoHunter] Email sonucu: ${emailFound || 'bulunamadı'}`);
                            
                            // YENİ MANTIK: Tüm siteler "New" olarak eklenir (trafik/email olsa da olmasa da)
                            // Kullanıcı mail gönderirken filtrelerle ayırıyor.
                            const isViable = trafficCheck && trafficCheck.viable && trafficCheck.value > 0;
                            const statusKey = 'New';
                            const statusLabel = 'New';
                            
                            console.log(`[AutoHunter] ✅ Site eklendi! ${domain} - Trafik: ${trafficCheck?.label || 'Yok'}, Email: ${emailFound || 'Yok'}, Status: ${statusKey}`);
                            
                            const now = new Date();
                            const dateStr = now.toLocaleDateString('tr-TR') + ' ' + now.toLocaleTimeString('tr-TR');
                            const autoNote = `Site Avcısı Otomasyonu ile ${dateStr} tarihinde eklenmiştir.`;

                            const safeTraffic = {
                                viable: trafficCheck?.viable === true,
                                label: trafficCheck?.label || 'Veri Yok',
                                value: Number(trafficCheck?.value) || 0,
                                note: trafficCheck?.note || ''
                            };
                            const newLead = {
                                url: domain,
                                email: emailFound || '',
                                statusKey: statusKey,
                                statusLabel: statusLabel,
                                stage: 0,
                                language: 'TR',
                                trafficStatus: safeTraffic,
                                addedDate: now.toISOString(),
                                source: 'AutoHunter',
                                sourceQuery: query,
                                notes: autoNote,
                                activityLog: [{
                                    date: now.toISOString(),
                                    type: 'INFO',
                                    content: `Otomatik Tarama ile eklendi (${query}). Trafik: ${trafficCheck?.label || 'Yok'}. Email: ${emailFound || 'Yok'}.`
                                }]
                            };

                            if (isDbConnected) {
                                const docRef = await dbInstance.collection("leads").add(newLead);
                                setCrmData(prev => [...prev, { ...newLead, id: docRef.id }]);
                                totalAdded++;
                                // Tam veri = email var + trafik viable
                                const hasFullData = isViable && emailFound && emailFound.length > 5;
                                if (hasFullData) fullDataCount++;
                                setAutoHunterStats({ totalFound: totalAdded, fullData: fullDataCount });
                                addLog(`✅ ${domain} eklendi | Trafik: ${safeTraffic.label} | Email: ${emailFound ? 'var' : 'yok'}${hasFullData ? ' | TAM VERİ' : ''}`, hasFullData ? 'success' : 'info');
                            }

                            existingDomains.add(domain);
                            if (isViable) {
                                foundViableCount++;
                            }
                        } catch (e) {
                            console.error(`[AutoHunter] Kontrol hatası: ${domain}`, e);

                            // Hata olsa bile siteyi New olarak ekle
                            try {
                                const now = new Date();
                                const dateStr = now.toLocaleDateString('tr-TR') + ' ' + now.toLocaleTimeString('tr-TR');
                                const autoNote = `Site Avcısı Otomasyonu ile ${dateStr} tarihinde eklenmiştir (Trafik/Email kontrolü hata ile).`;

                                const newLead = {
                                    url: domain,
                                    email: '',
                                    statusKey: 'New',
                                    statusLabel: 'New',
                                    stage: 0,
                                    language: 'TR',
                                    trafficStatus: { viable: false, label: 'Veri Yok', value: 0, note: '' },
                                    addedDate: now.toISOString(),
                                    source: 'AutoHunter',
                                    sourceQuery: query,
                                    notes: autoNote,
                                    activityLog: [{
                                        date: now.toISOString(),
                                        type: 'INFO',
                                        content: `Otomatik Tarama ile eklendi (Hata nedeniyle): ${e.message}`
                                    }]
                                };
                                
                                if (isDbConnected) {
                                    const docRef = await dbInstance.collection("leads").add(newLead);
                                    setCrmData(prev => [...prev, { ...newLead, id: docRef.id }]);
                                    totalAdded++;
                                    setAutoHunterStats({ totalFound: totalAdded, fullData: fullDataCount });
                                    addLog(`⚠️ ${domain} hata ile eklendi: ${e.message}`, 'warn');
                                }
                                existingDomains.add(domain);
                                // foundViableCount++; // Hata durumunda sayma ki gerçek hedefe ulaşılsın
                            } catch (addError) {
                                addLog(`❌ Ekleme hatası: ${domain} — ${addError.message}`, 'error');
                            }
                        }

                        await new Promise(r => setTimeout(r, 500));
                    }
                }

                // Her arama arasında BEKLEME (Rate Limiting önleme)
                // DuckDuckGo hızlı aramalarda bloke olur, bu yüzden uzun bekleme şart
                await new Promise(r => setTimeout(r, 3000));
            }

            // Her ilçe arasında ekstra bekleme
            await new Promise(r => setTimeout(r, 2000));
            currentIlceIndex++;
        }
        } catch (fatalErr) {
            addLog(`❌ Beklenmedik hata: ${fatalErr.message}`, 'error');
            console.error("[AutoHunter] Beklenmedik hata:", fatalErr);
        } finally {
            // Her çıkış yolunda progress'i kaydet (manuel stop, hata, hedef tamam)
            const wasStopped = !autoHunterRef.current.isRunning && foundViableCount < targetCount;
            await saveProgress('final');
            autoHunterRef.current.isRunning = false;
            setIsHunterRunning(false);
            const reason = foundViableCount >= targetCount
                ? `Hedefe ulaşıldı (${targetCount} uygun site).`
                : (wasStopped ? 'Manuel olarak durduruldu.' : 'Tüm ilçeler tarandı.');
            addLog(`🏁 ${reason} | Eklenen: ${totalAdded} | Tam Veri: ${fullDataCount} | Uygun: ${foundViableCount}`, 'success');
            alert(`Tarama tamamlandı.\n\n${reason}\n\n✅ Toplam eklenen: ${totalAdded} site\n⭐ Tam verili: ${fullDataCount} site\n📊 Uygun (trafikli): ${foundViableCount} site\n📍 Son ilçe indeksi: ${currentIlceIndex % ilceList.length}`);
        }
    };

    // Otomatik taramayı durdur
    const stopAutoHunterScan = () => {
        autoHunterRef.current.isRunning = false;
        setIsHunterRunning(false);
        console.log("[AutoHunter] Durdurma komutu verildi, mevcut işlem bitince tamamen duracak.");
    };
    
    // Bittiğinde state'i güncelle
    useEffect(() => {
        if (!autoHunterRef.current.isRunning && isHunterRunning) {
            setIsHunterRunning(false);
        }
    }, [isHunterRunning]);

    // --- TEK SEFERLİK VERİ TUTARLILIK DÜZELTMESİ ---
    const fixLeadConsistency = async () => {
        if (!isDbConnected || !dbInstance) return alert("Veritabanı bağlı değil!");
        if (!confirm("Tutarsız lead verileri düzeltilecek (statusKey/stage uyumsuzlukları).\nDevam edilsin mi?")) return;

        let fixCount = 0;
        let urlFixCount = 0;
        let batch = dbInstance.batch();
        let batchCount = 0;
        const allUpdates = {};

        // Doğrudan Firestore'dan tüm leadleri çek (crmData filter edilmiş olabilir)
        let allLeads = [];
        try {
            const snapshot = await dbInstance.collection('leads').get();
            allLeads = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            console.log(`[fixLeadConsistency] Firestore'dan ${allLeads.length} lead çekildi`);
        } catch (e) {
            return alert("Lead'ler çekilemedi: " + e.message);
        }

        if (allLeads.length === 0) {
            return alert("Düzeltilecek lead bulunamadı (DB boş?).");
        }

        const todayIso = new Date().toISOString();
        for (const lead of allLeads) {
            const updates = {};
            const sk = lead.statusKey || '';
            const isNewOrEmpty = !sk || sk === 'New';
            const hasBounce = Array.isArray(lead.activityLog) && lead.activityLog.some(a => a.type === 'BOUNCE');
            const hasBeenContacted = !!lead.lastContactDate;
            const hasBeenOpened = !!lead.mailOpenedAt;
            const hasNoEmail = !lead.email || lead.email.length < 5 || lead.email === '-';

            // 1. Bounce kaydı var ama statusKey MAIL_ERROR değil → düzelt
            if (hasBounce && sk !== 'MAIL_ERROR') {
                updates.statusKey = 'MAIL_ERROR';
                updates.statusLabel = 'Error in mail (Bounced)';
            }
            // 2. Email yok/geçersiz + mail gönderilmiş + hâlâ New → MAIL_ERROR
            else if (hasNoEmail && hasBeenContacted && isNewOrEmpty) {
                updates.statusKey = 'MAIL_ERROR';
                updates.statusLabel = 'Error in mail';
            }
            // 3. Mail gönderilmiş veya okunmuş ama hâlâ New → NO_REPLY + stage düzelt
            else if ((hasBeenContacted || hasBeenOpened) && isNewOrEmpty) {
                updates.statusKey = 'NO_REPLY';
                updates.statusLabel = window.LEAD_STATUSES['NO_REPLY']?.label || 'No reply yet';
                if ((lead.stage || 0) === 0) updates.stage = 1;
            }

            // 4. addedDate yoksa: önce lastContactDate, yoksa bugün
            if (!lead.addedDate) {
                updates.addedDate = lead.lastContactDate || todayIso;
            }

            // 5. URL alanı yalın domain değilse (protokol, path, query, www vs.) normalize et
            if (lead.url) {
                const cleaned = window.cleanDomain(lead.url);
                if (cleaned && cleaned !== lead.url) {
                    updates.url = cleaned;
                    urlFixCount++;
                }
            }

            if (Object.keys(updates).length > 0) {
                batch.update(dbInstance.collection("leads").doc(lead.id), updates);
                allUpdates[lead.id] = updates;
                batchCount++;
                fixCount++;

                if (batchCount >= 490) {
                    await batch.commit();
                    batch = dbInstance.batch();
                    batchCount = 0;
                }
            }
        }

        if (batchCount > 0) await batch.commit();
        setCrmData(prev => prev.map(p => allUpdates[p.id] ? { ...p, ...allUpdates[p.id] } : p));
        alert(`${allLeads.length} lead tarandı.\n${fixCount} tanesi düzeltildi.\n(${urlFixCount} tanesinin URL'si yalın domaine çevrildi.)`);
    };

    // --- FINAL CHECK ---
    const servicesObj = {
        selectedLead, setSelectedLead, isSending, openMailModal, openPromotionModal, handleSendMail, showBulkModal, setShowBulkModal, isBulkSending, bulkProgress, bulkConfig, setBulkConfig, executeBulkSend, executeBulkPromotion, isCheckingBulk, handleBulkReplyCheck, bulkUpdateStatus, bulkUpdateLanguage, bulkUpdateStage, bulkAddNotViable, isEnriching, showEnrichModal, setShowEnrichModal, enrichLogs, enrichProgress, enrichDatabase, stopEnrichBackground, isScanning, keywords, setKeywords, searchDepth, setSearchDepth, hunterLogs, hunterProgress, hunterLogsEndRef, startScan, stopScan, handleExportData, fixEncodedNames, startAutoFollowup, stopAutoFollowup, runAutoHunterScan, stopAutoHunterScan, isHunterRunning, autoHunterLogs, autoHunterStats, autoHunterLogsEndRef, fixLeadConsistency
    };

    return servicesObj;
};

