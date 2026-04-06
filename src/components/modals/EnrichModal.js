// EnrichModal.js

// Bağımlılık: Icon bileşeni (Icon.js) gereklidir.

// --- ENRICH MODAL (Arka Plan Sunucu İşlemi) ---
window.EnrichModal = ({ isEnriching, enrichProgress, enrichLogs, close, stopEnrichBackground }) => {
    // Otomatik scroll için referans
    const logsEndRef = React.useRef(null);

    // Logs değiştiğinde en alta kaydır
    React.useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [enrichLogs]);

    const pct = enrichProgress.total > 0 ? Math.round((enrichProgress.current / enrichProgress.total) * 100) : 0;

    return (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-5 border-b flex justify-between items-center bg-purple-50">
                    <h3 className="font-bold text-purple-900 flex items-center gap-2"><window.Icon name="wand-2" className="w-5 h-5"/> Veri Zenginleştirme</h3>
                    <div className="flex items-center gap-2">
                        {isEnriching && (
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full border border-green-200 animate-pulse">
                                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                Sunucuda Çalışıyor
                            </span>
                        )}
                        {!isEnriching && <button onClick={close}><window.Icon name="x" className="w-5 h-5 text-purple-400"/></button>}
                    </div>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {/* Arka plan bilgi mesajı */}
                    {isEnriching && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                            <window.Icon name="info" className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <div className="text-xs text-blue-700 leading-relaxed">
                                <strong>İşlem sunucuda arka planda çalışıyor.</strong> Tarayıcıyı kapatabilirsiniz, işlem devam edecektir. Sayfayı tekrar açtığınızda kaldığı yerden ilerlemeyi görebilirsiniz.
                            </div>
                        </div>
                    )}

                    <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600 mb-1">%{pct}</div>
                        <div className="text-xs text-slate-500">{enrichProgress.current} / {enrichProgress.total} Site Tarandı</div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-purple-600 h-full transition-all duration-300" style={{width: `${pct}%`}}></div>
                    </div>
                    <div className="h-64 bg-slate-900 rounded-xl p-4 custom-scrollbar overflow-y-auto console-log border border-slate-700 shadow-inner">
                        {enrichLogs.map((log, i) => (
                            <div key={i} className={`mb-1 ${log.type === 'success' ? 'text-green-400' : log.type === 'error' ? 'text-red-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-slate-300'}`}>
                                <span className="opacity-40 mr-2">[{log.time}]</span>
                                {log.msg}
                            </div>
                        ))}
                        {enrichLogs.length === 0 && <div className="text-slate-500 italic text-center mt-10">İşlem başlatılıyor...</div>}
                        {/* Scroll hedefi */}
                        <div ref={logsEndRef} />
                    </div>
                </div>
                <div className="p-4 border-t bg-slate-50 flex items-center justify-center gap-3">
                    {isEnriching ? (
                        <>
                            <span className="text-xs font-bold text-purple-600 animate-pulse flex items-center gap-2">
                                <window.Icon name="loader-2" className="w-4 h-4 animate-spin" />
                                Veriler taranıyor...
                            </span>
                            {stopEnrichBackground && (
                                <button onClick={stopEnrichBackground} className="bg-red-100 text-red-600 hover:bg-red-200 px-4 py-1.5 rounded-lg text-xs font-bold border border-red-200 flex items-center gap-1.5 transition-colors">
                                    <window.Icon name="square" className="w-3 h-3" />
                                    Durdur
                                </button>
                            )}
                            <button onClick={close} className="bg-slate-200 text-slate-600 hover:bg-slate-300 px-4 py-1.5 rounded-lg text-xs font-bold border border-slate-300 flex items-center gap-1.5 transition-colors">
                                <window.Icon name="eye-off" className="w-3 h-3" />
                                Gizle
                            </button>
                        </>
                    ) : (
                        <button onClick={close} className="bg-slate-800 text-white px-6 py-2 rounded-lg text-sm font-bold">Kapat</button>
                    )}
                </div>
            </div>
        </div>
    );
};