// DashboardTab.js

// Bağımlılıklar: FilterBar, PaginationControls, Icon, cleanDomain gereklidir.

window.DashboardTab = ({ 
    crmData, 
    filters, 
    setFilters, 
    selectedIds, 
    toggleSelection, 
    toggleSelectAll, 
    selectedCount,
    setShowBulkModal,
    activeTab,
    fixAllTrafficData,
    onBulkCheck,
    isCheckingBulk,
    paginatedItems, // getPaginatedData() sonucu buraya verilmeli
    currentPage,
    totalPages,
    setCurrentPage,
    totalRecords,
    setHistoryModalLead,
    getStageInfo // app.js'deki getStageInfo fonksiyonu prop olarak gelmeli
}) => {

    // İstatistik Verileri
    const stats = [
        { label: 'Toplam Kayıt', val: crmData.length, icon: 'users', color: 'text-slate-600' },
        { label: 'Olumlu', val: crmData.filter(i => i.statusKey === 'DEAL_ON').length, icon: 'check-circle', color: 'text-green-600' },
        { label: 'Süreçte', val: crmData.filter(i => ['IN_PROCESS', 'ASKED_MORE', 'NO_REPLY'].includes(i.statusKey)).length, icon: 'refresh-cw', color: 'text-blue-600' },
        { label: 'Takip', val: crmData.filter(i => i.needsFollowUp).length, icon: 'alert-triangle', color: 'text-orange-600' }
    ];

    // Dashboard tablosunda sadece aktif süreçtekiler gösterilir (Bazı durumlar hariç)
    const displayItems = paginatedItems.filter(i => !['DEAL_ON', 'DENIED', 'NOT_VIABLE', 'NON_RESPONSIVE', 'NOT_POSSIBLE'].includes(i.statusKey));

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* İstatistik Kartları */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                            <div className="text-xs font-bold uppercase text-slate-400 mb-1">{stat.label}</div>
                            <div className={`text-3xl font-bold ${stat.color}`}>{stat.val}</div>
                        </div>
                        <window.Icon name={stat.icon} className={`w-8 h-8 opacity-20 ${stat.color}`} />
                    </div>
                ))}
            </div>
            
            {/* Filtre Çubuğu */}
            <window.FilterBar 
                filters={filters} 
                setFilters={setFilters} 
                selectedCount={selectedCount} 
                setShowBulkModal={setShowBulkModal} 
                activeTab={activeTab} 
                fixAllTrafficData={fixAllTrafficData}
                onBulkCheck={onBulkCheck}
                isCheckingBulk={isCheckingBulk}
            />
            
            {/* Tablo */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <window.Icon name="trending-up" className="w-5 h-5 text-indigo-500" /> Aktif Süreç
                    </h3>
                </div>
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                        <tr>
                            <th className="p-4 w-10">
                                <input 
                                    type="checkbox" 
                                    className="custom-checkbox" 
                                    checked={selectedIds.size > 0 && selectedIds.size === paginatedItems.length} 
                                    onChange={() => toggleSelectAll(paginatedItems)}
                                />
                            </th>
                            <th className="p-4">Site</th>
                            <th className="p-4">Email</th>
                            <th className="p-4">Son Gönderilen</th>
                            {/* Dashboard'da sıralama fonksiyonu genellikle kullanılmaz ama başlık aynı kalsın */}
                            <th className="p-4">Son Temas</th> 
                            <th className="p-4">Aksiyon</th>
                            <th className="p-4 text-right">Geçmiş</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {displayItems.map(lead => {
                            const lastSentInfo = getStageInfo((lead.stage || 0) - 1, lead.language);
                            const nextStageInfo = getStageInfo(lead.stage, lead.language);
                            return (
                                <tr key={lead.id} className="hover:bg-slate-50">
                                    <td className="p-4">
                                        <input type="checkbox" className="custom-checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelection(lead.id)}/>
                                    </td>
                                    <td className="p-4 font-medium">
                                        <div className="flex items-center gap-2">
                                            <span onClick={() => toggleSelection(lead.id)} className="cursor-pointer hover:text-indigo-600 transition-colors">
                                                {window.cleanDomain(lead.url)}
                                            </span>
                                            <a href={`http://${window.cleanDomain(lead.url)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:text-indigo-500" title="Siteye Git">
                                                <window.Icon name="external-link" className="w-4 h-4"/>
                                            </a>
                                        </div>
                                    </td>
                                    <td className="p-4 text-sm text-slate-600">{lead.email || '-'}</td>
                                    <td className="p-4"><span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">{lead.stage === 0 ? 'Henüz Yok' : lastSentInfo.label}</span></td>
                                    <td className="p-4 text-slate-500">{lead.lastContactDate ? new Date(lead.lastContactDate).toLocaleDateString('tr-TR') : '-'}</td>
                                    <td className="p-4">
                                        {nextStageInfo.isFinished ? 
                                            <span className="text-green-600 font-bold">Bitti</span> : 
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${lead.needsFollowUp ? 'bg-orange-100 text-orange-700 animate-pulse' : 'bg-slate-100 text-slate-600'}`}>
                                                {lead.needsFollowUp ? `Gönder: ${nextStageInfo.label}` : `Bekle: ${nextStageInfo.label}`}
                                            </span>
                                        }
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => setHistoryModalLead(lead)} className="text-slate-400 hover:text-indigo-600">
                                            <window.Icon name="history" className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <window.PaginationControls 
                    currentPage={currentPage} 
                    totalPages={totalPages} 
                    setCurrentPage={setCurrentPage} 
                    totalRecords={totalRecords} 
                />
            </div>
        </div>
    );
};