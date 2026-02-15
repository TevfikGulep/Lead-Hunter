// BulkModal.js

// Bağımlılık: Icon bileşeni (Icon.js) gereklidir.

// --- BULK MODAL ---
window.BulkModal = ({ isBulkSending, bulkProgress, selectedCount, bulkConfig, setBulkConfig, activeTab, settings, executeBulkSend, executeBulkPromotion, close, setShowBulkModal }) => {
    const promoTemplate = activeTab === 'hunter'
        ? (bulkConfig.language === 'EN' ? settings.promotionTemplateEN : settings.promotionTemplateTR)
        : settings.promotionTemplateTR;

    return (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-5 border-b flex justify-between items-center bg-indigo-50">
                    <h3 className="font-bold text-indigo-900 flex items-center gap-2"><window.Icon name="mails" className="w-5 h-5" /> Toplu Gönderim ({selectedCount})</h3>
                    {!isBulkSending && <button onClick={() => setShowBulkModal(false)}><window.Icon name="x" className="w-5 h-5 text-indigo-400" /></button>}
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    {!isBulkSending ? (
                        <>
                            <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg text-xs text-yellow-800 flex gap-2"><window.Icon name="alert-triangle" className="w-4 h-4 shrink-0" /><p>Seçilen <strong>{selectedCount}</strong> kişiye işlem yapılacak. Spam riskini önlemek için her mail arası 2 saniye beklenecektir.</p></div>

                            {/* Gönderim Tipi Seçimi */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-2">Gönderim Tipi</label>
                                <div className="grid grid-cols-3 gap-3">
                                    <button onClick={() => setBulkConfig(p => ({ ...p, templateType: 'AUTO' }))} className={`p-3 rounded-xl border text-left transition-all ${bulkConfig.templateType === 'AUTO' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><div className="font-bold text-sm mb-1">Otomatik</div><div className="text-[10px] opacity-80">Sıradaki aşama</div></button>
                                    <button onClick={() => setBulkConfig(p => ({ ...p, templateType: 'SPECIFIC' }))} className={`p-3 rounded-xl border text-left transition-all ${bulkConfig.templateType === 'SPECIFIC' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><div className="font-bold text-sm mb-1">Şablon</div><div className="text-[10px] opacity-80">Tek tip şablon</div></button>
                                    <button onClick={() => setBulkConfig(p => ({ ...p, templateType: 'PROMOTION' }))} className={`p-3 rounded-xl border text-left transition-all ${bulkConfig.templateType === 'PROMOTION' ? 'bg-gradient-to-r from-pink-500 to-rose-500 border-pink-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-pink-50'}`}><div className="font-bold text-sm mb-1 flex items-center gap-1"><window.Icon name="gift" className="w-3 h-3" />Promosyon</div><div className="text-[10px] opacity-80">Özel kampanya</div></button>
                                </div>
                            </div>

                            {/* Şablon Seçimi (Otomatik veya Spesifik) */}
                            {bulkConfig.templateType === 'SPECIFIC' && (
                                <div className="animate-in fade-in">
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Şablon Seç</label>
                                    <select value={bulkConfig.specificStage} onChange={(e) => setBulkConfig(p => ({ ...p, specificStage: e.target.value }))} className="w-full p-2 border rounded-lg text-sm bg-slate-50">
                                        {(bulkConfig.language === 'EN' ? settings.workflowEN : settings.workflowTR).map((s, i) => <option key={i} value={i}>{i + 1}. {s.label}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Promosyon Şablonu Düzenleme Alanı */}
                            {bulkConfig.templateType === 'PROMOTION' && (
                                <div className="animate-in fade-in space-y-3 bg-pink-50 p-4 rounded-xl border border-pink-200">
                                    <div className="flex items-center gap-2 text-pink-700 font-bold text-sm">
                                        <window.Icon name="gift" className="w-4 h-4" />
                                        Promosyon Maili - Özelleştir
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-pink-600 mb-1">Konu</label>
                                        <input
                                            type="text"
                                            value={bulkConfig.promotionSubject || promoTemplate?.subject || ''}
                                            onChange={(e) => setBulkConfig(p => ({ ...p, promotionSubject: e.target.value }))}
                                            className="w-full p-2 border border-pink-300 rounded-lg text-sm"
                                            placeholder="Konu girin..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-pink-600 mb-1">İçerik</label>
                                        <textarea
                                            value={bulkConfig.promotionBody || promoTemplate?.body || ''}
                                            onChange={(e) => setBulkConfig(p => ({ ...p, promotionBody: e.target.value }))}
                                            className="w-full h-32 p-2 border border-pink-300 rounded-lg text-sm resize-none"
                                            placeholder="Mail içeriğini yazın..."
                                        />
                                    </div>
                                    <p className="text-[10px] text-pink-600">İpucu: <code>{`{{Website}}`}</code> etiketi otomatik olarak site adıyla değiştirilir.</p>
                                </div>
                            )}

                            {activeTab === 'hunter' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Veritabanı Dili</label>
                                    <div className="flex gap-2">
                                        <button onClick={() => setBulkConfig(p => ({ ...p, language: 'TR' }))} className={`flex-1 py-1 text-xs font-bold rounded border ${bulkConfig.language === 'TR' ? 'bg-red-50 text-red-600' : 'bg-white'}`}>Türkçe</button>
                                        <button onClick={() => setBulkConfig(p => ({ ...p, language: 'EN' }))} className={`flex-1 py-1 text-xs font-bold rounded border ${bulkConfig.language === 'EN' ? 'bg-blue-50 text-blue-600' : 'bg-white'}`}>İngilizce</button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="text-center"><div className="text-2xl font-bold text-indigo-600">%{Math.round((bulkProgress.current / bulkProgress.total) * 100)}</div><div className="text-xs text-slate-500">{bulkProgress.current} / {bulkProgress.total}</div></div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden"><div className="bg-indigo-600 h-full transition-all duration-300" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}></div></div>
                            <div className="h-40 overflow-y-auto bg-slate-900 rounded-lg p-3 text-[10px] font-mono text-green-400 space-y-1 custom-scrollbar">{bulkProgress.logs.map((log, i) => <div key={i} className={log.success ? 'text-green-400' : 'text-red-400'}>{log.msg}</div>)}</div>
                        </div>
                    )}
                </div>
                <div className="p-5 border-t bg-slate-50 flex justify-end">
                    {!isBulkSending && (
                        bulkConfig.templateType === 'PROMOTION' ? (
                            <button onClick={executeBulkPromotion} className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2">
                                <window.Icon name="gift" className="w-4 h-4" /> Promosyon Gönder
                            </button>
                        ) : (
                            <button onClick={executeBulkSend} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2">
                                <window.Icon name="send" className="w-4 h-4" /> Başlat
                            </button>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};
