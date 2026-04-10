// FilterBar.js
// GÜNCELLEME: Otomatik Takip Filtresi eklendi.

const StatusMultiSelect = window.StatusMultiSelect;

window.FilterBar = ({
    filters,
    setFilters,
    selectedCount,
    selectedIds,
    setShowBulkModal,
    activeTab,
    onBulkCheck,
    isCheckingBulk,
    onBulkStatusChange,
    onExport,
    startAutoFollowup,
    stopAutoFollowup
}) => (
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

        <select
            value={filters.mailStatus}
            onChange={(e) => setFilters(prev => ({ ...prev, mailStatus: e.target.value }))}
            className={`px-3 py-2 rounded-lg border text-sm font-medium outline-none cursor-pointer ${filters.mailStatus !== 'ALL' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600'}`}
        >
            <option value="ALL">Mail Takip: Tümü</option>
            <option value="REPLIED">🔵 Cevaplandı (Mavi)</option>
            <option value="OPENED">🟢 Okundu (Yeşil)</option>
            <option value="UNOPENED">🔴 Okunmadı (Kırmızı)</option>
        </select>

        {/* YENİ: OTOMATİK TAKİP FİLTRESİ */}
        <select
            value={filters.autoFollowup}
            onChange={(e) => setFilters(prev => ({ ...prev, autoFollowup: e.target.value }))}
            className={`px-3 py-2 rounded-lg border text-sm font-medium outline-none cursor-pointer ${filters.autoFollowup !== 'ALL' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-600'}`}
        >
            <option value="ALL">Otomatik Takip: Tümü</option>
            <option value="ACTIVE">🔄 Takip Aktif</option>
            <option value="INACTIVE">⏸️ Takip Pasif</option>
        </select>

        <select value={filters.quality} onChange={(e) => setFilters(prev => ({ ...prev, quality: e.target.value }))} className={`px-3 py-2 rounded-lg border text-sm font-medium outline-none cursor-pointer ${filters.quality !== 'ALL' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-600'}`}>
            <option value="ALL">Veri Durumu: Tümü</option>
            <option value="GOOD">✅ Sadece Tam Veriler</option>
            <option value="MISSING">⚠️ Eksik Veriler (Mail/Trafik Yok)</option>
            <option value="TRAFFIC_NO_EMAIL">📊 Trafik var, E-mail yok</option>
            <option value="EMAIL_NO_TRAFFIC">📧 E-mail var, Trafik yok</option>
        </select>

        <select value={filters.language} onChange={(e) => setFilters(prev => ({ ...prev, language: e.target.value }))} className="px-3 py-2 bg-slate-50 rounded-lg border text-sm text-slate-600 font-medium outline-none cursor-pointer"><option value="ALL">Tüm Diller</option><option value="TR">TR (Türkçe)</option><option value="EN">EN (English)</option></select>

        {StatusMultiSelect && (
            <StatusMultiSelect
                selectedStatuses={filters.status}
                onChange={(newStatuses) => setFilters(prev => ({ ...prev, status: newStatuses }))}
            />
        )}

        <select value={filters.lastSentStage} onChange={(e) => setFilters(prev => ({ ...prev, lastSentStage: e.target.value }))} className="px-3 py-2 bg-slate-50 rounded-lg border text-sm text-slate-600 font-medium outline-none cursor-pointer"><option value="ALL">Son Gönderilen: Tümü</option><option value="-1">Henüz Gönderilmedi</option>{window.DEFAULT_WORKFLOW_TR.map((step, index) => (<option key={index} value={index}>{step.label}</option>))}</select>

        <div className="flex items-center gap-1 border rounded-lg px-2 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400">Tarih:</span>
            <input type="date" value={filters.startDate} onChange={(e) => setFilters(p => ({ ...p, startDate: e.target.value }))} className="bg-transparent text-xs p-1 outline-none text-slate-600" />
            <span className="text-slate-300">-</span>
            <input type="date" value={filters.endDate} onChange={(e) => setFilters(p => ({ ...p, endDate: e.target.value }))} className="bg-transparent text-xs p-1 outline-none text-slate-600" />
        </div>

        <button onClick={() => setFilters({ search: '', language: 'ALL', status: [], lastSentStage: 'ALL', quality: 'ALL', mailStatus: 'ALL', autoFollowup: 'ALL', startDate: '', endDate: '' })} className="px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors">Temizle</button>

        <div className="ml-auto flex gap-2 animate-in fade-in items-center">
            <button
                onClick={onExport}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-md transition-colors"
                title="Mevcut listeyi rapor olarak indir"
            >
                <window.Icon name="download" className="w-4 h-4" /> Raporu İndir
            </button>

            {selectedCount > 0 && (
                <>
                    <select
                        onChange={(e) => {
                            if (e.target.value) {
                                onBulkStatusChange(e.target.value);
                                e.target.value = '';
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
                        {isCheckingBulk ? <window.Icon name="loader-2" className="w-4 h-4 animate-spin" /> : <window.Icon name="refresh-cw" className="w-4 h-4" />}
                        {selectedCount} Seçiliyi Tara
                    </button>
                    <button onClick={() => setShowBulkModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg"><window.Icon name="send" className="w-4 h-4" /> Gönder</button>

                    {startAutoFollowup && stopAutoFollowup && selectedIds instanceof Set && (
                        <div className="flex gap-1 ml-1 pl-1 border-l border-slate-300">
                            <button
                                onClick={() => startAutoFollowup(selectedIds)}
                                className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 shadow-md transition-colors"
                                title="Seçili lead'ler için otomatik takip başlat (7 gün ara ile)"
                            >
                                <window.Icon name="clock" className="w-4 h-4" /> Takip Başlat
                            </button>
                            <button
                                onClick={() => stopAutoFollowup(selectedIds)}
                                className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 shadow-md transition-colors"
                                title="Seçili lead'lerin otomatik takibini durdur"
                            >
                                <window.Icon name="square" className="w-4 h-4" /> Takip Durdur
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>

    </div>
);
