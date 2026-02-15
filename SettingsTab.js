// SettingsTab.js

window.SettingsTab = ({
    settings,
    handleSettingChange,
    saveSettingsToCloud,
    showSignatureHtml,
    setShowSignatureHtml,
    fixHtmlCode,
    fixAllTrafficData,
    activeTemplateLang,
    setActiveTemplateLang,
    activeTemplateIndex,
    setActiveTemplateIndex,
    updateWorkflowStep
}) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-10">
            {/* API Settings */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold mb-6 flex items-center gap-2"><window.Icon name="globe" className="w-5 h-5 text-blue-600" /> API & İmza Ayarları</h3>
                <div className="space-y-4">
                    <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-xs mb-4 border border-blue-200">
                        <strong>Güvenlik Uyarısı:</strong> API anahtarları artık kodun içinde saklanmamaktadır.
                        Lütfen aşağıdaki alanları doldurup "Veritabanına Kaydet" butonuna basınız.
                    </div>
                    <div><label className="block text-xs font-bold mb-1">Google Search API Key</label><input type="text" value={settings.googleApiKey} onChange={e => handleSettingChange('googleApiKey', e.target.value)} className="w-full p-2 border rounded" placeholder="Veritabanından çekiliyor..." /></div>
                    <div><label className="block text-xs font-bold mb-1">Search Engine ID (CX)</label><input type="text" value={settings.searchEngineId} onChange={e => handleSettingChange('searchEngineId', e.target.value)} className="w-full p-2 border rounded" placeholder="Veritabanından çekiliyor..." /></div>
                    <div><label className="block text-xs font-bold mb-1">Google Apps Script URL</label><input type="text" value={settings.googleScriptUrl} onChange={e => handleSettingChange('googleScriptUrl', e.target.value)} className="w-full p-2 border rounded" placeholder="Veritabanından çekiliyor..." /></div>

                    <button onClick={saveSettingsToCloud} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg mt-2 flex items-center justify-center gap-2 transition-colors">
                        <window.Icon name="cloud" className="w-4 h-4" /> Ayarları Veritabanına (Buluta) Kaydet
                    </button>

                    <div className="pt-4 border-t">
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-bold">Profesyonel İmza Editörü</label>
                            <div className="flex gap-2">
                                {showSignatureHtml && (
                                    <button
                                        onClick={() => handleSettingChange('signature', '')}
                                        className="text-[10px] text-red-600 hover:text-red-800 font-bold"
                                    >
                                        Temizle
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowSignatureHtml(!showSignatureHtml)}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline"
                                >
                                    {showSignatureHtml ? 'Görsel Editöre Dön (Önerilmez)' : 'HTML Kodunu Düzenle (Gelişmiş)'}
                                </button>
                            </div>
                        </div>

                        {showSignatureHtml ? (
                            <textarea
                                value={settings.signature}
                                onChange={(e) => handleSettingChange('signature', e.target.value)}
                                className="w-full h-48 p-3 border border-slate-300 rounded-lg text-xs font-mono bg-slate-900 text-green-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="HTML kodunuzu buraya yapıştırın. Örn: <table>...</table>"
                            />
                        ) : (
                            <window.SignatureEditor
                                value={settings.signature}
                                onChange={(html) => handleSettingChange('signature', html)}
                            />
                        )}

                        {/* HTML Preview Area for Debugging */}
                        <div className="mt-4 p-4 border border-slate-200 rounded-lg bg-white">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">İmza Önizleme (Gönderilecek Hali)</div>
                            <div
                                className="prose prose-sm max-w-none border p-2 rounded border-dashed border-slate-300 overflow-x-auto"
                                dangerouslySetInnerHTML={{ __html: settings.signature }}
                            />
                            {settings.signature && (settings.signature.includes('&lt;') || settings.signature.includes('&gt;')) && (
                                <div className="mt-2 bg-yellow-50 p-2 rounded text-xs text-yellow-800 flex items-center gap-2">
                                    <window.Icon name="alert-triangle" className="w-4 h-4 text-yellow-600" />
                                    <span>Uyarı: İmza kodunuz bozulmuş (escape edilmiş) görünüyor.</span>
                                    <button onClick={fixHtmlCode} className="px-2 py-1 bg-yellow-600 text-white rounded font-bold hover:bg-yellow-700 ml-auto">⚠️ Kodu Onar (Unescape)</button>
                                </div>
                            )}
                        </div>

                        <div className="mt-2 text-[10px] text-slate-400">
                            Not: İmzanızdaki tabloların ve resimlerin bozulmaması için "HTML Kodunu Düzenle" modunu kullanın. Kutudaki kod karışık görünüyorsa "Temizle" diyip tekrar yapıştırın.
                        </div>
                    </div>

                    {/* --- MAINTENANCE TOOLS SECTION --- */}
                    <div className="pt-4 border-t space-y-2">
                        <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2"><window.Icon name="wrench" className="w-3 h-3" /> Veritabanı Bakım Araçları</h4>

                        <button
                            onClick={fixAllTrafficData}
                            className="w-full text-left px-3 py-2 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:text-indigo-700 transition-colors flex items-center gap-2"
                        >
                            <window.Icon name="bar-chart-2" className="w-4 h-4 text-indigo-500" />
                            Trafik Verilerini Sayısala Çevir & Düzelt (Örn: 150k &rarr; 150000)
                        </button>
                    </div>
                </div>
            </div>

            {/* Mail Templates Editor */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold mb-6 flex items-center gap-2"><window.Icon name="edit-3" className="w-5 h-5 text-purple-600" /> Mail Şablonları</h3>

                <div className="flex gap-2 mb-4">
                    <button onClick={() => setActiveTemplateLang('TR')} className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeTemplateLang === 'TR' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>Türkçe</button>
                    <button onClick={() => setActiveTemplateLang('EN')} className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeTemplateLang === 'EN' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>English</button>
                </div>

                <div className="flex gap-2 mb-4 overflow-x-auto pb-2 custom-scrollbar">
                    {(activeTemplateLang === 'EN' ? settings.workflowEN : settings.workflowTR).map((step, idx) => (
                        <button
                            key={step.id}
                            onClick={() => setActiveTemplateIndex(idx)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap border transition-colors ${activeTemplateIndex === idx ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        >
                            {idx + 1}. {step.label.split('(')[0]}
                        </button>
                    ))}
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Aşama Adı</label>
                        <input
                            type="text"
                            value={(activeTemplateLang === 'EN' ? settings.workflowEN : settings.workflowTR)[activeTemplateIndex]?.label || ''}
                            onChange={e => updateWorkflowStep(activeTemplateIndex, 'label', e.target.value)}
                            className="w-full p-2 border rounded text-sm font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Konu</label>
                        <input
                            type="text"
                            value={(activeTemplateLang === 'EN' ? settings.workflowEN : settings.workflowTR)[activeTemplateIndex]?.subject || ''}
                            onChange={e => updateWorkflowStep(activeTemplateIndex, 'subject', e.target.value)}
                            className="w-full p-2 border rounded text-sm font-bold"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">İçerik</label>
                        <textarea
                            value={(activeTemplateLang === 'EN' ? settings.workflowEN : settings.workflowTR)[activeTemplateIndex]?.body || ''}
                            onChange={e => updateWorkflowStep(activeTemplateIndex, 'body', e.target.value)}
                            className="w-full h-64 p-3 border rounded text-sm resize-none leading-relaxed focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                    <p className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded">İpucu: <code>{`{{Website}}`}</code> etiketi gönderim sırasında otomatik olarak site adıyla değiştirilir.</p>
                </div>
            </div>
        </div >
    );
};