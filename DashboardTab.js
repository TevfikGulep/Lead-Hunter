// DashboardTab.js
// GÜNCELLEME: 'Tümünü Seç' özelliği, Sayfalama Limiti ve Mail Takip İkonu eklendi.

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
    paginatedItems, 
    currentPage,
    totalPages,
    setCurrentPage,
    totalRecords,
    setHistoryModalLead,
    getStageInfo, 
    handleSort, 
    sortConfig, 
    onStageChange, 
    workflow, 
    bulkUpdateStatus,
    itemsPerPage,    // YENİ: Sayfa başı kayıt sayısı
    setItemsPerPage, // YENİ: Sayfa başı kayıt değiştirme fonksiyonu
    selectAllFiltered // YENİ: Filtrelenmiş tüm kayıtları seçme fonksiyonu
}) => {

    // İstatistikler
    const stats = [
        { label: 'Toplam Kayıt', val: crmData.length, icon: 'users', color: 'text-slate-600' },
        { label: 'Olumlu', val: crmData.filter(i => i.statusKey === 'DEAL_ON').length, icon: 'check-circle', color: 'text-green-600' },
        { label: 'Süreçte', val: crmData.filter(i => ['IN_PROCESS', 'ASKED_MORE', 'NO_REPLY'].includes(i.statusKey)).length, icon: 'refresh-cw', color: 'text-blue-600' },
        { label: 'Takip', val: crmData.filter(i => i.needsFollowUp).length, icon: 'alert-triangle', color: 'text-orange-600' }
    ];

    const displayItems = paginatedItems;
    
    // Global seçim mantığı:
    // Sayfadaki tüm kayıtlar seçiliyse VE toplam kayıt sayısı sayfadaki kayıttan fazlaysa banner göster
    const isAllPageSelected = paginatedItems.length > 0 && selectedIds.size >= paginatedItems.length;
    const canSelectAllGlobal = isAllPageSelected && totalRecords > paginatedItems.length && selectedIds.size < totalRecords;

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
            
            {/* Filtre Bar */}
            <window.FilterBar filters={filters} setFilters={setFilters} selectedCount={selectedCount} setShowBulkModal={setShowBulkModal} activeTab={activeTab} fixAllTrafficData={fixAllTrafficData} onBulkCheck={onBulkCheck} isCheckingBulk={isCheckingBulk} onBulkStatusChange={bulkUpdateStatus} />
            
            {/* Tablo Alanı */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <window.Icon name="trending-up" className="w-5 h-5 text-indigo-500" /> Aktif Süreç
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    
                    {/* --- GLOBAL SELECTION BANNER (YENİ) --- */}
                    {canSelectAllGlobal && (
                        <div className="bg-indigo-50 border-b border-indigo-100 p-2 text-center text-xs text-indigo-800 animate-in slide-in-from-top-2">
                            Bu sayfadaki <strong>{paginatedItems.length}</strong> kayıt seçildi. 
                            <button 
                                onClick={selectAllFiltered} 
                                className="ml-2 font-bold underline hover:text-indigo-900 cursor-pointer"
                            >
                                Filtrelenmiş listenin tamamındaki {totalRecords} kaydı seçmek için tıklayın.
                            </button>
                        </div>
                    )}
                    {/* ------------------------------------- */}

                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                <th className="p-4 w-10">
                                    <input 
                                        type="checkbox" 
                                        className="custom-checkbox" 
                                        checked={isAllPageSelected} 
                                        onChange={() => toggleSelectAll(paginatedItems)}
                                    />
                                </th>
                                <th className="p-4">Site (Mail Takip)</th>
                                <th className="p-4">Email</th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600" onClick={() => handleSort('potential')}><div className="flex items-center gap-1">Trafik <window.SortIcon column="potential" sortConfig={sortConfig}/></div></th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600" onClick={() => handleSort('stage')}><div className="flex items-center gap-1">Son Gönderilen <window.SortIcon column="stage" sortConfig={sortConfig}/></div></th>
                                <th className="p-4 cursor-pointer hover:text-indigo-600" onClick={() => handleSort('lastContactDate')}><div className="flex items-center gap-1">Son Temas <window.SortIcon column="lastContactDate" sortConfig={sortConfig}/></div></th> 
                                <th className="p-4 cursor-pointer hover:text-indigo-600" onClick={() => handleSort('statusKey')}><div className="flex items-center gap-1">Durum <window.SortIcon column="statusKey" sortConfig={sortConfig}/></div></th>
                                <th className="p-4">Aksiyon</th>
                                <th className="p-4 text-right">Geçmiş</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {displayItems.map(lead => {
                                const nextStageInfo = getStageInfo(lead.stage, lead.language);
                                const isMailOpened = !!lead.mailOpenedAt;

                                return (
                                    <tr key={lead.id} className="hover:bg-slate-50">
                                        <td className="p-4"><input type="checkbox" className="custom-checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelection(lead.id)}/></td>
                                        <td className="p-4 font-medium">
                                            <div className="flex items-center gap-2">
                                                {/* MAIL TRACKING ICON (YENİ) */}
                                                {isMailOpened ? (
                                                    <div className="w-3 h-3 rounded-full bg-green-500 shadow-sm animate-pulse" title={`Mail Okundu: ${new Date(lead.mailOpenedAt).toLocaleString('tr-TR')}`}></div>
                                                ) : (
                                                    <div className="w-3 h-3 rounded-full bg-red-200" title="Mail henüz okunmadı"></div>
                                                )}

                                                <span onClick={() => toggleSelection(lead.id)} className="cursor-pointer hover:text-indigo-600 transition-colors">
                                                    {window.cleanDomain(lead.url)}
                                                </span>
                                                <a href={`http://${window.cleanDomain(lead.url)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:text-indigo-500" title="Siteye Git">
                                                    <window.Icon name="external-link" className="w-4 h-4"/>
                                                </a>
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm text-slate-600">{lead.email || '-'}</td>
                                        <td className="p-4 text-slate-600 font-mono text-xs">
                                            {lead.trafficStatus && lead.trafficStatus.label ? (
                                                <span className={`flex items-center gap-1 ${lead.trafficStatus.viable ? 'text-green-600 font-bold' : 'text-slate-400'}`}>
                                                    <window.Icon name={lead.trafficStatus.viable ? "trending-up" : "minus"} className="w-3 h-3"/> {lead.trafficStatus.label}
                                                </span>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>

                                        <td className="p-4">
                                            <div className="relative inline-block">
                                                <select
                                                    value={lead.stage || 0}
                                                    onChange={(e) => onStageChange(lead.id, parseInt(e.target.value))}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="appearance-none bg-indigo-50 text-indigo-700 px-2 py-1 pr-6 rounded text-xs font-bold border-none outline-none cursor-pointer focus:ring-2 focus:ring-indigo-300"
                                                >
                                                    <option value={0}>Henüz Yok</option>
                                                    {workflow && workflow.map((step, idx) => (
                                                        <option key={idx} value={idx + 1}>{step.label}</option>
                                                    ))}
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-indigo-700">
                                                    <window.Icon name="chevron-down" className="w-3 h-3"/>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-slate-500">{lead.lastContactDate ? new Date(lead.lastContactDate).toLocaleDateString('tr-TR') : '-'}</td>
                                        
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${window.LEAD_STATUSES[lead.statusKey]?.color || 'bg-gray-100'}`}>
                                                {window.LEAD_STATUSES[lead.statusKey]?.label || lead.statusLabel || 'New'}
                                            </span>
                                        </td>

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
                </div>
                <window.PaginationControls 
                    currentPage={currentPage} 
                    totalPages={totalPages} 
                    setCurrentPage={setCurrentPage} 
                    totalRecords={totalRecords} 
                    itemsPerPage={itemsPerPage}     // YENİ
                    setItemsPerPage={setItemsPerPage} // YENİ
                />
            </div>
        </div>
    );
};
