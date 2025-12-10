// LeadHunter_Actions.js
// Görev: Satır Düzenleme, Notlar, Manuel Güncellemeler ve Tekil Aksiyonlar

const { useState } = React;

window.useLeadHunterActions = (dbInstance, isDbConnected, crmData, setCrmData, settings, setHistoryModalLead) => {
    // --- STATE ---
    const [editingRowId, setEditingRowId] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    
    const [replyCheckResult, setReplyCheckResult] = useState(null);
    const [isCheckingReply, setIsCheckingReply] = useState(false);

    // --- HELPERS ---
    const getStageInfo = (stageIndex, lang = 'TR') => {
        const workflow = lang === 'EN' ? settings.workflowEN : settings.workflowTR;
        if (!workflow || !Array.isArray(workflow)) return { template: null, label: 'Hata', isFinished: false };
        if (stageIndex < 0) return { template: null, label: 'Başlamadı', isFinished: false };
        if (stageIndex >= workflow.length) return { template: null, label: 'Süreç Tamamlandı', isFinished: true };
        return { template: workflow[stageIndex], label: workflow[stageIndex].label, isFinished: false };
    };

    // --- FUNCTIONS ---

    // 1. Manuel Aşama Güncelleme
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
            
            // Optimistic Update
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

    // 2. Gmail Cevap Kontrolü (Tekil)
    const checkGmailReply = async (lead) => {
        if (!lead.threadId) return alert("Bu kayıtla ilişkili bir mail konuşması (Thread ID) bulunamadı.");
        
        setIsCheckingReply(true); 
        setReplyCheckResult(null);
        
        try {
            const response = await fetch(settings.googleScriptUrl, { 
                method: 'POST', 
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
                body: JSON.stringify({ action: 'check_reply', threadId: lead.threadId }) 
            });
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
                        
                        if (setHistoryModalLead) setHistoryModalLead(updatedLead);
                        
                        alert("Kayıt güncellendi ve geçmişe işlendi.");
                    }
                }
            } else { 
                alert("Kontrol başarısız: " + data.message); 
            }
        } catch (e) { 
            alert("Bağlantı hatası: " + e.message); 
        }
        setIsCheckingReply(false);
    };

    // 3. Not İşlemleri
    const handleAddNote = async (leadId, noteContent) => {
        if (!isDbConnected || !leadId || !noteContent.trim()) return;
        try {
            const lead = crmData.find(l => l.id === leadId);
            if (!lead) return;
            const newLog = { date: new Date().toISOString(), type: 'NOTE', content: noteContent };
            const updatedLogs = [...(lead.activityLog || []), newLog];
            
            await dbInstance.collection("leads").doc(leadId).update({ activityLog: updatedLogs });
            
            if (setHistoryModalLead) {
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
            
            if (setHistoryModalLead) {
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
            
            if (setHistoryModalLead) {
                setHistoryModalLead(prev => ({ ...prev, activityLog: updatedLogs }));
            }
        } catch(e) { console.error(e); alert("Güncelleme hatası."); }
    };

    // 4. Satır Düzenleme (Inline Edit)
    const handleEditClick = (lead) => { 
        setEditingRowId(lead.id); 
        setEditFormData({ ...lead, potential: lead.trafficStatus?.label || '' }); 
    };
    
    const handleEditChange = (key, value) => setEditFormData(prev => ({ ...prev, [key]: value }));
    
    const handleEditCancel = () => { setEditingRowId(null); setEditFormData({}); };

    const handleEditSave = async () => {
        if (!editingRowId || !isDbConnected) return;
        try {
            const updates = { ...editFormData };
            
            // Firebase undefined kabul etmez, temizle
            Object.keys(updates).forEach(key => {
                if (updates[key] === undefined) delete updates[key];
            });
            delete updates.id;
            delete updates.needsFollowUp;

            // Status label güncelle
            if (updates.statusKey && window.LEAD_STATUSES[updates.statusKey]) {
                updates.statusLabel = window.LEAD_STATUSES[updates.statusKey].label;
            } else if (updates.statusKey === 'New') {
                updates.statusLabel = 'New';
            }
            
            // Trafik güncellemesi
            if (updates.potential && updates.potential !== (crmData.find(i=>i.id===editingRowId).trafficStatus?.label)) {
                 const newVal = window.parseTrafficToNumber(updates.potential);
                 updates.trafficStatus = { ...(updates.trafficStatus || {}), label: updates.potential, value: newVal, viable: newVal > 20000 };
            }

            await dbInstance.collection("leads").doc(editingRowId).update(updates);
            
            setCrmData(prev => prev.map(item => item.id === editingRowId ? { ...item, ...updates } : item));
            setEditingRowId(null);
            setEditFormData({});
        } catch (e) {
            console.error(e); 
            alert("Güncelleme hatası: " + e.message);
        }
    };

    // 5. CRM'e Ekleme (Hunter'dan)
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

    return {
        editingRowId, setEditingRowId,
        editFormData, setEditFormData,
        replyCheckResult, setReplyCheckResult,
        isCheckingReply, setIsCheckingReply,
        
        handleManualStageUpdate,
        checkGmailReply,
        
        handleAddNote, 
        handleDeleteNote, 
        handleUpdateNote,
        
        handleEditClick, 
        handleEditChange, 
        handleEditSave, 
        handleEditCancel,
        
        addToCrm,
        getStageInfo
    };
};
