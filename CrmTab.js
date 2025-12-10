// CrmTab.js
// Görev: Müşteri veritabanı listeleme (Mail Okunma İkonu Eklendi)

window.CrmTab = ({
    crmData,
    filters,
    setFilters,
    selectedIds,
    setShowBulkModal,
    activeTab,
    fixAllTrafficData,
    onBulkCheck,
    isCheckingBulk,
    paginatedItems,
    selectedCount,
    toggleSelectAll,
    toggleSelection,
    handleSort,
    sortConfig,
    editingRowId,
    editFormData,
    handleEditChange,
    handleEditSave,
    handleEditCancel,
    handleEditClick,
    setHistoryModalLead,
    openMailModal,
    currentPage,
    totalPages,
    setCurrentPage,
    totalRecords,
    emailMap,
    getStageInfo,
    enrichDatabase,
    isEnriching,
    setShowImportModal,
    bulkUpdateStatus
}) => {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in">
            <div className="p-6 border-b border-slate-100 flex flex-col gap-4">
                {/* Üst Bar (Başlık ve Butonlar) - Değişiklik Yok */}
                <div className="flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <h3 className="font-bold text-slate-800 text-lg">Müşteri Veritabanı</h3>
                        <div className="text-xs text-slate-400 font-medium px-3 py-1 bg-slate-50 rounded border">{totalRecords} Kayıt</div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setShowImportModal(true)} className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 flex items-center gap-2 transition-colors">
                            <window.Icon name="upload-cloud" className="w-4 h-4"/> Liste Yükle
                        </button>
                        <div className="relative group">
                            <button disabled={isEnriching} className="bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold border border-purple-200 flex items-center gap-2 transition-colors disabled:opacity-50">
                                {isEnriching ? <window.Icon name="loader-2" className="w-4 h-4 animate-spin"/> : <window.Icon name="wand-2" className="w-4 h-4"/>} 
                                {isEnriching ? 'İşleniyor...' : 'Veri Zenginleştir'}
                                <window.Icon name="chevron-down" className="w-3 h-3 ml-1"/>
                            </button>
                            {!isEnriching && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 hidden group-hover:block animate-in fade-in zoom-in-95 duration-100">
                                    <div className="p-1">
                                        <button onClick={() => enrichDatabase('EMAIL')} className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-700 rounded-md transition-colors flex items-center gap-2"><window.Icon name="mail" className="w-3 h-3"/> Eksik Mailleri Bul</button>
                                        <button onClick={() => enrichDatabase('TRAFFIC')} className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-700 rounded-md transition-colors flex items-center gap-2"><window.Icon name="bar-chart-2" className="w-3 h-3"/> Eksik Trafiği Bul</button>
                                        <div className="h-px bg-slate-100 my-1"></div>
                                        <button onClick={() => enrichDatabase('BOTH')} className="w-full text-left px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-50 rounded-md transition-colors flex items-center gap-2"><window.Icon name="check-circle-2" className="w-3 h-3"/> Tümünü Tara (Full)</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <window.FilterBar filters={filters} setFilters={setFilters} selectedCount={selectedCount} setShowBulkModal={setShowBulkModal} activeTab={activeTab} fixAllTrafficData={fixAllTrafficData} onBulkCheck={onBulkCheck} isCheckingBulk={isCheckingBulk} onBulkStatusChange={bulkUpdateStatus} />
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b">
                        <tr>
                            <th className="p-4 w-10"><input type="checkbox" className="custom-checkbox" checked={selectedIds.size > 0 && selectedIds.size === paginatedItems.length} onChange={() => toggleSelectAll(paginatedItems)}/></th>
                            <th className="p-4 cursor-pointer" onClick={() => handleSort('url')}>Site (Mail Takip)</th>
                            <th className="p-4">Email</th>
                            <th className="p-4">Son Gönderilen</th>
                            <th className="p-4" onClick={() => handleSort('lastContactDate')}><div className="flex items-center gap-1 cursor-pointer hover:text-indigo-600">Son Temas <window.SortIcon column="lastContactDate" sortConfig={sortConfig}/></div></th>
                            <th className="p-4" onClick={() => handleSort('potential')}><div className="flex items-center gap-1 cursor-pointer hover:text-indigo-600">Potansiyel <window.SortIcon column="potential" sortConfig={sortConfig}/></div></th>
                            <th className="p-4">Notlar</th>
                            <th className="p-4">Dil</th>
                            <th className="p-4 cursor-pointer" onClick={() => handleSort('statusKey')}><div className="flex items-center gap-1 hover:text-indigo-600">Durum <window.SortIcon column="statusKey" sortConfig={sortConfig}/></div></th>
                            <th className="p-4 text-right">İşlem</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {paginatedItems.map(item => {
                            const mainEmail = item.email ? item.email.split(',')[0].trim() : '';
                            const relatedSites = emailMap[mainEmail] || [];
                            const siteCount = relatedSites.length;
                            
                            // MAIL OKUNDU KONTROLÜ
                            const isMailOpened = !!item.mailOpenedAt;
                            
                            return (
                            <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${editingRowId === item.id ? 'bg-indigo-50' : ''}`}>
                                <td className="p-4"><input type="checkbox" className="custom-checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelection(item.id)}/></td>
                                <td className="p-4 font-bold text-slate-700">
                                    {editingRowId === item.id ? (
                                        <input value={editFormData.url} onChange={e => handleEditChange('url', e.target.value)} className="w-full p-1 border rounded" />
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            {/* OKUNDU GÖSTERGESİ */}
                                            {isMailOpened ? (
                                                <div className="w-3 h-3 rounded-full bg-green-500 shadow-sm animate-pulse" title={`Mail Okundu: ${new Date(item.mailOpenedAt).toLocaleString('tr-TR')}`}></div>
                                            ) : (
                                                <div className="w-3 h-3 rounded-full bg-red-200" title="Mail henüz okunmadı"></div>
                                            )}
                                            
                                            <span onClick={() => toggleSelection(item.id)} className="cursor-pointer hover:text-indigo-600 transition-colors">
                                                {window.cleanDomain(item.url)}
                                            </span>
                                            <a href={`http://${window.cleanDomain(item.url)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:text-indigo-500" title="Siteye Git">
                                                <window.Icon name="external-link" className="w-4 h-4"/>
                                            </a>
                                        </div>
                                    )}
                                </td>
                                <td className="p-4 text-sm text-slate-600 max-w-[200px]">
                                    {editingRowId === item.id ? <input value={editFormData.email} onChange={e => handleEditChange('email', e.target.value)} className="w-full p-1 border rounded" /> : (
                                        <div className="flex flex-col">
                                            <span className="truncate" title={item.email}>{item.email || '-'}</span>
                                            {siteCount > 1 && (
                                                <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full w-fit mt-1 cursor-pointer hover:bg-purple-100" title={`Diğer Siteler: ${relatedSites.join(', ')}`} onClick={(e) => { e.stopPropagation(); alert(`Bu E-posta Adresine Bağlı Siteler:\n\n${relatedSites.join('\n')}`); }}>
                                                    {siteCount} Site Sahibi
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </td>
                                {/* Diğer kolonlar aynı */}
                                <td className="p-4 text-xs text-slate-500">{getStageInfo((item.stage || 0) - 1, item.language).label}</td>
                                <td className="p-4 text-slate-500">{item.lastContactDate ? new Date(item.lastContactDate).toLocaleDateString('tr-TR') : '-'}</td>
                                <td className="p-4 text-slate-600 font-mono text-xs flex items-center gap-1">
                                    {editingRowId === item.id ? <input value={editFormData.potential} onChange={e => handleEditChange('potential', e.target.value)} className="w-20 p-1 border rounded" /> : (
                                        item.trafficStatus && item.trafficStatus.label ? (
                                            <span className={`flex items-center gap-1 ${item.trafficStatus.viable ? 'text-green-600 font-bold' : 'text-slate-400'}`}>
                                                <window.Icon name={item.trafficStatus.viable ? "trending-up" : "minus"} className="w-3 h-3"/> {item.trafficStatus.label}
                                            </span>
                                        ) : <span className="text-slate-300">-</span>
                                    )}
                                </td>
                                <td className="p-4 text-slate-500 text-xs max-w-[150px] truncate" title={item.notes}>{editingRowId === item.id ? <input value={editFormData.notes} onChange={e => handleEditChange('notes', e.target.value)} className="w-full p-1 border rounded" /> : item.notes || '-'}</td>
                                <td className="p-4">{editingRowId === item.id ? <select value={editFormData.language} onChange={e => handleEditChange('language', e.target.value)} className="p-1 border rounded"><option value="TR">TR</option><option value="EN">EN</option></select> : <span className={`text-[10px] px-2 py-1 rounded border ${item.language === 'TR' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>{item.language || 'TR'}</span>}</td>
                                <td className="p-4">{editingRowId === item.id ? <select value={editFormData.statusKey} onChange={e => handleEditChange('statusKey', e.target.value)} className="p-1 border rounded text-xs max-w-[120px]"><option value="New">New</option>{Object.keys(window.LEAD_STATUSES).map(statusKey => (<option key={statusKey} value={statusKey}>{window.LEAD_STATUSES[statusKey].label}</option>))}</select> : <span className={`px-2 py-1 rounded text-xs font-bold border ${window.LEAD_STATUSES[item.statusKey]?.color || 'bg-gray-100'}`}>{window.LEAD_STATUSES[item.statusKey]?.label || item.statusLabel}</span>}</td>
                                <td className="p-4 pr-6 text-right flex justify-end gap-1">
                                    {editingRowId === item.id ? (
                                        <><button onClick={handleEditSave} className="bg-green-100 text-green-700 p-1.5 rounded hover:bg-green-200"><window.Icon name="check" className="w-4 h-4"/></button><button onClick={handleEditCancel} className="bg-red-100 text-red-700 p-1.5 rounded hover:bg-red-200"><window.Icon name="x" className="w-4 h-4"/></button></>
                                    ) : (
                                        <>
                                            <button onClick={() => setHistoryModalLead(item)} className="bg-slate-100 text-slate-600 p-1.5 rounded-lg hover:bg-slate-200"><window.Icon name="history" className="w-4 h-4" /></button>
                                            <button onClick={() => handleEditClick(item)} className="bg-slate-100 text-slate-600 p-1.5 rounded-lg hover:bg-blue-50 hover:text-blue-600"><window.Icon name="edit" className="w-4 h-4"/></button>
                                            <button onClick={() => openMailModal(item)} className="bg-indigo-600 hover:bg-indigo-700 text-white p-1.5 rounded-lg"><window.Icon name="send" className="w-4 h-4" /></button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
                <window.PaginationControls currentPage={currentPage} totalPages={totalPages} setCurrentPage={setCurrentPage} totalRecords={totalRecords} />
            </div>
        </div>
    );
};
