// HistoryModal.js

const { useState } = React;

window.HistoryModal = ({ 
    historyModalLead, 
    setHistoryModalLead, 
    checkGmailReply, 
    isCheckingReply, 
    replyCheckResult,
    onAddNote,
    onDeleteNote,
    onUpdateNote 
}) => {
    const [newNote, setNewNote] = useState("");
    const [editingNoteIndex, setEditingNoteIndex] = useState(null);
    const [editingNoteContent, setEditingNoteContent] = useState("");

    if (!historyModalLead) return null;

    const logs = historyModalLead.activityLog || [];
    const logsWithIndex = logs.map((log, index) => ({ ...log, originalIndex: index }));
    const sortedLogs = logsWithIndex.sort((a, b) => new Date(b.date) - new Date(a.date));

    const handleAddNoteClick = () => {
        if(!newNote.trim()) return;
        onAddNote(historyModalLead.id, newNote);
        setNewNote("");
    };

    const startEditing = (log) => {
        setEditingNoteIndex(log.originalIndex);
        setEditingNoteContent(log.content);
    };

    const saveEditing = () => {
        if (editingNoteIndex !== null && editingNoteContent.trim()) {
            onUpdateNote(historyModalLead.id, editingNoteIndex, editingNoteContent);
            setEditingNoteIndex(null);
            setEditingNoteContent("");
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden shadow-2xl">
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><window.Icon name="history" className="w-5 h-5 text-indigo-600"/> İletişim Geçmişi</h3>
                    <button onClick={()=>setHistoryModalLead(null)}><window.Icon name="x-circle" className="w-6 h-6 text-slate-400" /></button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <h4 className="font-bold text-lg mb-4 text-center">{window.cleanDomain(historyModalLead.url)}</h4>
                    
                    {/* --- MAIL TAKİP DURUMU (YENİ) --- */}
                    <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase">Mail Okunma Durumu</div>
                            {historyModalLead.mailOpenedAt ? (
                                <div className="text-green-600 font-bold text-sm flex items-center gap-2 mt-1">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    Okundu
                                </div>
                            ) : (
                                <div className="text-slate-500 text-sm flex items-center gap-2 mt-1">
                                    <div className="w-2 h-2 rounded-full bg-red-300"></div>
                                    Henüz Okunmadı
                                </div>
                            )}
                        </div>
                        {historyModalLead.mailOpenedAt && (
                            <div className="text-right">
                                <div className="text-xs font-bold text-slate-400 uppercase">Son Görülme</div>
                                <div className="text-slate-700 font-medium text-sm mt-1">
                                    {new Date(historyModalLead.mailOpenedAt).toLocaleString('tr-TR')}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* --- SÜREÇ ZAMAN ÇİZELGESİ --- */}
                    <div className="mb-6 pb-6 border-b border-slate-100">
                        <h5 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider">İş Akışı Durumu</h5>
                        <div className="relative border-l-2 border-indigo-100 ml-4 space-y-6">
                            {[
                                { label: 'İlk Temas', date: historyModalLead.history?.initial },
                                { label: 'Takip 1', date: historyModalLead.history?.repeat1 },
                                { label: 'Takip 2', date: historyModalLead.history?.repeat2 },
                                { label: 'Takip 3', date: historyModalLead.history?.repeat3 },
                                { label: 'Takip 4', date: historyModalLead.history?.repeat4 },
                                { label: 'Reddedildi', date: historyModalLead.history?.denied, isBad: true }
                            ].filter(h => h.date).map((h, i) => (
                                <div key={i} className="relative pl-6">
                                    <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white ${h.isBad ? 'bg-red-500' : 'bg-indigo-500'}`}></div>
                                    <div className="text-xs font-bold text-slate-500 uppercase mb-1">{h.label}</div>
                                    <div className="text-sm font-medium text-slate-800 bg-slate-50 p-2 rounded border border-slate-100 inline-block">
                                        <div className="flex items-center gap-2"><window.Icon name="calendar" className="w-3 h-3 text-slate-400"/> {new Date(h.date).toLocaleDateString('tr-TR')}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* --- LOG VE NOTLAR --- */}
                    <div className="mb-6">
                        <h5 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider flex items-center justify-between">
                            Detaylı Log & Notlar
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">{sortedLogs.length} Kayıt</span>
                        </h5>
                        
                        <div className="flex gap-2 mb-4">
                            <input 
                                type="text" 
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                placeholder="Özel not ekle..." 
                                className="flex-1 text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddNoteClick()}
                            />
                            <button onClick={handleAddNoteClick} className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors">
                                <window.Icon name="plus" className="w-4 h-4"/>
                            </button>
                        </div>

                        <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                            {sortedLogs.length > 0 ? sortedLogs.map((log) => (
                                <div 
                                    key={log.originalIndex} 
                                    className={`p-3 rounded-lg text-sm border group relative ${
                                        log.type === 'MAIL' ? 'bg-blue-50 border-blue-100' : 
                                        log.type === 'BOUNCE' ? 'bg-red-50 border-red-200' : 
                                        log.type === 'REPLY' ? 'bg-green-50 border-green-200' :
                                        log.type === 'INFO' ? 'bg-indigo-50 border-indigo-200' :
                                        'bg-yellow-50 border-yellow-100'
                                    }`}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                            log.type === 'MAIL' ? 'bg-blue-200 text-blue-800' : 
                                            log.type === 'BOUNCE' ? 'bg-red-200 text-red-800' :
                                            log.type === 'REPLY' ? 'bg-green-200 text-green-800' :
                                            log.type === 'INFO' ? 'bg-indigo-200 text-indigo-800' :
                                            'bg-yellow-200 text-yellow-800'
                                        }`}>
                                            {log.type === 'MAIL' ? 'Mail' : log.type === 'BOUNCE' ? 'Hata' : log.type === 'REPLY' ? 'Cevap' : log.type === 'INFO' ? 'Sistem' : 'Not'}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                            {new Date(log.date).toLocaleDateString('tr-TR')} {new Date(log.date).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                    </div>
                                    
                                    {editingNoteIndex === log.originalIndex ? (
                                        <div className="mt-2">
                                            <textarea value={editingNoteContent} onChange={(e) => setEditingNoteContent(e.target.value)} className="w-full p-2 border rounded text-sm mb-2" rows="2" />
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setEditingNoteIndex(null)} className="text-xs text-slate-500 hover:text-slate-700">İptal</button>
                                                <button onClick={saveEditing} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded">Kaydet</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-slate-700 leading-snug break-words pr-6">{log.content}</div>
                                    )}

                                    {log.type === 'NOTE' && editingNoteIndex !== log.originalIndex && (
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white/80 p-1 rounded shadow-sm">
                                            <button onClick={() => startEditing(log)} className="p-1 hover:text-blue-600" title="Düzenle"><window.Icon name="edit-2" className="w-3 h-3"/></button>
                                            <button onClick={() => onDeleteNote(historyModalLead.id, log.originalIndex)} className="p-1 hover:text-red-600" title="Sil"><window.Icon name="trash-2" className="w-3 h-3"/></button>
                                        </div>
                                    )}
                                </div>
                            )) : (
                                <div className="text-center py-4 text-xs text-slate-400 border border-dashed rounded-lg">Henüz kayıt yok.</div>
                            )}
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-3">Gmail Kontrolü</div>
                        {historyModalLead.threadId ? (
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="text-xs text-blue-800 font-bold">Son Gelen Cevap</div>
                                    <button onClick={() => checkGmailReply(historyModalLead)} disabled={isCheckingReply} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors disabled:opacity-50">
                                        {isCheckingReply ? <window.Icon name="loader-2" className="w-3 h-3 animate-spin"/> : <window.Icon name="refresh-cw" className="w-3 h-3"/>} Kontrol Et
                                    </button>
                                </div>
                                {replyCheckResult && (
                                    <div className="animate-in fade-in zoom-in-95 duration-300">
                                        {replyCheckResult.hasReply ? (
                                            <div className="bg-white rounded-lg p-3 border border-blue-200 shadow-sm">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="text-[10px] font-bold text-slate-500">{replyCheckResult.from}</div>
                                                    <div className="text-[10px] text-slate-400">{new Date(replyCheckResult.date).toLocaleDateString('tr-TR')}</div>
                                                </div>
                                                <div className="text-xs text-slate-700 leading-relaxed font-medium">"{replyCheckResult.snippet}..."</div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-2 text-xs text-slate-500 bg-white/50 rounded-lg border border-dashed border-slate-300">Yeni bir cevap bulunamadı.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400 italic text-center p-3 bg-slate-50 rounded border border-dashed">Thread ID bulunamadı.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
