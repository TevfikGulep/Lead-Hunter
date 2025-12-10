// LeadHunter_Data.js
// Görev: Veritabanı Dinleme, Filtreleme, Sıralama, Sayfalama ve Seçim Yönetimi

const { useState, useEffect, useMemo } = React;

window.useLeadHunterData = (dbInstance, settings, activeTab) => {
    // --- STATE ---
    const [crmData, setCrmData] = useState([]);
    const [emailMap, setEmailMap] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState({ key: 'lastContactDate', direction: 'desc' });
    
    const [filters, setFilters] = useState({ 
        search: '', language: 'ALL', status: [], lastSentStage: 'ALL', quality: 'ALL', startDate: '', endDate: ''
    });

    const [selectedIds, setSelectedIds] = useState(new Set());

    // --- EFFECTS ---

    // 1. Veritabanını Dinle (Real-time Listener)
    useEffect(() => {
        if (!dbInstance) return;

        const unsubscribe = dbInstance.collection("leads").onSnapshot((snapshot) => {
            const leadsData = [];
            snapshot.forEach((doc) => leadsData.push({ id: doc.id, ...doc.data() }));
            processAndSetCrmData(leadsData);
        });

        // Cleanup function
        return () => unsubscribe();
    }, [dbInstance, settings.followUpDays]); 

    // 2. Filtre veya Tab değişince sayfayı başa al
    useEffect(() => { setCurrentPage(1); }, [filters, activeTab]);

    // --- HELPERS ---

    const processAndSetCrmData = (rawData) => {
        const terminalStatuses = ['DEAL_ON', 'DEAL_OFF', 'DENIED', 'NOT_VIABLE', 'MAIL_ERROR', 'NON_RESPONSIVE', 'NOT_POSSIBLE'];
        const map = {}; 
        const processed = rawData.map(item => {
            // Email Map oluşturma (Aynı mail'e sahip siteleri bulmak için)
            if (item.email && item.email.length > 5 && item.email !== '-') {
                const mainEmail = item.email.split(',')[0].trim();
                if (!map[mainEmail]) map[mainEmail] = [];
                const cleanDomain = window.cleanDomain(item.url);
                if (!map[mainEmail].includes(cleanDomain)) map[mainEmail].push(cleanDomain);
            }
            
            // Takip tarihi hesaplama
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

    const toggleSelection = (id) => { 
        const newSet = new Set(selectedIds); 
        if (newSet.has(id)) newSet.delete(id); 
        else newSet.add(id); 
        setSelectedIds(newSet); 
    };
    
    const toggleSelectAll = (items) => { 
        if (selectedIds.size === items.length && items.length > 0) { 
            setSelectedIds(new Set()); 
        } else { 
            setSelectedIds(new Set(items.map(i => i.id))); 
        } 
    };

    const handleSort = (key) => { 
        setSortConfig(current => ({ 
            key, 
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' 
        })); 
    };

    // --- MEMOIZED DATA (Filtreleme ve Sıralama Mantığı) ---
    const processedData = useMemo(() => {
        let data = [...crmData];

        // 1. Dashboard'a Özel Filtre (MAIL_ERROR DAHİL EDİLDİ)
        if (activeTab === 'dashboard') {
            const terminalStatuses = ['DEAL_ON', 'DEAL_OFF', 'DENIED', 'NOT_VIABLE', 'NON_RESPONSIVE', 'NOT_POSSIBLE', 'MAIL_ERROR'];
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

    const getPaginatedData = () => { 
        const startIndex = (currentPage - 1) * window.ITEMS_PER_PAGE; 
        return processedData.slice(startIndex, startIndex + window.ITEMS_PER_PAGE); 
    };
    
    const totalPages = Math.ceil(processedData.length / window.ITEMS_PER_PAGE);

    return {
        crmData, setCrmData,
        emailMap,
        currentPage, setCurrentPage,
        sortConfig, setSortConfig,
        filters, setFilters,
        selectedIds, setSelectedIds,
        processedData,
        getPaginatedData,
        totalPages,
        toggleSelection,
        toggleSelectAll,
        handleSort,
        processAndSetCrmData // Gerekirse dışarıdan çağrılabilmesi için
    };
};
