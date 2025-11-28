// HistoryModal.js

// Bağımlılıklar: Icon, cleanDomain gereklidir.

window.HistoryModal = ({ 
    historyModalLead, 
    setHistoryModalLead, 
    checkGmailReply, 
    isCheckingReply, 
    replyCheckResult 
}) => {
    if (!historyModalLead) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden shadow-2xl">
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><window.Icon name="history" className="w-5 h-5 text-indigo-600"/> İletişim Geçmişi</h3>
                    <button onClick={()=>setHistoryModalLead(null)}><window.Icon name="x-circle" className="w-6 h-6 text-slate-400" /></button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <h4 className="font-bold text-lg mb-4 text-center">{window.cleanDomain(historyModalLead.url)}</h4>
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
                        {(!historyModalLead.history || Object.values(historyModalLead.history).every(d => !d)) && (
                            <div className="pl-6 text-sm text-slate-400 italic">Henüz kayıtlı bir geçmiş yok.</div>
                        )}
                    </div>

                    {/* --- CEVAP KONTROL ALANI --- */}
                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-3">Gmail Kontrolü</div>
                        {historyModalLead.threadId ? (
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="text-xs text-blue-800 font-bold">Son Gelen Cevap</div>
                                    <button 
                                        onClick={() => checkGmailReply(historyModalLead)} 
                                        disabled={isCheckingReply}
                                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                                    >
                                        {isCheckingReply ? <window.Icon name="loader-2" className="w-3 h-3 animate-spin"/> : <window.Icon name="refresh-cw" className="w-3 h-3"/>}
                                        Kontrol Et
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
                                                <div className="text-xs text-slate-700 leading-relaxed font-medium">
                                                    "{replyCheckResult.snippet}..."
                                                </div>
                                                <div className="mt-2 text-[10px] text-blue-600 font-bold cursor-pointer hover:underline" onClick={() => alert(replyCheckResult.body)}>Tamamını Göster</div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-2 text-xs text-slate-500 bg-white/50 rounded-lg border border-dashed border-slate-300">
                                                Yeni bir cevap bulunamadı.
                                            </div>
                                        )}
                                    </div>
                                )}
                                {!replyCheckResult && !isCheckingReply && (
                                    <div className="text-[10px] text-blue-400 text-center">
                                        Gmail kutunuz taranarak bu kişiden gelen son mail gösterilir.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400 italic text-center p-3 bg-slate-50 rounded border border-dashed">
                                Bu kayıtla ilişkili bir mail geçmişi (Thread ID) bulunamadı.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};