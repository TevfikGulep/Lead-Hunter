// LeadHunter.js

const { useState, useEffect, useRef, useMemo } = React;

// --- MAIN COMPONENT ---
const LeadHunter = () => {
    // --- STATE DEFINITIONS ---
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authEmail, setAuthEmail] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [loginError, setLoginError] = useState('');

    const [activeTab, setActiveTab] = useState('dashboard');
    const [searchLocation, setSearchLocation] = useState('tr');

    // config.js'den gelen Firebase ayarını string'e çevir
    const defaultFirebaseConfig = (window.APP_CONFIG && window.APP_CONFIG.FIREBASE_CONFIG) 
        ? JSON.stringify(window.APP_CONFIG.FIREBASE_CONFIG) 
        : '';

    const [settings, setSettings] = useState({
        googleApiKey: '', searchEngineId: '', geminiApiKey: '', 
        googleScriptUrl: '', signature: '', followUpDays: 7,
        firebaseConfig: defaultFirebaseConfig, 
        workflowTR: window.DEFAULT_WORKFLOW_TR,
        workflowEN: window.DEFAULT_WORKFLOW_EN
    });

    const [dbInstance, setDbInstance] = useState(null);
    const [isDbConnected, setIsDbConnected] = useState(false);
    const [crmData, setCrmData] = useState([]);
    const [emailMap, setEmailMap] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState({ key: 'lastContactDate', direction: 'desc' });
    
    const [filters, setFilters] = useState({ 
        search: '', language: 'ALL', status: [], lastSentStage: 'ALL', quality: 'ALL', startDate: '', endDate: ''
    });
    
    const [selectedLead, setSelectedLead] = useState(null);
    const [historyModalLead, setHistoryModalLead] = useState(null);
    const [replyCheckResult, setReplyCheckResult] = useState(null); 
    const [isCheckingReply, setIsCheckingReply] = useState(false);
    const [isCheckingBulk, setIsCheckingBulk] = useState(false);

    const [editingRowId, setEditingRowId] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [isScanning, setIsScanning] = useState(false);
    const [keywords, setKeywords] = useState('');
    const [searchDepth, setSearchDepth] = useState(30);
    const [leads, setLeads] = useState([]);
    const [logs, setLogs] = useState([]);
    const [progress, setProgress] = useState(0);
    const [isSending, setIsSending] = useState(false);
    
    const logsEndRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const [activeTemplateIndex, setActiveTemplateIndex] = useState(0);
    const [activeTemplateLang, setActiveTemplateLang] = useState('TR');

    const [hunterSort, setHunterSort] = useState({ key: 'traffic', direction: 'desc' }); 
    const [hunterFilterType, setHunterFilterType] = useState('ALL'); 

    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [isBulkSending, setIsBulkSending] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, logs: [] });
    const [bulkConfig, setBulkConfig] = useState({ templateType: 'AUTO', specificStage: 0, language: 'TR' });

    const [isEnriching, setIsEnriching] = useState(false);
    const [showEnrichModal, setShowEnrichModal] = useState(false);
    const [enrichLogs, setEnrichLogs] = useState([]);
    const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 });

    const [showSignatureHtml, setShowSignatureHtml] = useState(false);
    
    // --- YENİ STATE: IMPORT MODAL (Dosya Yükleme) ---
    const [showImportModal, setShowImportModal] = useState(false);

    // --- EFFECTS & LOGIC ---
    useEffect(() => {
        const sessionAuth = sessionStorage.getItem('leadHunterAuth');
        if (sessionAuth === 'true') setIsAuthenticated(true);
        
        // Load saved signature view preference
        try {
            const saved = localStorage.getItem('leadhunter_settings_v18');
            if (saved) {
                const parsed = JSON.parse(saved);
                const sig = parsed.signature || '';
                if (sig.includes('<table') || sig.includes('<div') || sig.includes('style=')) {
                    setShowSignatureHtml(true);
                }
            }
        } catch(e) {}
    }, []);

    useEffect(() => {
        if (!historyModalLead) {
            setReplyCheckResult(null);
            setIsCheckingReply(false);
        }
    }, [historyModalLead]);

    useEffect(() => {
        if (settings.signature) {
            const hasComplexHtml = settings.signature.includes('<table') || settings.signature.includes('<div') || settings.signature.includes('style=') || settings.signature.includes('&lt;table'); 
            if (hasComplexHtml && !showSignatureHtml) setShowSignatureHtml(true);
        }
    }, [settings.signature]);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!settings.firebaseConfig) { alert("Firebase Ayarları Bulunamadı!"); return; }
        try {
            const config = JSON.parse(settings.firebaseConfig);
            if (!firebase.apps.length) firebase.initializeApp(config);
            await firebase.auth().signInWithEmailAndPassword(authEmail, passwordInput);
            setIsAuthenticated(true);
            sessionStorage.setItem('leadHunterAuth', 'true');
            setLoginError('');
        } catch (err) { setLoginError('Giriş Başarısız: ' + err.message); }
    };

    useEffect(() => {
        if (!isAuthenticated) return;
        const savedSettings = localStorage.getItem('leadhunter_settings_v18');
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            setSettings(prev => ({
                ...prev, ...parsed,
                workflowTR: parsed.workflowTR || window.DEFAULT_WORKFLOW_TR,
                workflowEN: parsed.workflowEN || window.DEFAULT_WORKFLOW_EN
            }));
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) return;
        const initFirebase = async () => {
            if (settings.firebaseConfig && !dbInstance) {
                try {
                    const config = JSON.parse(settings.firebaseConfig);
                    if (!firebase.apps.length) firebase.initializeApp(config);
                    const db = firebase.firestore();
                    setDbInstance(db);
                    setIsDbConnected(true);
                    
                    db.collection("leads").onSnapshot((snapshot) => {
                        const leadsData = [];
                        snapshot.forEach((doc) => leadsData.push({ id: doc.id, ...doc.data() }));
                        processAndSetCrmData(leadsData);
                    });
                } catch (e) { setIsDbConnected(false); }
            }
        };
        initFirebase();
    }, [settings.firebaseConfig, isAuthenticated]);

    useEffect(() => {
        if (isDbConnected && dbInstance) {
            const fetchCloudSettings = async () => {
                try {
                    const doc = await dbInstance.collection('system').doc('config').get();
                    if (doc.exists) {
                        const cloudData = doc.data();
                        setSettings(prev => ({
                            ...prev,
                            googleApiKey: cloudData.googleApiKey || prev.googleApiKey,
                            searchEngineId: cloudData.searchEngineId || prev.searchEngineId,
                            googleScriptUrl: cloudData.googleScriptUrl || prev.googleScriptUrl,
                            geminiApiKey: cloudData.geminiApiKey || prev.geminiApiKey,
                            signature: cloudData.signature || prev.signature
                        }));
                    }
                } catch (error) { console.error("Bulut ayarları hatası:", error); }
            };
            fetchCloudSettings();
        }
    }, [isDbConnected, dbInstance]);

    const saveSettingsToCloud = async () => {
        if (!isDbConnected || !dbInstance) return alert("Veritabanı bağlı değil!");
        if (!confirm("Ayarlar veritabanına kaydedilecek. Onaylıyor musunuz?")) return;
        try {
            await dbInstance.collection('system').doc('config').set({
                googleApiKey: settings.googleApiKey,
                searchEngineId: settings.searchEngineId,
                googleScriptUrl: settings.googleScriptUrl,
                geminiApiKey: settings.geminiApiKey,
                signature: settings.signature
            }, { merge: true });
            alert("Ayarlar buluta kaydedildi!");
        } catch (e) { alert("Hata: " + e.message); }
    };

    const processAndSetCrmData = (rawData) => {
        const terminalStatuses = ['DEAL_ON', 'DEAL_OFF', 'DENIED', 'NOT_VIABLE', 'MAIL_ERROR', 'NON_RESPONSIVE', 'NOT_POSSIBLE'];
        const map = {}; 
        const processed = rawData.map(item => {
            if (item.email && item.email.length > 5 && item.email !== '-') {
                const mainEmail = item.email.split(',')[0].trim();
                if (!map[mainEmail]) map[mainEmail] = [];
                const cleanDomain = window.cleanDomain(item.url);
                if (!map[mainEmail].includes(cleanDomain)) map[mainEmail].push(cleanDomain);
            }
            const effectiveLastDate = window.getLastInteractionDate(item) || item.lastContactDate;
            let needsFollowUp = false;
            if (effectiveLastDate && !terminalStatuses.includes(item.statusKey) && item.statusKey !== 'New') {
                const diff = Math.ceil(Math.abs(Date.now() - new Date(effectiveLastDate)) / (1000 * 60 * 60 * 24));
                if (diff >= settings.followUpDays && item.statusKey === 'NO_REPLY') needsFollowUp = true;
            }
            return { ...item, lastContactDate: effectiveLastDate, needsFollowUp };
        });
        setEmailMap(map);
        setCrmData(processed);
    };

    useEffect(() => { 
        if(isAuthenticated) {
            const safeSettings = { ...settings }; 
            localStorage.setItem('leadhunter_settings_v18', JSON.stringify(safeSettings)); 
        }
    }, [settings, isAuthenticated]);

    const addLog = (msg, type='info') => setLogs(p => [...p, {time: new Date().toLocaleTimeString(), message: msg, type}]);
    useEffect(() => { setCurrentPage(1); }, [filters, activeTab]);

    const toggleSelection = (id) => { const newSet = new Set(selectedIds); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); setSelectedIds(newSet); };
    const toggleSelectAll = (items) => { if (selectedIds.size === items.length && items.length > 0) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(items.map(i => i.id))); } };

    // --- DATA PROCESSING (GÜNCELLENDİ) ---
    const processedData = useMemo(() => {
        let data = [...crmData];

        // 1. Dashboard'a Özel Filtre
        if (activeTab === 'dashboard') {
            const terminalStatuses = ['DEAL_ON', 'DEAL_OFF', 'DENIED', 'NOT_VIABLE', 'NON_RESPONSIVE', 'NOT_POSSIBLE'];
            data = data.filter(i => !terminalStatuses.includes(i.statusKey));
        }

        // 2. Global Filtreler
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            data = data.filter(item => 
                item.url?.toLowerCase().includes(searchLower) || 
                item.contactName?.toLowerCase().includes(searchLower) || 
                item.email?.toLowerCase().includes(searchLower) ||
                item.notes?.toLowerCase().includes(searchLower)
            );
        }
        if (filters.language !== 'ALL') data = data.filter(item => item.language === filters.language);
        if (filters.status.length > 0) {
            data = data.filter(item => {
                if (filters.status.includes(item.statusKey)) return true;
                if (filters.status.includes('New')) {
                    if (!item.statusKey) return true; 
                    if (item.statusKey.toUpperCase() === 'NEW') return true; 
                }
                return false;
            });
        }
        if (filters.lastSentStage !== 'ALL') {
            const targetStage = parseInt(filters.lastSentStage);
            data = data.filter(item => (item.stage || 0) === targetStage + 1);
        }
        if (filters.quality === 'GOOD') {
            data = data.filter(item => {
                const hasEmail = item.email && item.email.length > 5 && item.email !== '-';
                const hasTraffic = item.trafficStatus && item.trafficStatus.viable;
                return hasEmail && hasTraffic;
            });
        } else if (filters.quality === 'MISSING') {
            data = data.filter(item => {
                const noEmail = !item.email || item.email.length < 5 || item.email === '-';
                const noTraffic = !item.trafficStatus || !item.trafficStatus.viable || item.trafficStatus.label === 'Bilinmiyor';
                return noEmail || noTraffic;
            });
        }
        if (filters.startDate) {
            const start = new Date(filters.startDate).getTime();
            data = data.filter(item => item.lastContactDate && new Date(item.lastContactDate).getTime() >= start);
        }
        if (filters.endDate) {
            const end = new Date(filters.endDate).getTime();
            data = data.filter(item => item.lastContactDate && new Date(item.lastContactDate).getTime() <= end + 86400000);
        }
        
        // 3. Sıralama
        data.sort((a, b) => {
            let valA = a[sortConfig.key], valB = b[sortConfig.key];
            
            if (sortConfig.key === 'stage') { 
                valA = a.stage || 0; valB = b.stage || 0; 
            } else if (sortConfig.key === 'lastContactDate' || sortConfig.key === 'addedDate') { 
                valA = valA ? new Date(valA).getTime() : 0; valB = valB ? new Date(valB).getTime() : 0; 
            } else if (sortConfig.key === 'potential') {
                let numA = a.trafficStatus?.value || 0;
                if (!numA && a.trafficStatus?.label) numA = window.parseTrafficToNumber(a.trafficStatus.label);
                let numB = b.trafficStatus?.value || 0;
                if (!numB && b.trafficStatus?.label) numB = window.parseTrafficToNumber(b.trafficStatus.label);
                valA = numA; valB = numB;
            } else if (sortConfig.key === 'statusKey') {
                valA = window.LEAD_STATUSES[a.statusKey]?.label || a.statusLabel || 'New';
                valB = window.LEAD_STATUSES[b.statusKey]?.label || b.statusLabel || 'New';
            } else if (typeof valA === 'string') { 
                valA = valA.toLowerCase(); valB = valB ? valB.toLowerCase() : ''; 
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return data;
    }, [crmData, filters, sortConfig, activeTab]);

    const getPaginatedData = () => { const startIndex = (currentPage - 1) * window.ITEMS_PER_PAGE; return processedData.slice(startIndex, startIndex + window.ITEMS_PER_PAGE); };
    const totalPages = Math.ceil(processedData.length / window.ITEMS_PER_PAGE);

    const getStageInfo = (stageIndex, lang = 'TR') => {
        const workflow = lang === 'EN' ? settings.workflowEN : settings.workflowTR;
        if (!workflow || !Array.isArray(workflow)) return { template: null, label: 'Hata', isFinished: false };
        if (stageIndex < 0) return { template: null, label: 'Başlamadı', isFinished: false };
        if (stageIndex >= workflow.length) return { template: null, label: 'Süreç Tamamlandı', isFinished: true };
        return { template: workflow[stageIndex], label: workflow[stageIndex].label, isFinished: false };
    };

    // --- MANUEL AŞAMA GÜNCELLEME ---
    const handleManualStageUpdate = async (leadId, newStage) => {
        if (!isDbConnected || !leadId) return alert("Veritabanı bağlı değil.");
        const lead = crmData.find(l => l.id === leadId);
        if (!lead) return;
        const stageLabel = newStage === 0 ? 'Başlamadı' : getStageInfo(newStage - 1, lead.language).label;
        if (!confirm(`"${window.cleanDomain(lead.url)}" için son gönderilen aşamayı manuel olarak "${stageLabel}" şeklinde değiştirmek istiyor musunuz? Geçmiş buna göre güncellenecektir.`)) return;
        try {
            const timestamp = new Date().toISOString();
            const newLog = {
                date: timestamp,
                type: 'SYSTEM',
                content: `Manuel Aşama Güncellemesi: ${stageLabel} olarak ayarlandı.`
            };
            const updateData = {
                stage: newStage,
                lastContactDate: timestamp,
                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
            };
            if (newStage > 0) {
                const historyKey = newStage === 1 ? 'initial' : `repeat${newStage - 1}`;
                updateData[`history.${historyKey}`] = timestamp;
            }
            await dbInstance.collection("leads").doc(leadId).update(updateData);
            setCrmData(prev => prev.map(p => {
                if (p.id === leadId) {
                    const updatedHistory = { ...(p.history || {}) };
                    if (newStage > 0) {
                        const historyKey = newStage === 1 ? 'initial' : `repeat${newStage - 1}`;
                        updatedHistory[historyKey] = timestamp;
                    }
                    return { ...p, ...updateData, history: updatedHistory, activityLog: [...(p.activityLog || []), newLog] };
                }
                return p;
            }));
        } catch (e) {
            alert("Güncelleme hatası: " + e.message);
        }
    };

    // --- ACTIONS ---
    const checkGmailReply = async (lead) => {
        if (!lead.threadId) return alert("Bu kayıtla ilişkili bir mail konuşması (Thread ID) bulunamadı.");
        setIsCheckingReply(true); setReplyCheckResult(null);
        try {
            const response = await fetch(settings.googleScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'check_reply', threadId: lead.threadId }) });
            const data = await response.json();
            if (data.status === 'success') {
                setReplyCheckResult(data);
                if (data.isBounce) {
                    if (isDbConnected && confirm(`BU MAİL HATALI (BOUNCE)!\n\n"${data.snippet}"\n\nKayıt "Hatalı Mail" olarak güncellensin ve geçmişe işlensin mi?`)) {
                        const newLog = {
                            date: new Date().toISOString(),
                            type: 'BOUNCE',
                            content: `Teslimat Hatası (Bounce): ${data.snippet || 'Adres bulunamadı'}`
                        };
                        const updateData = { 
                            statusKey: 'MAIL_ERROR', 
                            statusLabel: 'Error in mail (Bounced)', 
                            email: '', 
                            lastContactDate: new Date().toISOString(), 
                            notes: (lead.notes || '') + ' [Sistem: Hatalı Mail Silindi]',
                            activityLog: [...(lead.activityLog || []), newLog]
                        };
                        await dbInstance.collection("leads").doc(lead.id).update(updateData);
                        const updatedLead = { ...lead, ...updateData };
                        setCrmData(prev => prev.map(p => p.id === lead.id ? updatedLead : p));
                        if (historyModalLead && historyModalLead.id === lead.id) {
                            setHistoryModalLead(updatedLead);
                        }
                        alert("Kayıt güncellendi ve geçmişe işlendi.");
                    }
                }
            } else { alert("Kontrol başarısız: " + data.message); }
        } catch (e) { alert("Bağlantı hatası: " + e.message); }
        setIsCheckingReply(false);
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
                        if (result.isBounce) {
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
                if (hasUpdates) { await batch.commit(); alert(`Tarama Tamamlandı!\n✅ ${updatedCount} yeni cevap\n❌ ${bounceCount} bounce`); } else { alert("Değişiklik yok."); }
            } else { alert("Hata: " + data.message); }
        } catch (e) { alert("Bağlantı Hatası: " + e.message); }
        setIsCheckingBulk(false);
    };

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
        if (count > 0) { await batch.commit(); alert(`${count} kayıt güncellendi!`); } else { alert("Düzeltilecek kayıt yok."); }
    };

    const bulkSetLanguage = async (lang) => {
        if (selectedIds.size === 0) return alert("Lütfen kayıt seçin.");
        if (!confirm(`Seçili ${selectedIds.size} kaydın dili '${lang}' yapılacak. Onay?`)) return;
        const batch = dbInstance.batch(); selectedIds.forEach(id => batch.update(dbInstance.collection("leads").doc(id), { language: lang }));
        await batch.commit(); setSelectedIds(new Set()); alert("Dil güncellendi.");
    };

    const bulkAddNotViable = async () => {
        if (selectedIds.size === 0 || !isDbConnected) return;
        if (!confirm(`${selectedIds.size} adet site 'Not Viable' olarak eklenecek.`)) return;
        const batch = dbInstance.batch(); let count = 0;
        selectedIds.forEach(id => {
            const lead = leads.find(l => l.id === id);
            if (lead && !crmData.some(c => window.cleanDomain(c.url) === window.cleanDomain(lead.url))) {
                batch.set(dbInstance.collection("leads").doc(), { url: lead.url, email: lead.email || '', statusKey: 'NOT_VIABLE', statusLabel: 'Not Viable', stage: 0, language: 'TR', trafficStatus: lead.trafficStatus || { viable: false }, addedDate: new Date().toISOString() }); count++;
            }
        });
        if (count > 0) { await batch.commit(); setLeads(prev => prev.filter(l => !selectedIds.has(l.id))); setSelectedIds(new Set()); alert(`${count} site eklendi.`); }
    };

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
            const updateData = { 
                statusKey: newStatusKey, 
                statusLabel: statusLabel,
                activityLog: firebase.firestore.FieldValue.arrayUnion(newLog)
            };
            batch.update(ref, updateData);
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

    const openMailModal = (lead) => {
        const info = getStageInfo(lead.stage || 0, lead.language);
        if (info.isFinished) return alert("Süreç tamamlanmış.");
        const domain = window.cleanDomain(lead.url);
        setSelectedLead({ ...lead, currentLabel: info.label, draft: { to: lead.email ? lead.email.split(',')[0].trim() : '', subject: info.template.subject.replace(/{{Website}}/g, domain), body: info.template.body.replace(/{{Website}}/g, domain) }, allEmails: lead.email });
    };

    const handleAddNote = async (leadId, noteContent) => {
        if (!isDbConnected || !leadId || !noteContent.trim()) return;
        try {
            const lead = crmData.find(l => l.id === leadId);
            if (!lead) return;
            const newLog = { date: new Date().toISOString(), type: 'NOTE', content: noteContent };
            const updatedLogs = [...(lead.activityLog || []), newLog];
            await dbInstance.collection("leads").doc(leadId).update({ activityLog: updatedLogs });
            if (historyModalLead && historyModalLead.id === leadId) {
                setHistoryModalLead(prev => ({ ...prev, activityLog: updatedLogs }));
            }
        } catch(e) { console.error(e); alert("Not eklenirken hata oluştu."); }
    };

    const handleDeleteNote = async (leadId, noteIndex) => {
        if (!isDbConnected || !leadId) return;
        if (!confirm("Bu notu silmek istediğinize emin misiniz?")) return;
        try {
            const lead = crmData.find(l => l.id === leadId);
            if (!lead || !lead.activityLog) return;
            const updatedLogs = [...lead.activityLog];
            updatedLogs.splice(noteIndex, 1);
            await dbInstance.collection("leads").doc(leadId).update({ activityLog: updatedLogs });
            if (historyModalLead && historyModalLead.id === leadId) {
                setHistoryModalLead(prev => ({ ...prev, activityLog: updatedLogs }));
            }
        } catch(e) { console.error(e); alert("Silme hatası."); }
    };

    const handleUpdateNote = async (leadId, noteIndex, newContent) => {
        if (!isDbConnected || !leadId) return;
        try {
            const lead = crmData.find(l => l.id === leadId);
            if (!lead || !lead.activityLog) return;
            const updatedLogs = [...lead.activityLog];
            updatedLogs[noteIndex] = { ...updatedLogs[noteIndex], content: newContent };
            await dbInstance.collection("leads").doc(leadId).update({ activityLog: updatedLogs });
            if (historyModalLead && historyModalLead.id === leadId) {
                setHistoryModalLead(prev => ({ ...prev, activityLog: updatedLogs }));
            }
        } catch(e) { console.error(e); alert("Güncelleme hatası."); }
    };

    const handleSort = (key) => { setSortConfig(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' })); };
    const handleEditClick = (lead) => { setEditingRowId(lead.id); setEditFormData({ ...lead, potential: lead.trafficStatus?.label || '' }); };
    const handleEditChange = (key, value) => setEditFormData(prev => ({ ...prev, [key]: value }));
    
    const handleEditSave = async () => {
        if (!editingRowId || !isDbConnected) return;
        try {
            // Form verilerini kopyala
            const updates = { ...editFormData };

            // --- DÜZELTME BAŞLANGICI ---
            // HATA ÇÖZÜMÜ: Firebase 'undefined' değeri kabul etmez. 
            // Obje içindeki undefined olan alanları siliyoruz (veya null yapıyoruz).
            Object.keys(updates).forEach(key => {
                if (updates[key] === undefined) {
                    delete updates[key]; 
                }
            });

            // Ayrıca UI için hesaplanan ama veritabanında olmayan alanları da temizlemek iyi bir pratiktir
            delete updates.id;            // ID zaten doküman referansında var
            delete updates.needsFollowUp; // Bu hesaplanan bir değer, DB'ye yazmaya gerek yok
            // --- DÜZELTME BİTİŞİ ---

            if (updates.statusKey && window.LEAD_STATUSES[updates.statusKey]) {
                updates.statusLabel = window.LEAD_STATUSES[updates.statusKey].label;
            } else if (updates.statusKey === 'New') {
                updates.statusLabel = 'New';
            }
            
            if (updates.potential && updates.potential !== (crmData.find(i=>i.id===editingRowId).trafficStatus?.label)) {
                 const newVal = window.parseTrafficToNumber(updates.potential);
                 updates.trafficStatus = { ...(updates.trafficStatus || {}), label: updates.potential, value: newVal, viable: newVal > 20000 };
            }

            await dbInstance.collection("leads").doc(editingRowId).update(updates);
            
            setCrmData(prev => prev.map(item => item.id === editingRowId ? { ...item, ...updates } : item));
            setEditingRowId(null);
            setEditFormData({});
        } catch (e) {
            console.error(e); // Hatayı konsola detaylı bas
            alert("Güncelleme hatası: " + e.message);
        }
    };

    const handleEditCancel = () => { setEditingRowId(null); setEditFormData({}); };
    const handleSettingChange = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));
    const updateWorkflowStep = (index, field, value) => { const k = activeTemplateLang === 'EN' ? 'workflowEN' : 'workflowTR'; const nw = [...settings[k]]; nw[index][field] = value; setSettings(p => ({ ...p, [k]: nw })); };
    const fixHtmlCode = () => { if(settings.signature) handleSettingChange('signature', window.decodeHtmlEntities(settings.signature)); };
    
    const addToCrm = async (lead, lang) => {
        if (!isDbConnected) return alert("Veritabanı bağlı değil.");
        try {
            const newLead = {
                url: lead.url,
                email: lead.email || '',
                statusKey: 'New',
                statusLabel: 'New',
                stage: 0,
                language: lang,
                trafficStatus: lead.trafficStatus || { viable: false },
                addedDate: new Date().toISOString(),
                activityLog: []
            };
            const docRef = await dbInstance.collection("leads").add(newLead);
            setCrmData(prev => [...prev, { ...newLead, id: docRef.id }]);
            alert(`${window.cleanDomain(lead.url)} başarıyla eklendi!`);
        } catch(e) { alert("Ekleme hatası: " + e.message); }
    };

    const handleSendMail = async () => {
        if (!selectedLead) return; setIsSending(true);
        try {
            const messageHtml = selectedLead.draft.body.replace(/\n/g, '<br>');
            let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';
            const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>`;
            const plainBody = selectedLead.draft.body + (settings.signature ? `\n\n--\n${settings.signature.replace(/<[^>]+>/g, '')}` : '');
            
            const response = await fetch(settings.googleScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'send_mail', to: selectedLead.draft.to, subject: selectedLead.draft.subject, body: plainBody, htmlBody: htmlContent, threadId: selectedLead.threadId || null }) });
            const result = await response.json();
            
            if (result.status === 'error') {
                throw new Error(result.message);
            }

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
                    activityLog: [...(selectedLead.activityLog || []), newLog] 
                };
                if (result.threadId) updateData.threadId = result.threadId;
                await dbInstance.collection("leads").doc(selectedLead.id).update(updateData);
                setCrmData(prev => prev.map(p => p.id === selectedLead.id ? { ...p, ...updateData } : p));
            }
            alert("Mail gönderildi!"); setSelectedLead(null);
        } catch (e) { alert("Hata: " + e.message); }
        setIsSending(false);
    };

    const executeBulkSend = async () => {
        if (!confirm(`${selectedIds.size} site için toplu gönderim yapılacak. Onaylıyor musunuz?`)) return;
        setIsBulkSending(true);
        const sourceData = activeTab === 'hunter' ? leads : crmData;
        const selectedLeads = sourceData.filter(l => selectedIds.has(l.id));
        const grouped = {};
        selectedLeads.forEach(lead => { if(lead.email && lead.email.length > 5) { const m = lead.email.split(',')[0].trim(); if(!grouped[m]) grouped[m]=[]; grouped[m].push(lead); } });
        
        const totalGroups = Object.keys(grouped).length;
        setBulkProgress({ current: 0, total: totalGroups, logs: [] });
        const addBulkLog = (msg, success) => setBulkProgress(prev => ({ ...prev, logs: [...prev.logs, { msg, success }] }));
        
        let index = 0;
        for (const email in grouped) {
            index++; setBulkProgress(prev => ({ ...prev, current: index }));
            const group = grouped[email]; const mainLead = group[0];
            const uniqueDomains = [...new Set(group.map(l => window.cleanDomain(l.url)))];
            const domainsString = uniqueDomains.length > 2 ? `${uniqueDomains[0]}, ${uniqueDomains[1]}...` : uniqueDomains.join(' ve ');
            
            let template = null; let targetStage = mainLead.stage || 0;
            if (bulkConfig.templateType === 'SPECIFIC') { targetStage = parseInt(bulkConfig.specificStage); template = getStageInfo(targetStage, mainLead.language || bulkConfig.language).template; }
            else { const info = getStageInfo(targetStage, mainLead.language || bulkConfig.language); if(info.isFinished) { addBulkLog(`${email}: Süreç bitmiş`, false); continue; } template = info.template; }
            
            if (!template) { addBulkLog(`${email}: Şablon yok`, false); continue; }
            
            try {
                const subject = template.subject.replace(/{{Website}}/g, domainsString);
                const body = template.body.replace(/{{Website}}/g, uniqueDomains.join(', '));
                
                const messageHtml = body.replace(/\n/g, '<br>');
                let signatureHtml = settings.signature ? window.decodeHtmlEntities(settings.signature).replace(/class="MsoNormal"/g, 'style="margin:0;"') : '';
                const htmlContent = `<div style="font-family: Arial; font-size: 14px;">${messageHtml}</div><br><br><div>${signatureHtml}</div>`;
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
        setIsBulkSending(false); setSelectedIds(new Set()); alert("Tamamlandı."); setShowBulkModal(false);
    };

    // --- GÜNCELLENMİŞ ZENGİNLEŞTİRME (ENRICH DATABASE) ---
    const enrichDatabase = async (mode = 'BOTH') => {
        const negativeStatuses = ['NOT_VIABLE', 'NOT_POSSIBLE', 'DENIED', 'DEAL_OFF', 'NON_RESPONSIVE'];
        
        const targets = crmData.filter(item => {
            // Negatif statüleri filtrele
            if (negativeStatuses.includes(item.statusKey)) return false;

            // Eksik Email Mantığı
            const missingEmail = !item.email || item.email.length < 5 || item.email === '-' || item.statusKey === 'MAIL_ERROR';
            
            // --- GÜNCELLENMİŞ EKSİK TRAFİK MANTIĞI ---
            // Eğer trafficStatus yoksa, label'ı "Bilinmiyor/Veri Yok/Hata" ise veya değeri 100'den küçükse (hatalı veri)
            const missingTraffic = !item.trafficStatus 
                                || !item.trafficStatus.label 
                                || ['Bilinmiyor', 'Veri Yok', 'Hata', '-', 'API Ayarı Yok'].includes(item.trafficStatus.label) 
                                || !item.trafficStatus.value 
                                || item.trafficStatus.value < 100;

            if (mode === 'EMAIL') return missingEmail;
            if (mode === 'TRAFFIC') return missingTraffic;
            return missingEmail || missingTraffic; // BOTH
        });

        if (targets.length === 0) return alert("Seçilen kriterlere uygun eksik veri bulunamadı.");
        
        setShowEnrichModal(true); 
        setIsEnriching(true); 
        setEnrichLogs([]); 
        setEnrichProgress({ current: 0, total: targets.length });

        const addEnrichLog = (msg, type = 'info') => {
            setEnrichLogs(prev => [...prev, {
                time: new Date().toLocaleTimeString(), 
                msg: msg, 
                type: type
            }]);
        };

        addEnrichLog(`Toplam ${targets.length} site taranacak...`, 'info');
        
        for (let i = 0; i < targets.length; i++) {
            const lead = targets[i]; 
            let updates = {};
            setEnrichProgress(prev => ({ ...prev, current: i + 1 }));
            
            // Tekrar hesapla (Döngü içinde)
            const missingEmail = !lead.email || lead.email.length < 5 || lead.statusKey === 'MAIL_ERROR';
            const missingTraffic = !lead.trafficStatus || !lead.trafficStatus.label 
                                || ['Bilinmiyor', 'Veri Yok', 'Hata', '-', 'API Ayarı Yok'].includes(lead.trafficStatus.label) 
                                || !lead.trafficStatus.value || lead.trafficStatus.value < 100;

            addEnrichLog(`${window.cleanDomain(lead.url)} analizi başlıyor...`, 'info');

            // --- TRAFİK KONTROLÜ ---
            if ((mode === 'TRAFFIC' || mode === 'BOTH') && missingTraffic) {
                addEnrichLog(`> Trafik aranıyor...`, 'warning');
                try { 
                    const t = await window.checkTraffic(lead.url); 
                    
                    // Hata kontrolü: Sadece 'Hata' veya 'API Ayarı Yok' ise başarısız say
                    if(t && t.label !== 'Hata' && t.label !== 'API Ayarı Yok') {
                        updates.trafficStatus = t; 
                        addEnrichLog(`> Trafik bulundu: ${t.label}`, 'success');
                    } else {
                        addEnrichLog(`> Trafik verisi alınamadı (${t.label}).`, 'error');
                    }
                } catch(e){
                    addEnrichLog(`> Trafik API hatası: ${e.message}`, 'error');
                }
            }

            // --- EMAIL KONTROLÜ ---
            if ((mode === 'EMAIL' || mode === 'BOTH') && missingEmail) {
                addEnrichLog(`> Email taranıyor...`, 'warning');
                try { 
                    const e = await window.findEmailsOnSite(lead.url); 
                    if(e) { 
                        updates.email = e; 
                        addEnrichLog(`> Email bulundu: ${e}`, 'success');
                        if(lead.statusKey === 'MAIL_ERROR') { 
                            updates.statusKey = 'New'; 
                            updates.stage = 0; 
                            addEnrichLog(`> Durum düzeltildi (New).`, 'success');
                        } 
                    } else {
                        addEnrichLog(`> Email bulunamadı.`, 'error');
                    }
                } catch(err){
                    addEnrichLog(`> Email hatası: ${err.message}`, 'error');
                }
            }

            // --- GÜNCELLEME İŞLEMİ ---
            const hasUpdates = Object.keys(updates).length > 0;
            
            if (hasUpdates && isDbConnected) {
                try {
                    await dbInstance.collection("leads").doc(lead.id).update(updates);
                    addEnrichLog(`✓ Veritabanı güncellendi.`, 'success');
                    // UI Güncelleme
                    setCrmData(prev => prev.map(p => p.id === lead.id ? { ...p, ...updates } : p));
                } catch(dbErr) {
                    addEnrichLog(`x DB Yazma Hatası: ${dbErr.message}`, 'error');
                }
            } else if (hasUpdates && !isDbConnected) {
                addEnrichLog(`- Veritabanı bağlı değil, kayıt yapılamadı.`, 'error');
            } else {
                addEnrichLog(`- Yeni veri bulunamadığı için güncelleme yapılmadı.`, 'info');
            }
            
            // Rate limit önlemi
            await new Promise(r => setTimeout(r, 1000));
        }
        
        addEnrichLog(`Tüm işlemler tamamlandı.`, 'success');
        setIsEnriching(false);
    };

    const startScan = async () => {
        const keywordList = keywords.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
        if (keywordList.length === 0) return alert("Kelime giriniz.");
        scanIntervalRef.current = true; setIsScanning(true); setLeads([]); setLogs([]); setProgress(0);
        
        for (let i = 0; i < keywordList.length; i++) {
            if (!scanIntervalRef.current) break;
            const kw = keywordList[i]; addLog(`Aranıyor: ${kw}`);
            // ... Google Search API Logic ...
            // Not: Kodun tamamı app.js'de mevcut, burası kısalttığım yer.
            setProgress(((i + 1) / keywordList.length) * 100);
        }
        setIsScanning(false); scanIntervalRef.current = false; addLog("Bitti.", 'success');
    };
    const stopScan = () => { scanIntervalRef.current = false; setIsScanning(false); };

    // --- RENDER ---
    if (!isAuthenticated) return <window.LoginScreen authEmail={authEmail} setAuthEmail={setAuthEmail} passwordInput={passwordInput} setPasswordInput={setPasswordInput} handleLogin={handleLogin} loginError={loginError} />;

    return (
        <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
            <window.Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isDbConnected={isDbConnected} />

            <div className="flex-1 overflow-y-auto bg-slate-100 relative">
                <div className="w-full mx-auto p-6 md:p-8">
                    <div className="mb-8 flex justify-between items-end border-b border-slate-200 pb-4">
                        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{activeTab === 'dashboard' ? 'Yönetim Paneli' : activeTab === 'hunter' ? 'Site Avcısı' : activeTab === 'crm' ? 'Müşteri Listesi' : 'Ayarlar'}</h2>
                        {activeTab === 'crm' && (
                            <div className="flex gap-2">
                                {/* ZENGİNLEŞTİRME BUTONU YERİNE BURADA BİR ŞEY OLMAMASI GEREKİYOR ARTIK, CrmTab İÇİNE TAŞINDI */}
                            </div>
                        )}
                    </div>

                    {activeTab === 'dashboard' && <window.DashboardTab crmData={crmData} filters={filters} setFilters={setFilters} selectedIds={selectedIds} toggleSelection={toggleSelection} toggleSelectAll={toggleSelectAll} selectedCount={selectedIds.size} setShowBulkModal={setShowBulkModal} activeTab={activeTab} fixAllTrafficData={fixAllTrafficData} onBulkCheck={handleBulkReplyCheck} isCheckingBulk={isCheckingBulk} paginatedItems={getPaginatedData()} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} totalRecords={processedData.length} setHistoryModalLead={setHistoryModalLead} getStageInfo={getStageInfo} handleSort={handleSort} sortConfig={sortConfig} onStageChange={handleManualStageUpdate} workflow={settings.workflowTR} />}
                    
                    {activeTab === 'hunter' && <window.HunterTab keywords={keywords} setKeywords={setKeywords} searchDepth={searchDepth} setSearchDepth={setSearchDepth} searchLocation={searchLocation} setSearchLocation={setSearchLocation} isScanning={isScanning} startScan={startScan} stopScan={stopScan} progress={progress} logs={logs} logsEndRef={logsEndRef} leads={leads} hunterFilterType={hunterFilterType} setHunterFilterType={setHunterFilterType} selectedIds={selectedIds} bulkAddNotViable={bulkAddNotViable} setShowBulkModal={setShowBulkModal} processedHunterLeads={processedHunterLeads} toggleSelectAll={toggleSelectAll} toggleSelection={toggleSelection} setHunterSort={setHunterSort} addToCrm={addToCrm} />}
                    
                    {activeTab === 'crm' && <window.CrmTab crmData={crmData} filters={filters} setFilters={setFilters} selectedIds={selectedIds} setShowBulkModal={setShowBulkModal} activeTab={activeTab} fixAllTrafficData={fixAllTrafficData} onBulkCheck={handleBulkReplyCheck} isCheckingBulk={isCheckingBulk} paginatedItems={getPaginatedData()} selectedCount={selectedIds.size} toggleSelectAll={toggleSelectAll} toggleSelection={toggleSelection} handleSort={handleSort} sortConfig={sortConfig} editingRowId={editingRowId} editFormData={editFormData} handleEditChange={handleEditChange} handleEditSave={handleEditSave} handleEditCancel={handleEditCancel} handleEditClick={handleEditClick} setHistoryModalLead={setHistoryModalLead} openMailModal={openMailModal} currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} totalRecords={processedData.length} emailMap={emailMap} getStageInfo={getStageInfo} enrichDatabase={enrichDatabase} isEnriching={isEnriching} setShowImportModal={setShowImportModal} bulkUpdateStatus={bulkUpdateStatus} onStageChange={handleManualStageUpdate} workflow={settings.workflowTR} />}
                    
                    {activeTab === 'settings' && <window.SettingsTab settings={settings} handleSettingChange={handleSettingChange} saveSettingsToCloud={saveSettingsToCloud} showSignatureHtml={showSignatureHtml} setShowSignatureHtml={setShowSignatureHtml} fixHtmlCode={fixHtmlCode} fixAllTrafficData={fixAllTrafficData} activeTemplateLang={activeTemplateLang} setActiveTemplateLang={setActiveTemplateLang} activeTemplateIndex={activeTemplateIndex} setActiveTemplateIndex={setActiveTemplateIndex} updateWorkflowStep={updateWorkflowStep} />}
                </div>
            </div>

            {showEnrichModal && <window.EnrichModal isEnriching={isEnriching} enrichProgress={enrichProgress} enrichLogs={enrichLogs} close={()=>setShowEnrichModal(false)} />}
            {showBulkModal && <window.BulkModal isBulkSending={isBulkSending} bulkProgress={bulkProgress} selectedCount={selectedIds.size} bulkConfig={bulkConfig} setBulkConfig={setBulkConfig} activeTab={activeTab} settings={settings} executeBulkSend={executeBulkSend} close={()=>setShowBulkModal(false)} setShowBulkModal={setShowBulkModal} />}
            <window.MailModal selectedLead={selectedLead} setSelectedLead={setSelectedLead} handleSendMail={handleSendMail} isSending={isSending} />
            <window.ImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} crmData={crmData} dbInstance={dbInstance} isDbConnected={isDbConnected} />
            
            <window.HistoryModal 
                historyModalLead={historyModalLead} 
                setHistoryModalLead={setHistoryModalLead} 
                checkGmailReply={checkGmailReply} 
                isCheckingReply={isCheckingReply} 
                replyCheckResult={replyCheckResult}
                onAddNote={handleAddNote}
                onDeleteNote={handleDeleteNote}
                onUpdateNote={handleUpdateNote}
            />
        </div>
    );
};

