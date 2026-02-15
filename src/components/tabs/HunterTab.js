// HunterTab.js

// Bağımlılıklar: Icon, cleanDomain, SEARCH_COUNTRIES gereklidir.

window.HunterTab = ({
    keywords,
    setKeywords,
    searchDepth,
    setSearchDepth,
    searchLocation,
    setSearchLocation,
    isScanning,
    startScan,
    stopScan,
    progress,
    logs,
    logsEndRef,
    leads,
    hunterFilterType,
    setHunterFilterType,
    selectedIds,
    bulkAddNotViable,
    setShowBulkModal,
    processedHunterLeads, // processedHunterLeads sonucu buraya verilmeli
    toggleSelectAll,
    toggleSelection,
    setHunterSort,
    addToCrm
}) => {
    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-2">Anahtar Kelimeler (Her satıra bir tane)</label>
                        <textarea 
                            value={keywords} 
                            onChange={(e) => setKeywords(e.target.value)} 
                            className="w-full h-32 p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" 
                            placeholder="Örn: mobilya firmaları istanbul&#10;tekstil üreticileri&#10;inşaat malzemeleri"
                        ></textarea>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Arama Derinliği (Sayfa)</label>
                            <input type="range" min="10" max="100" step="10" value={searchDepth} onChange={(e) => setSearchDepth(e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"/>
                            <div className="text-right text-xs font-bold text-indigo-600">{searchDepth} Sonuç / Kelime</div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Lokasyon</label>
                            <select value={searchLocation} onChange={(e) => setSearchLocation(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-medium">
                                {window.SEARCH_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="pt-2">
                            {!isScanning ? (
                                <button onClick={startScan} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2">
                                    <window.Icon name="search" className="w-5 h-5"/> Taramayı Başlat
                                </button>
                            ) : (
                                <button onClick={stopScan} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 animate-pulse">
                                    <window.Icon name="square" className="w-5 h-5 fill-current"/> Durdur
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Progress & Logs */}
                {(isScanning || logs.length > 0) && (
                    <div className="mt-6 border-t pt-4">
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1"><span>İlerleme</span><span>%{Math.round(progress)}</span></div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-4"><div className="bg-indigo-600 h-full transition-all duration-300" style={{width: `${progress}%`}}></div></div>
                        <div className="h-32 bg-slate-900 rounded-xl p-3 overflow-y-auto custom-scrollbar console-log border border-slate-700">
                            {logs.map((log, i) => (
                                <div key={i} className={`mb-1 ${log.type === 'success' ? 'text-green-400' : log.type === 'error' ? 'text-red-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-slate-300'}`}>
                                    <span className="opacity-40 mr-2">[{log.time}]</span>{log.message}
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                )}
            </div>

            {/* Results */}
            {leads.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
                        <div className="flex items-center gap-2"><h3 className="font-bold text-slate-800">Sonuçlar</h3><span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">{leads.length}</span></div>
                        
                        <div className="flex items-center gap-2">
                            <select value={hunterFilterType} onChange={(e) => setHunterFilterType(e.target.value)} className="text-xs p-2 border rounded-lg bg-white"><option value="ALL">Tümü</option><option value="VIABLE">Yüksek Trafik</option><option value="LOW">Düşük Trafik</option></select>
                            
                            {selectedIds.size > 0 && (
                                <div className="flex gap-2 animate-in fade-in">
                                    <button onClick={bulkAddNotViable} className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-bold">Seçilenleri 'Not Viable' Ekle</button>
                                    <button onClick={() => setShowBulkModal(true)} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-2"><window.Icon name="send" className="w-3 h-3"/> Toplu Gönder</button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                <tr>
                                    <th className="p-4 w-10"><input type="checkbox" className="custom-checkbox" checked={selectedIds.size > 0 && selectedIds.size === processedHunterLeads.length} onChange={() => toggleSelectAll(processedHunterLeads)}/></th>
                                    <th className="p-4">Web Sitesi</th>
                                    <th className="p-4">Email Durumu</th>
                                    <th className="p-4 cursor-pointer" onClick={() => setHunterSort(p => ({ key: 'traffic', direction: p.direction === 'asc' ? 'desc' : 'asc' }))}>
                                        <div className="flex items-center gap-1">Trafik <window.Icon name="arrow-up-down" className="w-3 h-3"/></div>
                                    </th>
                                    <th className="p-4 text-right">İşlem</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {processedHunterLeads.map(lead => (
                                    <tr key={lead.id} className="hover:bg-slate-50">
                                        <td className="p-4"><input type="checkbox" className="custom-checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelection(lead.id)}/></td>
                                        <td className="p-4 font-bold text-slate-700">
                                            <div className="flex items-center gap-2">
                                                {window.cleanDomain(lead.url)}
                                                <a href={lead.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-500"><window.Icon name="external-link" className="w-3 h-3"/></a>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {lead.email ? <span className="text-green-600 font-bold text-xs flex items-center gap-1"><window.Icon name="check" className="w-3 h-3"/> {lead.email}</span> : <span className="text-slate-400 text-xs">Bulunamadı</span>}
                                        </td>
                                        <td className="p-4">
                                            {lead.trafficStatus && (
                                                <span className={`text-xs px-2 py-1 rounded font-bold ${lead.trafficStatus.viable ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {lead.trafficStatus.label || 'Veri Yok'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right flex justify-end gap-2">
                                            <button onClick={() => addToCrm(lead, 'TR')} className="bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded text-xs font-bold border border-red-100">TR Ekle</button>
                                            <button onClick={() => addToCrm(lead, 'EN')} className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded text-xs font-bold border border-blue-100">EN Ekle</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};