// SyncLogModal.js

window.SyncLogModal = ({ isOpen, logs, onClose, title = "Ä°ÅŸlem LoglarÄ±" }) => {
    const logsEndRef = React.useRef(null);

    React.useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="p-6 border-b flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <window.Icon name="terminal" className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
                            <p className="text-xs text-slate-500 font-medium">CanlÄ± iÅŸlem takibi yapÄ±lÄ±yor</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                    >
                        <window.Icon name="x" className="w-6 h-6" />
                    </button>
                </div>

                {/* Log Area */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-900 font-mono text-[11px] leading-relaxed">
                    {(!logs || logs.length === 0) ? (
                        <div className="text-slate-500 italic p-4 text-center">HenÃ¼z log bulunmuyor...</div>
                    ) : (
                        <div className="space-y-1">
                            {logs.map((log, idx) => {
                                const color = 
                                    log.type === 'success' ? 'text-emerald-400' :
                                    log.type === 'error' ? 'text-red-400' :
                                    log.type === 'warning' || log.type === 'warn' ? 'text-amber-400' :
                                    'text-indigo-300';
                                
                                return (
                                    <div key={idx} className={`${color} flex gap-3 py-1 border-b border-slate-800/50 last:border-0`}>
                                        <span className="text-slate-500 shrink-0">[{log.time || log.date || '...'}]</span>
                                        <span className="break-words">{log.message || log.msg}</span>
                                    </div>
                                );
                            })}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold transition-all active:scale-95 shadow-md"
                    >
                        Kapat
                    </button>
                </div>
            </div>
        </div>
    );
};
