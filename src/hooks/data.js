// LeadHunter_Data.js
// GÜNCELLEME: Mail Durum Filtresi (mailStatus) Eklendi.
// GÜNCELLEME 2: Sıralama mantığı (Generic Sort) iyileştirildi.

const { useState, useEffect, useMemo } = React;

window.useLeadHunterData = (dbInstance, settings, activeTab) => {
    // --- STATE ---
    const [crmData, setCrmData] = useState([]);
    const [emailMap, setEmailMap] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    
    // YENİ: Sayfalama limiti (Varsayılan 50)
    const [itemsPerPage, setItemsPerPage] = useState(50);
    
    const [sortConfig, setSortConfig] = useState({ key: 'lastContactDate', direction: 'desc' });
    
    // YENİ: 'mailStatus' filtresi eklendi
    const [filters, setFilters] = useState({ 
        search: '', language: 'ALL', status: [], lastSentStage: 'ALL', quality: 'ALL', 
        mailStatus: 'ALL', startDate: '', endDate: ''
    });
    const [selectedIds, setSelectedIds] = useState(new Set());

    // --- EFFECTS ---
    useEffect(() => {
        if (!dbInstance) return;
        const unsubscribe = dbInstance.collection("leads").onSnapshot((snapshot) => {
            const leadsData = [];
            snapshot.forEach((doc) => leadsData.push({ id: doc.id, ...doc.data() }));
            processAndSetCrmData(leadsData);
        });
        return () => unsubscribe();
    }, [dbInstance, settings.followUpDays]); 

    // Filtre, Tab veya Limit değişince sayfayı başa al
    useEffect(() => { setCurrentPage(1); }, [filters, activeTab, itemsPerPage]);

    // --- HELPERS ---
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

    const toggleSelection = (id) => { 
        const newSet = new Set(selectedIds); 
        if (newSet.has(id)) newSet.delete(id); 
        else newSet.add(id); 
        setSelectedIds(newSet); 
    };
    
    // AKILLI TOPLU SEÇİM (Smart Toggle)
    const toggleSelectAll = (pageItems) => { 
        const allPageSelected = pageItems.length > 0 && pageItems.every(item => selectedIds.has(item.id));
        if (allPageSelected) {
            setSelectedIds(new Set()); 
        } else { 
            const newSet = new Set(selectedIds);
            pageItems.forEach(item => newSet.add(item.id));
            setSelectedIds(newSet);
        } 
    };

    const selectAllFiltered = () => {
        const allIds = processedData.map(i => i.id);
        setSelectedIds(new Set(allIds));
    };
    
    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    const handleSort = (key) => { 
        setSortConfig(current => ({ 
            key, 
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' 
        })); 
    };

    // --- MEMOIZED DATA ---
    const processedData = useMemo(() => {
        let data = [...crmData];
        if (activeTab === 'dashboard') {
            const terminalStatuses = ['DEAL_ON', 'DEAL_OFF', 'DENIED', 'NOT_VIABLE', 'NON_RESPONSIVE', 'NOT_POSSIBLE', 'MAIL_ERROR'];
            data = data.filter(i => !terminalStatuses.includes(i.statusKey));
        }
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
            data = data.filter(item => item.email && item.email.length > 5 && item.email !== '-' && item.trafficStatus && item.trafficStatus.viable);
        } else if (filters.quality === 'MISSING') {
            data = data.filter(item => (!item.email || item.email.length < 5 || item.email === '-') || (!item.trafficStatus || !item.trafficStatus.viable));
        }
        
        // YENİ: MAIL DURUM FİLTRESİ (MAVİ/YEŞİL/KIRMIZI NOKTA FİLTRESİ)
        if (filters.mailStatus !== 'ALL') {
            const replyStatuses = ['ASKED_MORE', 'INTERESTED', 'IN_PROCESS', 'DEAL_ON', 'DEAL_OFF', 'DENIED', 'NOT_POSSIBLE'];
            data = data.filter(item => {
                const isReplied = replyStatuses.includes(item.statusKey);
                const isOpened = !!item.mailOpenedAt;

                if (filters.mailStatus === 'REPLIED') return isReplied; // Mavi
                if (filters.mailStatus === 'OPENED') return isOpened && !isReplied; // Yeşil (Okundu ama cevap yok)
                if (filters.mailStatus === 'UNOPENED') return !isOpened && !isReplied; // Kırmızı
                return true;
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
        
        data.sort((a, b) => {
            let valA = a[sortConfig.key], valB = b[sortConfig.key];
            if (sortConfig.key === 'stage') { valA = a.stage || 0; valB = b.stage || 0; } 
            else if (sortConfig.key === 'lastContactDate') { valA = valA ? new Date(valA).getTime() : 0; valB = valB ? new Date(valB).getTime() : 0; } 
            else if (sortConfig.key === 'potential') {
                let numA = a.trafficStatus?.value || (a.trafficStatus?.label ? window.parseTrafficToNumber(a.trafficStatus.label) : 0);
                let numB = b.trafficStatus?.value || (b.trafficStatus?.label ? window.parseTrafficToNumber(b.trafficStatus.label) : 0);
                valA = numA; valB = numB;
            } else if (sortConfig.key === 'statusKey') {
                valA = window.LEAD_STATUSES[a.statusKey]?.label || a.statusLabel || 'New';
                valB = window.LEAD_STATUSES[b.statusKey]?.label || b.statusLabel || 'New';
            } else { 
                // İsim, Email gibi genel metin alanlarının güvenli sıralanması (BOŞ VERİLERİ DE KAPSIYOR)
                valA = valA ? String(valA).toLowerCase() : ''; 
                valB = valB ? String(valB).toLowerCase() : ''; 
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return data;
    }, [crmData, filters, sortConfig, activeTab]);

    const getPaginatedData = () => { 
        const startIndex = (currentPage - 1) * itemsPerPage; 
        return processedData.slice(startIndex, startIndex + itemsPerPage); 
    };
    
    const totalPages = Math.ceil(processedData.length / itemsPerPage);

    return {
        crmData, setCrmData, emailMap,
        currentPage, setCurrentPage, 
        itemsPerPage, setItemsPerPage, 
        sortConfig, setSortConfig, filters, setFilters,
        selectedIds, setSelectedIds, processedData,
        getPaginatedData, totalPages,
        toggleSelection, toggleSelectAll, 
        selectAllFiltered, 
        clearSelection,
        handleSort, processAndSetCrmData
    };
};
