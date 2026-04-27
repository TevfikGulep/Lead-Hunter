// LeadHunter_Auth.js
// Görev: Kimlik Doğrulama, Ayarlar, Firebase Bağlantısı ve Genel Durum Yönetimi

const { useState, useEffect } = React;

window.useLeadHunterAuth = () => {
    // --- STATE: AUTH & SETTINGS ---
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authEmail, setAuthEmail] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [loginError, setLoginError] = useState('');
 
    const [activeTab, setActiveTab] = useState('dashboard');
    const [searchLocation, setSearchLocation] = useState('tr');

    // Varsayılan Config
    const defaultFirebaseConfig = (window.APP_CONFIG && window.APP_CONFIG.FIREBASE_CONFIG)
        ? JSON.stringify(window.APP_CONFIG.FIREBASE_CONFIG)
        : '';

    const [settings, setSettings] = useState({
        googleApiKey: '', searchEngineId: '',
        googleScriptUrl: '', signature: '', webhookUrl: '', followUpDays: 7,
        firebaseConfig: defaultFirebaseConfig,
        workflowTR: window.DEFAULT_WORKFLOW_TR,
        workflowEN: window.DEFAULT_WORKFLOW_EN,
        promotionTemplateTR: window.DEFAULT_PROMOTION_TEMPLATE_TR,
        promotionTemplateEN: window.DEFAULT_PROMOTION_TEMPLATE_EN,
        // Site Avcısı Otomasyon Ayarları
        ilceListesi: '',
        autoHunterEnabled: false,
        hunterTargetCount: 100,
        lastHunterIlceIndex: 0,
        lastHunterRunDate: null
    });

    const [dbInstance, setDbInstance] = useState(null);
    const [isDbConnected, setIsDbConnected] = useState(false);
    const [showSignatureHtml, setShowSignatureHtml] = useState(false);

    // --- STATE: TEMPLATES & WORKFLOW ---
    const [activeTemplateIndex, setActiveTemplateIndex] = useState(0);
    const [activeTemplateLang, setActiveTemplateLang] = useState('TR');

    // --- EFFECTS ---

    // 1. Oturum Kontrolü ve İmza Ayarı
    useEffect(() => {
        const sessionAuth = sessionStorage.getItem('leadHunterAuth');
        if (sessionAuth === 'true') setIsAuthenticated(true);

        try {
            const saved = localStorage.getItem('leadhunter_settings_v18');
            if (saved) {
                const parsed = JSON.parse(saved);
                const sig = parsed.signature || '';
                if (sig.includes('<table') || sig.includes('<div') || sig.includes('style=')) {
                    setShowSignatureHtml(true);
                }
            }
        } catch (e) { }
    }, []);

    // 2. İmza Değişikliği İzleme
    useEffect(() => {
        if (settings.signature) {
            const hasComplexHtml = settings.signature.includes('<table') || settings.signature.includes('<div') || settings.signature.includes('style=') || settings.signature.includes('&lt;table');
            if (hasComplexHtml && !showSignatureHtml) setShowSignatureHtml(true);
        }
    }, [settings.signature]);

    // 3. LocalStorage'dan Ayarları Yükle
    useEffect(() => {
        if (!isAuthenticated) return;
        const savedSettings = localStorage.getItem('leadhunter_settings_v18');
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            setSettings(prev => ({
                ...prev, ...parsed,
                workflowTR: parsed.workflowTR || window.DEFAULT_WORKFLOW_TR,
                workflowEN: parsed.workflowEN || window.DEFAULT_WORKFLOW_EN,
                promotionTemplateTR: parsed.promotionTemplateTR || window.DEFAULT_PROMOTION_TEMPLATE_TR,
                promotionTemplateEN: parsed.promotionTemplateEN || window.DEFAULT_PROMOTION_TEMPLATE_EN
            }));
        }
    }, [isAuthenticated]);

    // 4. Firebase Başlatma
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
                } catch (e) { setIsDbConnected(false); }
            }
        };
        initFirebase();
    }, [settings.firebaseConfig, isAuthenticated]);

    // 5. Cloud Ayarlarını Çekme
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
                            signature: cloudData.signature || prev.signature,
                            webhookUrl: cloudData.webhookUrl || prev.webhookUrl,
                            followUpDays: cloudData.followUpDays != null ? cloudData.followUpDays : prev.followUpDays,
                            // Mail şablonları (workflow + promosyon)
                            workflowTR: (Array.isArray(cloudData.workflowTR) && cloudData.workflowTR.length) ? cloudData.workflowTR : prev.workflowTR,
                            workflowEN: (Array.isArray(cloudData.workflowEN) && cloudData.workflowEN.length) ? cloudData.workflowEN : prev.workflowEN,
                            promotionTemplateTR: cloudData.promotionTemplateTR || prev.promotionTemplateTR,
                            promotionTemplateEN: cloudData.promotionTemplateEN || prev.promotionTemplateEN,
                            // Site Avcısı Otomasyon
                            ilceListesi: cloudData.ilceListesi || prev.ilceListesi,
                            autoHunterEnabled: cloudData.autoHunterEnabled || prev.autoHunterEnabled,
                            hunterTargetCount: cloudData.hunterTargetCount || prev.hunterTargetCount,
                            lastHunterIlceIndex: cloudData.lastHunterIlceIndex != null ? cloudData.lastHunterIlceIndex : prev.lastHunterIlceIndex,
                            lastHunterRunDate: cloudData.lastHunterRunDate !== undefined ? cloudData.lastHunterRunDate : prev.lastHunterRunDate
                        }));
                    }
                } catch (error) { console.error("Bulut ayarları hatası:", error); }
            };
            fetchCloudSettings();
        }
    }, [isDbConnected, dbInstance]);

    // 6. Ayarları LocalStorage'a Kaydet
    useEffect(() => {
        if (isAuthenticated) {
            const safeSettings = { ...settings };
            localStorage.setItem('leadhunter_settings_v18', JSON.stringify(safeSettings));
        }
    }, [settings, isAuthenticated]);


    // --- FUNCTIONS ---

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

    const saveSettingsToCloud = async (overrides = null) => {
        if (!isDbConnected || !dbInstance) return alert("Veritabanı bağlı değil!");
        if (!overrides && !confirm("Ayarlar veritabanına kaydedilecek. Onaylıyor musunuz?")) return;
        const data = overrides ? { ...settings, ...overrides } : settings;
        try {
            await dbInstance.collection('system').doc('config').set({
                googleApiKey: data.googleApiKey,
                searchEngineId: data.searchEngineId,
                googleScriptUrl: data.googleScriptUrl,
                signature: data.signature,
                webhookUrl: data.webhookUrl,
                followUpDays: data.followUpDays,
                // Mail şablonları (cron işleri buradan okur)
                workflowTR: data.workflowTR,
                workflowEN: data.workflowEN,
                promotionTemplateTR: data.promotionTemplateTR,
                promotionTemplateEN: data.promotionTemplateEN,
                // Site Avcısı Otomasyon
                ilceListesi: data.ilceListesi,
                autoHunterEnabled: data.autoHunterEnabled,
                hunterTargetCount: data.hunterTargetCount,
                lastHunterIlceIndex: data.lastHunterIlceIndex,
                lastHunterRunDate: data.lastHunterRunDate
            }, { merge: true });
            if (!overrides) alert("Ayarlar buluta kaydedildi!");
            return true;
        } catch (e) { alert("Hata: " + e.message); return false; }
    };

    const handleSettingChange = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

    const resetHunterProgress = async () => {
        if (!isDbConnected || !dbInstance) return alert("Veritabanı bağlı değil!");
        setSettings(prev => ({ ...prev, lastHunterIlceIndex: 0, lastHunterRunDate: null }));
        try {
            await dbInstance.collection('system').doc('config').update({
                lastHunterIlceIndex: 0,
                lastHunterRunDate: null
            });
        } catch (e) { alert("Sıfırlama hatası: " + e.message); }
    };

    const updateWorkflowStep = (index, field, value) => {
        const k = activeTemplateLang === 'EN' ? 'workflowEN' : 'workflowTR';
        const nw = [...settings[k]];
        nw[index][field] = value;
        setSettings(p => ({ ...p, [k]: nw }));
    };

    const fixHtmlCode = () => {
        if (settings.signature) handleSettingChange('signature', window.decodeHtmlEntities(settings.signature));
    };

    const updatePromotionTemplate = (field, value) => {
        const k = activeTemplateLang === 'EN' ? 'promotionTemplateEN' : 'promotionTemplateTR';
        setSettings(p => ({ ...p, [k]: { ...p[k], [field]: value } }));
    };

    return {
        isAuthenticated, setIsAuthenticated,
        authEmail, setAuthEmail,
        passwordInput, setPasswordInput,
        loginError,
        handleLogin,
        activeTab, setActiveTab,
        searchLocation, setSearchLocation,
        settings, setSettings,
        dbInstance, isDbConnected,
        saveSettingsToCloud, handleSettingChange, resetHunterProgress,
        showSignatureHtml, setShowSignatureHtml, fixHtmlCode,
        activeTemplateIndex, setActiveTemplateIndex,
        activeTemplateLang, setActiveTemplateLang,
        updateWorkflowStep,
        updatePromotionTemplate
    };
};
