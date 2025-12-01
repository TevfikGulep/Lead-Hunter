// FilterBar.js

// Bağımlılıkları tanımla
const StatusMultiSelect = window.StatusMultiSelect;

// --- COMPONENT: FILTER BAR ---
window.FilterBar = ({ filters, setFilters, selectedCount, setShowBulkModal, activeTab, fixAllTrafficData, onBulkCheck, isCheckingBulk, onBulkStatusChange }) => (
    <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border flex-1 min-w-[200px]">
            <window.Icon name="search" className="w-4 h-4 text-slate-400" />
            <input 
                type="text" 
                placeholder="Ara (Site, İsim, Email)..." 
                value={filters.search} 
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))} 
                className="bg-transparent outline-none text-sm w-full"
            />
        </div>
        <select value={filters.quality} onChange={(e) => setFilters(prev => ({ ...prev, quality: e.target.value }))} className={`px-3 py-2 rounded-lg border text-sm font-medium outline-none cursor-pointer ${filters.quality!=='ALL'?'bg-purple-50 text-purple-700 border-purple-200':'bg-slate-50 text-slate-600'}`}>
            <option value="ALL">Veri Durumu: Tümü</option>
            <option value="GOOD">✅ Sadece Tam Veriler</option>
            <option value="MISSING">⚠️ Eksik Veriler (Mail/Trafik Yok)</option>
        </select>
        <select value={filters.language} onChange={(e) => setFilters(prev => ({ ...prev, language: e.target.value }))} className="px-3 py-2 bg-slate-50 rounded-lg border text-sm text-slate-600 font-medium outline-none cursor-pointer"><option value="ALL">Tüm Diller</option><option value="TR">TR (Türkçe)</option><option value="EN">EN (English)</option></select>
        
        {/* StatusMultiSelect Bileşeni Kullanımı */}
        {StatusMultiSelect && (
            <StatusMultiSelect 
                selectedStatuses={filters.status} 
                onChange={(newStatuses) => setFilters(prev => ({ ...prev, status: newStatuses }))} 
            />
        )}

        <select value={filters.lastSentStage} onChange={(e) => setFilters(prev => ({ ...prev, lastSentStage: e.target.value }))} className="px-3 py-2 bg-slate-50 rounded-lg border text-sm text-slate-600 font-medium outline-none cursor-pointer"><option value="ALL">Son Gönderilen: Tümü</option><option value="-1">Henüz Gönderilmedi</option>{window.DEFAULT_WORKFLOW_TR.map((step, index) => (<option key={index} value={index}>{step.label}</option>))}</select>
        
        <div className="flex items-center gap-1 border rounded-lg px-2 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400">Tarih:</span>
            <input type="date" value={filters.startDate} onChange={(e) => setFilters(p => ({ ...p, startDate: e.target.value }))} className="bg-transparent text-xs p-1 outline-none text-slate-600"/>
            <span className="text-slate-300">-</span>
            <input type="date" value={filters.endDate} onChange={(e) => setFilters(p => ({ ...p, endDate: e.target.value }))} className="bg-transparent text-xs p-1 outline-none text-slate-600"/>
        </div>

        <button onClick={() => setFilters({ search: '', language: 'ALL', status: [], lastSentStage: 'ALL', quality: 'ALL', startDate: '', endDate: '' })} className="px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors">Temizle</button>
        
        {selectedCount > 0 && (
            <div className="ml-auto flex gap-2 animate-in fade-in items-center">
                {/* YENİ: TOPLU DURUM GÜNCELLEME MENÜSÜ */}
                <select 
                    onChange={(e) => { 
                        if(e.target.value) {
                            onBulkStatusChange(e.target.value); 
                            e.target.value = ''; // Seçimi sıfırla
                        }
                    }} 
                    className="bg-white text-slate-700 hover:bg-slate-50 px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 shadow-sm transition-colors outline-none cursor-pointer"
                >
                    <option value="">Durum Değiştir...</option>
                    {Object.keys(window.LEAD_STATUSES).map(key => (
                        <option key={key} value={key}>{window.LEAD_STATUSES[key].label}</option>
                    ))}
                </select>

                <button 
                    onClick={onBulkCheck} 
                    disabled={isCheckingBulk}
                    className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-colors ${isCheckingBulk ? 'bg-blue-100 text-blue-400 cursor-wait' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                    {isCheckingBulk ? <window.Icon name="loader-2" className="w-4 h-4 animate-spin"/> : <window.Icon name="refresh-cw" className="w-4 h-4"/>} 
                    {selectedCount} Seçiliyi Tara
                </button>
                <button onClick={()=>setShowBulkModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg"><window.Icon name="send" className="w-4 h-4"/> Gönder</button>
            </div>
        )}
        
        {activeTab === 'crm' && (
            <button onClick={fixAllTrafficData} className="p-2 bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg ml-2" title="Trafik Verilerini Düzelt"><window.Icon name="wrench" className="w-4 h-4"/></button>
        )}
    </div>
);