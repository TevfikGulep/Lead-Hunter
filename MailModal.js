// MailModal.js

// Bağımlılıklar: Icon bileşeni gereklidir.

window.MailModal = ({ 
    selectedLead, 
    setSelectedLead, 
    handleSendMail, 
    isSending 
}) => {
    if (!selectedLead) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
                <div className="p-5 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg">{selectedLead.currentLabel}</h3>
                    <button onClick={()=>setSelectedLead(null)}><window.Icon name="x-circle" className="w-6 h-6 text-slate-400" /></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    
                    {/* ÇOKLU MAIL SEÇİMİ */}
                    {selectedLead.allEmails && selectedLead.allEmails.includes(',') && (
                        <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-xl mb-2">
                            <div className="text-xs font-bold text-yellow-700 mb-2 flex items-center gap-1"><window.Icon name="info" className="w-3 h-3"/> Hızlı Seçim (Bu sitede birden çok mail bulundu):</div>
                            <div className="flex flex-wrap gap-2">
                                {selectedLead.allEmails.split(',').map((email, idx) => {
                                    const clean = email.trim();
                                    if(!clean) return null;
                                    return (
                                        <button 
                                            key={idx} 
                                            onClick={()=>setSelectedLead(p=>({...p, draft:{...p.draft, to: clean}}))}
                                            className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${selectedLead.draft.to === clean ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                                        >
                                            {clean}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-4"><label className="w-12 text-xs font-bold pt-2">Kime:</label><input value={selectedLead.draft.to} onChange={e=>setSelectedLead(p=>({...p,draft:{...p.draft,to:e.target.value}}))} className="flex-1 p-2 border rounded text-sm bg-slate-50 font-mono" /></div>
                    <div className="flex gap-4"><label className="w-12 text-xs font-bold pt-2">Konu:</label><input value={selectedLead.draft.subject} onChange={e=>setSelectedLead(p=>({...p,draft:{...p.draft,subject:e.target.value}}))} className="flex-1 p-2 border rounded text-sm" /></div>
                    <textarea value={selectedLead.draft.body} onChange={e=>setSelectedLead(p=>({...p,draft:{...p.draft,body:e.target.value}}))} className="w-full h-64 p-3 border rounded text-sm resize-none" />
                </div>
                <div className="p-5 border-t flex justify-end gap-2">
                    <button onClick={handleSendMail} disabled={isSending} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2">{isSending ? 'Gönderiliyor...' : 'Gönder'}</button>
                </div>
            </div>
        </div>
    );
};