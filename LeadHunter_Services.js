// LeadHunter_Services.js
// Görev: Mail Gönderimi, Toplu İşlemler, Veri Zenginleştirme ve Hunter Taramaları

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
    getStageInfo 
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

    // --- TRACKING SYNC (NEW) ---
    // Her 60 saniyede bir PHP sunucusundan açılma verilerini kontrol et
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

                    crmData.forEach(lead => {
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
                        console.log(`${updateCount} adet okunma bilgisi güncellendi.`);
                    }
                }
            } catch (e) {
                console.warn("Tracking Sync Hatası:", e);
            }
        };

        const intervalId = setInterval(checkOpens, 60000); // 1 Dakika
        checkOpens(); // İlk yüklemede çalıştır

        return () => clearInterval(intervalId);
    }, [isDbConnected, crmData]);

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
            if(lead.email && lead.email.length > 5) { 
                const m = lead.email.split(',')[0].trim(); 
                if(!grouped[m]) grouped[m]=[]; 
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
                if(info.isFinished) { addBulkLog(`${email}: Süreç bitmiş`, false); continue; } 
                template = info.template; 
            }
            
            if (!template) { addBulkLog(`${email}: Şablon yok`, false); continue; }
            
            try {
                const subject = template.subject.replace(/{{Website}}/g, domainsString);
                const body = template.body.replace(/{{Website}}/g, uniqueDomains.join(', '));
                
                const messageHtml = body.replace(/\n/g, '<br>');
                let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';
                
                // --- TRACKING PIXEL (TOPLU) ---
                // Not: Grup halinde gönderimde sadece ilk lead'in ID'sini tracking ID olarak kullanıyoruz.
                // İdealde her siteye ayrı mail gerekir ama toplu gönderimde birleştirme mantığı var.
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

    // ... Diğer fonksiyonlar aynen kalacak (checkReply, enrich, hunter, actions vb.)
    // Kod kalabalığı yapmamak için sadece değişen fonksiyonları yukarıda verdim.
    // Diğer fonksiyonlar (handleBulkReplyCheck, fixAllTrafficData, bulkUpdateStatus vb.) orijinal dosyadaki gibi kalmalıdır.
    
    // NOT: Bu `return` bloğunda diğer tüm eski fonksiyonları da döndürmeyi unutma.
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
        handleBulkReplyCheck: services?.handleBulkReplyCheck || window.useLeadHunterServices.handleBulkReplyCheck, // Geri kalanlar orijinalden gelecek
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
        fixAllTrafficData,
        // Diğerleri... (handleBulkReplyCheck vs. için closure içinde tanımlı olmalı, burada kısaltıldı)
        handleBulkReplyCheck, bulkUpdateStatus, bulkSetLanguage, bulkAddNotViable, enrichDatabase, startScan, stopScan, fixAllTrafficData
    };
};
