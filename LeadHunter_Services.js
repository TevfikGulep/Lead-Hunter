// LeadHunter_Services.js
// Görev: Mail Gönderimi, Toplu İşlemler, Veri Zenginleştirme ve Hunter Taramaları
// GÜNCELLEME: Otomatik Cevap Kontrolü (Auto Reply Check) eklendi.

const { useState, useRef, useEffect } = React;

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

    // Mail State
    const [selectedLead, setSelectedLead] = useState(null);
    const [isSending, setIsSending] = useState(false);

    // Bulk Mail State
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [isBulkSending, setIsBulkSending] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, logs: [] });
    const [bulkConfig, setBulkConfig] = useState({ templateType: 'AUTO', specificStage: 0, language: 'TR' });
    const [isCheckingBulk, setIsCheckingBulk] = useState(false);

    // Enrich State
    const [isEnriching, setIsEnriching] = useState(false);
    const [showEnrichModal, setShowEnrichModal] = useState(false);
    const [enrichLogs, setEnrichLogs] = useState([]);
    const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 });

    // Hunter State
    const [isScanning, setIsScanning] = useState(false);
    const [keywords, setKeywords] = useState('');
    const [searchDepth, setSearchDepth] = useState(30);
    const [hunterLogs, setHunterLogs] = useState([]);
    const [hunterProgress, setHunterProgress] = useState(0);

    const scanIntervalRef = useRef(false);
    const hunterLogsEndRef = useRef(null);

    // Auto Check için Ref (State bağımlılığını kırmak için)
    const crmDataRef = useRef(crmData);
    useEffect(() => { crmDataRef.current = crmData; }, [crmData]);

    // --- 1. TRACKING SYNC (MAIL TAKİP - PIXEL) ---
    useEffect(() => {
        if (!isDbConnected) return;

        const checkOpens = async () => {
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
            if (!serverUrl) return;

            try {
                // Cache buster ekleyerek sync_opens isteği at
                const response = await fetch(`${serverUrl}?type=sync_opens&_t=${Date.now()}`);
                const result = await response.json();

                if (result.success && result.data) {
                    const trackingData = result.data; // { 'LEAD_ID': '2023-10-27T10:00:00+03:00' }
                    const batch = dbInstance.batch();
                    let updateCount = 0;

                    // Ref yerine anlık crmData üzerinde dönebiliriz çünkü burası snapshot listener ile besleniyor
                    // Ancak batch update yapacağımız için crmDataRef.current kullanmak daha güvenli olabilir
                    const currentLeads = crmDataRef.current;

                    currentLeads.forEach(lead => {
                        const openedAt = trackingData[lead.id];
                        // Eğer sunucuda açılma kaydı varsa VE (bizde kayıt yoksa VEYA tarih bizden yeniyse)
                        if (openedAt && (!lead.mailOpenedAt || new Date(openedAt) > new Date(lead.mailOpenedAt))) {
                            const ref = dbInstance.collection("leads").doc(lead.id);

                            const newLog = {
                                date: openedAt,
                                type: 'INFO',
                                content: 'Mail okundu (Tracking Pixel)'
                            };

                            batch.update(ref, {
                                mailOpenedAt: openedAt,
                                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
                            });
                            updateCount++;
                        }
                    });

                    if (updateCount > 0) {
                        await batch.commit();
                        console.log(`[Tracking] ${updateCount} adet okunma bilgisi güncellendi.`);
                    }
                }
            } catch (e) {
                console.warn("Tracking Sync Hatası:", e);
            }
        };

        const intervalId = setInterval(checkOpens, 60000); // 1 Dakika
        // İlk yüklemede çalıştır (biraz gecikmeli ki veri gelmiş olsun)
        const timeoutId = setTimeout(checkOpens, 5000);

        return () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };
    }, [isDbConnected]); // crmData bağımlılığı kaldırıldı, ref kullanılıyor

    // --- 2. AUTO REPLY CHECK (OTOMATİK CEVAP KONTROLÜ) ---
    useEffect(() => {
        if (!isDbConnected || !settings.googleScriptUrl) return;

        const autoCheckReplies = async () => {
            const currentData = crmDataRef.current;

            // Filtreleme: 
            // 1. Thread ID'si olanlar
            // 2. Statüsü 'MAIL_ERROR' veya 'NOT_VIABLE' olmayanlar (Bunlar zaten ölü)
            // 3. Statüsü 'DEAL_ON', 'DEAL_OFF' olmayanlar (Süreç bitmiş, gereksiz API yormayalım)
            // 4. Öncelik: Son temas tarihi en yeni olan 50 kayıt (Google API Kotası İçin Limit)

            const candidates = currentData.filter(l =>
                l.threadId &&
                !['MAIL_ERROR', 'NOT_VIABLE', 'DEAL_ON', 'DEAL_OFF', 'DENIED'].includes(l.statusKey)
            );

            if (candidates.length === 0) return;

            // En son işlem görenleri önce tara
            const sortedCandidates = [...candidates]
                .sort((a, b) => new Date(b.lastContactDate || 0) - new Date(a.lastContactDate || 0))
                .slice(0, 50); // Maksimum 50 kayıt tara

            console.log(`[Auto Reply] ${sortedCandidates.length} aktif kayıt taranıyor...`);

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

                        // Eğer cevap bulunduysa
                        if (result && result.hasReply) {
                            const ref = dbInstance.collection("leads").doc(lead.id);

                            if (result.isBounce) {
                                // Bounce (Hata) Durumu
                                // Zaten hata olarak işaretlenmediyse güncelle
                                if (lead.statusKey !== 'MAIL_ERROR') {
                                    const newLog = { date: new Date().toISOString(), type: 'BOUNCE', content: `Sistem: Mail İletilemedi (Otomatik Tespit)` };
                                    batch.update(ref, {
                                        statusKey: 'MAIL_ERROR',
                                        statusLabel: 'Error in mail (Bounced)',
                                        email: '', // Hatalı maili temizle
                                        lastContactDate: new Date().toISOString(),
                                        activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
                                    });
                                    updatesCount++;
                                }
                            } else {
                                // Normal Cevap Durumu
                                // Zaten 'Cevaplandı' statüsünde değilse güncelle (Örn: INTERESTED, ASKED_MORE)
                                if (!['INTERESTED', 'ASKED_MORE', 'IN_PROCESS'].includes(lead.statusKey)) {
                                    const newLog = { date: new Date().toISOString(), type: 'REPLY', content: `Sistem: Yeni Cevap Alındı (${result.snippet?.substring(0, 30)}...)` };
                                    batch.update(ref, {
                                        statusKey: 'INTERESTED',
                                        statusLabel: 'Showed interest (Auto Check)',
                                        lastContactDate: new Date().toISOString(),
                                        activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
                                    });
                                    updatesCount++;
                                }
                            }
                        }
                    });

                    if (updatesCount > 0) {
                        await batch.commit();
                        console.log(`[Auto Reply] ${updatesCount} kayıt güncellendi.`);
                    } else {
                        console.log(`[Auto Reply] Yeni değişiklik yok.`);
                    }
                }
            } catch (e) {
                console.warn("[Auto Reply] Hata:", e);
            }
        };

        // 50 Dakikada bir çalıştır (3.000.000 ms)
        const intervalId = setInterval(autoCheckReplies, 3000000);

        // Sayfa açıldıktan 15 saniye sonra ilk kontrolü yap
        const timeoutId = setTimeout(autoCheckReplies, 15000);

        return () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };
    }, [isDbConnected, settings.googleScriptUrl]); // Sadece bağlantı veya URL değişirse interval'i resetle

    // --- FUNCTIONS ---

    // 1. Mail Modal Açma
    const openMailModal = (lead) => {
        const info = getStageInfo(lead.stage || 0, lead.language);
        if (info.isFinished) return alert("Süreç tamamlanmış.");

        const domain = window.cleanDomain(lead.url);

        setSelectedLead({
            ...lead,
            currentLabel: info.label,
            draft: {
                to: lead.email ? lead.email.split(',')[0].trim() : '',
                subject: info.template.subject.replace(/{{Website}}/g, domain),
                body: info.template.body.replace(/{{Website}}/g, domain)
            },
            allEmails: lead.email
        });
    };

    // 2. Tekil Mail Gönderme
    const handleSendMail = async () => {
        if (!selectedLead) return;
        setIsSending(true);

        try {
            const messageHtml = selectedLead.draft.body.replace(/\n/g, '<br>');
            let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';

            // --- TRACKING PIXEL EKLEME ---
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
            const trackingPixel = serverUrl ? `<img src="${serverUrl}?type=track&id=${selectedLead.id}" width="1" height="1" style="display:none;" alt="" />` : '';
            // -----------------------------

            const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>${trackingPixel}`;
            const plainBody = selectedLead.draft.body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');

            const response = await fetch(settings.googleScriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'send_mail',
                    to: selectedLead.draft.to,
                    subject: selectedLead.draft.subject,
                    body: plainBody,
                    htmlBody: htmlContent,
                    threadId: selectedLead.threadId || null
                })
            });
            const result = await response.json();

            if (result.status === 'error') throw new Error(result.message);

            if (isDbConnected) {
                const newLog = {
                    date: new Date().toISOString(),
                    type: 'MAIL',
                    content: `Mail Gönderildi: ${selectedLead.currentLabel}`
                };
                const updateData = {
                    statusKey: 'NO_REPLY',
                    statusLabel: window.LEAD_STATUSES['NO_REPLY'].label,
                    stage: (selectedLead.stage || 0) + 1,
                    lastContactDate: new Date().toISOString(),
                    [`history.${selectedLead.stage === 0 ? 'initial' : `repeat${selectedLead.stage}`}`]: new Date().toISOString(),
                    activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
                };

                if (result.threadId) updateData.threadId = result.threadId;

                await dbInstance.collection("leads").doc(selectedLead.id).update(updateData);

                setCrmData(prev => prev.map(p => p.id === selectedLead.id ? {
                    ...p,
                    ...updateData,
                    activityLog: [...(p.activityLog || []), newLog]
                } : p));
            }
            alert("Mail gönderildi!");
            setSelectedLead(null);
        } catch (e) { alert("Hata: " + e.message); }
        setIsSending(false);
    };

    // 3. Toplu Mail Gönderme
    const executeBulkSend = async () => {
        if (!confirm(`${selectedIds.size} site için toplu gönderim yapılacak. Onaylıyor musunuz?`)) return;

        setIsBulkSending(true);
        const selectedLeads = crmData.filter(l => selectedIds.has(l.id));

        const grouped = {};
        selectedLeads.forEach(lead => {
            if (lead.email && lead.email.length > 5) {
                const m = lead.email.split(',')[0].trim();
                if (!grouped[m]) grouped[m] = [];
                grouped[m].push(lead);
            }
        });

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

            if (bulkConfig.templateType === 'SPECIFIC') {
                targetStage = parseInt(bulkConfig.specificStage);
                template = getStageInfo(targetStage, mainLead.language || bulkConfig.language).template;
            } else {
                const info = getStageInfo(targetStage, mainLead.language || bulkConfig.language);
                if (info.isFinished) { addBulkLog(`${email}: Süreç bitmiş`, false); continue; }
                template = info.template;
            }

            if (!template) { addBulkLog(`${email}: Şablon yok`, false); continue; }

            try {
                const subject = template.subject.replace(/{{Website}}/g, domainsString);
                const body = template.body.replace(/{{Website}}/g, uniqueDomains.join(', '));

                const messageHtml = body.replace(/\n/g, '<br>');
                let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';

                // --- TRACKING PIXEL (TOPLU) ---
                const trackingPixel = serverUrl ? `<img src="${serverUrl}?type=track&id=${mainLead.id}" width="1" height="1" style="display:none;" alt="" />` : '';
                // ------------------------------

                const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>${trackingPixel}`;
                const plainBody = body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');

                const response = await fetch(settings.googleScriptUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'send_mail',
                        to: email,
                        subject: subject,
                        body: plainBody,
                        htmlBody: htmlContent,
                        threadId: mainLead.threadId || null
                    })
                });
                const result = await response.json();

                if (result.status === 'error') throw new Error(result.message);

                addBulkLog(`${email}: Gönderildi`, true);

                if (isDbConnected) {
                    const batch = dbInstance.batch();
                    group.forEach(l => {
                        const newLog = {
                            date: new Date().toISOString(),
                            type: 'MAIL',
                            content: `Toplu Gönderildi: ${targetStage}. Aşama`
                        };
                        const ref = dbInstance.collection("leads").doc(l.id);
                        const updateData = {
                            statusKey: 'NO_REPLY',
                            statusLabel: window.LEAD_STATUSES['NO_REPLY'].label,
                            stage: targetStage + 1,
                            lastContactDate: new Date().toISOString(),
                            [`history.${targetStage === 0 ? 'initial' : `repeat${targetStage}`}`]: new Date().toISOString(),
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

        setIsBulkSending(false);
        setSelectedIds(new Set());
        alert("Tamamlandı.");
        setShowBulkModal(false);
    };

    // 4. Toplu Cevap Kontrolü
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
                console.warn("FULL RESPONSE:", data);
                if (data.results) {
                    console.table(data.results);
                }

                const results = data.results;
                let updatedCount = 0;
                let bounceCount = 0;
                const batch = dbInstance.batch();
                let hasUpdates = false;

                candidates.forEach(lead => {
                    const result = results[lead.threadId];
                    if (result && result.hasReply) {
                        const ref = dbInstance.collection("leads").doc(lead.id);
                        if (result.isBounce) {
                            if (lead.statusKey !== 'MAIL_ERROR') {
                                const newLog = {
                                    date: new Date().toISOString(),
                                    type: 'BOUNCE',
                                    content: `Otomatik Tarama: Mail İletilemedi (Bounce)`
                                };
                                batch.update(ref, {
                                    statusKey: 'MAIL_ERROR',
                                    statusLabel: 'Error in mail (Bounced)',
                                    email: '',
                                    lastContactDate: new Date().toISOString(),
                                    activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
                                });
                                bounceCount++; hasUpdates = true;
                            }
                        } else if (!['INTERESTED', 'DEAL_ON', 'NOT_POSSIBLE', 'DENIED', 'MAIL_ERROR'].includes(lead.statusKey)) {
                            const newLog = {
                                date: new Date().toISOString(),
                                type: 'REPLY',
                                content: `Yeni Cevap Alındı: ${result.snippet?.substring(0, 50)}...`
                            };
                            batch.update(ref, {
                                statusKey: 'INTERESTED',
                                statusLabel: 'Showed interest (Reply Found)',
                                lastContactDate: new Date().toISOString(),
                                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
                            });
                            updatedCount++; hasUpdates = true;
                        }
                    }
                });

                if (hasUpdates) { await batch.commit(); alert(`Tarama Tamamlandı!\n✅ ${updatedCount} yeni cevap\n❌ ${bounceCount} bounce`); }
                else { alert("Değişiklik yok."); }
            } else { alert("Hata: " + data.message); }
        } catch (e) { alert("Bağlantı Hatası: " + e.message); }
        setIsCheckingBulk(false);
    };

    // 5. Trafik Verisi Düzeltme
    const fixAllTrafficData = async () => {
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        if (!confirm("Trafik verileri düzeltilecek. Onay?")) return;
        const batch = dbInstance.batch(); let count = 0;

        crmData.forEach(lead => {
            if (lead.trafficStatus && lead.trafficStatus.label && (lead.trafficStatus.value === undefined || lead.trafficStatus.value === 0)) {
                const parsedValue = window.parseTrafficToNumber(lead.trafficStatus.label);
                batch.update(dbInstance.collection("leads").doc(lead.id), { trafficStatus: { ...lead.trafficStatus, value: parsedValue } }); count++;
            }
        });

        if (count > 0) { await batch.commit(); alert(`${count} kayıt güncellendi!`); }
        else { alert("Düzeltilecek kayıt yok."); }
    };

    // 6. Toplu Durum Güncelleme
    const bulkUpdateStatus = async (newStatusKey) => {
        if (selectedIds.size === 0) return alert("Lütfen kayıt seçin.");
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");

        const statusLabel = window.LEAD_STATUSES[newStatusKey]?.label || newStatusKey;
        if (!confirm(`Seçili ${selectedIds.size} kaydın durumu '${statusLabel}' olarak güncellenecek. Onaylıyor musunuz?`)) return;

        const batch = dbInstance.batch();
        const timestamp = new Date().toISOString();
        const newLog = {
            date: timestamp,
            type: 'SYSTEM',
            content: `Durum manuel olarak '${statusLabel}' yapıldı (Toplu İşlem).`
        };

        selectedIds.forEach(id => {
            const ref = dbInstance.collection("leads").doc(id);
            batch.update(ref, {
                statusKey: newStatusKey,
                statusLabel: statusLabel,
                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
            });
        });

        try {
            await batch.commit();
            setCrmData(prev => prev.map(item => {
                if (selectedIds.has(item.id)) {
                    return { ...item, statusKey: newStatusKey, statusLabel: statusLabel, activityLog: [...(item.activityLog || []), newLog] };
                }
                return item;
            }));
            setSelectedIds(new Set());
            alert("Durumlar başarıyla güncellendi.");
        } catch (e) {
            alert("Hata: " + e.message);
        }
    };

    // 7. Toplu Dil Ayarlama
    const bulkSetLanguage = async (lang) => {
        if (selectedIds.size === 0) return alert("Lütfen kayıt seçin.");
        if (!confirm(`Seçili ${selectedIds.size} kaydın dili '${lang}' yapılacak. Onay?`)) return;

        const batch = dbInstance.batch();
        selectedIds.forEach(id => batch.update(dbInstance.collection("leads").doc(id), { language: lang }));

        await batch.commit();
        setSelectedIds(new Set());
        alert("Dil güncellendi.");
    };

    // 8. Toplu 'Not Viable' Ekleme
    const bulkAddNotViable = async () => {
        if (selectedIds.size === 0 || !isDbConnected) return;
        if (!confirm(`${selectedIds.size} adet site 'Not Viable' olarak eklenecek.`)) return;

        const batch = dbInstance.batch();
        let count = 0;

        selectedIds.forEach(id => {
            const lead = leads.find(l => l.id === id);
            if (lead && !crmData.some(c => window.cleanDomain(c.url) === window.cleanDomain(lead.url))) {
                batch.set(dbInstance.collection("leads").doc(), { url: lead.url, email: lead.email || '', statusKey: 'NOT_VIABLE', statusLabel: 'Not Viable', stage: 0, language: 'TR', trafficStatus: lead.trafficStatus || { viable: false }, addedDate: new Date().toISOString() }); count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            setLeads(prev => prev.filter(l => !selectedIds.has(l.id)));
            setSelectedIds(new Set());
            alert(`${count} site eklendi.`);
        }
    };

    // 9. Veri Zenginleştirme (Enrich)
    const enrichDatabase = async (mode = 'BOTH') => {
        const negativeStatuses = ['NOT_VIABLE', 'NOT_POSSIBLE', 'DENIED', 'DEAL_OFF', 'NON_RESPONSIVE'];

        const targets = crmData.filter(item => {
            if (negativeStatuses.includes(item.statusKey)) return false;
            const missingEmail = !item.email || item.email.length < 5 || item.email === '-' || item.statusKey === 'MAIL_ERROR';
            const missingTraffic = !item.trafficStatus || !item.trafficStatus.label || ['Bilinmiyor', 'Veri Yok', 'Hata', '-', 'API Ayarı Yok'].includes(item.trafficStatus.label) || !item.trafficStatus.value || item.trafficStatus.value < 100;
            if (mode === 'EMAIL') return missingEmail;
            if (mode === 'TRAFFIC') return missingTraffic;
            return missingEmail || missingTraffic;
        });

        if (targets.length === 0) return alert("Seçilen kriterlere uygun eksik veri bulunamadı.");

        setShowEnrichModal(true);
        setIsEnriching(true);
        setEnrichLogs([]);
        setEnrichProgress({ current: 0, total: targets.length });

        const addEnrichLog = (msg, type = 'info') => {
            setEnrichLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: msg, type: type }]);
        };

        addEnrichLog(`Toplam ${targets.length} site taranacak...`, 'info');

        for (let i = 0; i < targets.length; i++) {
            const lead = targets[i];
            let updates = {};
            setEnrichProgress(prev => ({ ...prev, current: i + 1 }));

            const missingEmail = !lead.email || lead.email.length < 5 || lead.statusKey === 'MAIL_ERROR';
            const missingTraffic = !lead.trafficStatus || !lead.trafficStatus.label || ['Bilinmiyor', 'Veri Yok', 'Hata', '-', 'API Ayarı Yok'].includes(lead.trafficStatus.label) || !lead.trafficStatus.value || lead.trafficStatus.value < 100;

            addEnrichLog(`${window.cleanDomain(lead.url)} analizi başlıyor...`, 'info');

            if ((mode === 'TRAFFIC' || mode === 'BOTH') && missingTraffic) {
                addEnrichLog(`> Trafik aranıyor...`, 'warning');
                try {
                    const t = await window.checkTraffic(lead.url);
                    if (t && t.label !== 'Hata' && t.label !== 'API Ayarı Yok') {
                        updates.trafficStatus = t;
                        addEnrichLog(`> Trafik bulundu: ${t.label}`, 'success');
                    } else {
                        addEnrichLog(`> Trafik verisi alınamadı (${t.label}).`, 'error');
                    }
                } catch (e) {
                    addEnrichLog(`> Trafik API hatası: ${e.message}`, 'error');
                }
            }

            if ((mode === 'EMAIL' || mode === 'BOTH') && missingEmail) {
                addEnrichLog(`> Email taranıyor...`, 'warning');
                try {
                    const e = await window.findEmailsOnSite(lead.url);
                    if (e) {
                        updates.email = e;
                        addEnrichLog(`> Email bulundu: ${e}`, 'success');
                        if (lead.statusKey === 'MAIL_ERROR') {
                            updates.statusKey = 'New';
                            updates.stage = 0;
                            addEnrichLog(`> Durum düzeltildi (New).`, 'success');
                        }
                    } else {
                        addEnrichLog(`> Email bulunamadı.`, 'error');
                    }
                } catch (err) {
                    addEnrichLog(`> Email hatası: ${err.message}`, 'error');
                }
            }

            const hasUpdates = Object.keys(updates).length > 0;

            if (hasUpdates && isDbConnected) {
                try {
                    await dbInstance.collection("leads").doc(lead.id).update(updates);
                    addEnrichLog(`✓ Veritabanı güncellendi.`, 'success');
                    setCrmData(prev => prev.map(p => p.id === lead.id ? { ...p, ...updates } : p));
                } catch (dbErr) {
                    addEnrichLog(`x DB Yazma Hatası: ${dbErr.message}`, 'error');
                }
            } else {
                addEnrichLog(`- Güncelleme yapılmadı.`, 'info');
            }

            await new Promise(r => setTimeout(r, 1000));
        }

        addEnrichLog(`Tüm işlemler tamamlandı.`, 'success');
        setIsEnriching(false);
    };

    // 10. Hunter Tarama Başlatma
    const startScan = async () => {
        const keywordList = keywords.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
        if (keywordList.length === 0) return alert("Kelime giriniz.");

        scanIntervalRef.current = true;
        setIsScanning(true);
        setLeads([]);
        setHunterLogs([]);
        setHunterProgress(0);

        const addLog = (msg, type = 'info') => setHunterLogs(p => [...p, { time: new Date().toLocaleTimeString(), message: msg, type }]);

        for (let i = 0; i < keywordList.length; i++) {
            if (!scanIntervalRef.current) break;
            const kw = keywordList[i];
            addLog(`Aranıyor: ${kw}`);

            try {
                addLog(`Sunucuya istek gönderiliyor: ${kw}`, 'info');

                const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.SERVER_API_URL) || '';
                if (!serverUrl) {
                    addLog("HATA: Server API URL tanımlı değil.", 'error');
                } else {
                    const country = searchLocation || 'TR';
                    const url = `${serverUrl}?type=search&q=${encodeURIComponent(kw)}&depth=${searchDepth}&gl=${country}`;

                    addLog(`İstek URL: ${url}`, 'info');

                    const response = await fetch(url);
                    const text = await response.text();
                    addLog(`Ham Cevap: ${text.substring(0, 100)}...`, 'info');

                    let json;
                    try {
                        json = JSON.parse(text);
                    } catch (e) {
                        addLog(`JSON Parse Hatası: ${e.message}`, 'error');
                        continue;
                    }

                    if (json.success && Array.isArray(json.results)) {
                        addLog(`${json.results.length} adet sonuç geldi.`, 'success');

                        // Sonuçları işle
                        const newLeads = json.results.map(r => ({
                            id: Math.random().toString(36).substr(2, 9),
                            url: r.url,
                            title: r.title,
                            description: r.snippet,
                            trafficStatus: { label: 'Analiz Bekleniyor...', value: 0 },
                            email: null
                        }));

                        // Sonuçları işle


                        // Leads state'ini güncelle
                        setLeads(prev => [...prev, ...newLeads]);

                    } else {
                        addLog(`API Hatası: ${json.error || 'Bilinmeyen Hata'}`, 'warning');
                    }
                }

            } catch (err) {
                addLog(`Kritik Hata: ${err.message}`, 'error');
            }

            await new Promise(r => setTimeout(r, 1000));
            setHunterProgress(((i + 1) / keywordList.length) * 100);
        }

        setIsScanning(false);
        scanIntervalRef.current = false;
        addLog("Bitti.", 'success');
    };

    const stopScan = () => {
        scanIntervalRef.current = false;
        setIsScanning(false);
    };

    return {
        selectedLead, setSelectedLead,
        isSending,
        openMailModal,
        handleSendMail,
        showBulkModal, setShowBulkModal,
        isBulkSending,
        bulkProgress,
        bulkConfig, setBulkConfig,
        executeBulkSend,
        isCheckingBulk,
        handleBulkReplyCheck,
        bulkUpdateStatus,
        bulkSetLanguage,
        bulkAddNotViable,
        isEnriching,
        showEnrichModal, setShowEnrichModal,
        enrichLogs,
        enrichProgress,
        enrichDatabase,
        isScanning,
        keywords, setKeywords,
        searchDepth, setSearchDepth,
        hunterLogs,
        hunterProgress,
        hunterLogsEndRef,
        startScan,
        stopScan,
        fixAllTrafficData
    };
};
