// SettingsTab.js

window.SettingsTab = ({
    settings,
    handleSettingChange,
    saveSettingsToCloud,
    resetHunterProgress,
    showSignatureHtml,
    setShowSignatureHtml,
    fixHtmlCode,
    activeTemplateLang,
    setActiveTemplateLang,
    activeTemplateIndex,
    setActiveTemplateIndex,
    updateWorkflowStep,
    updatePromotionTemplate,
    openPromotionModal,
    runAutoHunterScan,
    stopAutoHunterScan,
    isHunterRunning,
    autoHunterLogs,
    autoHunterStats,
    autoHunterLogsEndRef,
    fixLeadConsistency
}) => {
    // Otomatik tarama logları güncellendiğinde otomatik kaydır
    React.useEffect(() => {
        if (autoHunterLogsEndRef && autoHunterLogsEndRef.current) {
            autoHunterLogsEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [autoHunterLogs]);
    const [saveMsg, setSaveMsg] = React.useState('');

    const handleSaveIlceIndex = async () => {
        setSaveMsg('...');
        try {
            const ok = await saveSettingsToCloud({ lastHunterIlceIndex: settings.lastHunterIlceIndex });
            setSaveMsg(ok === true ? 'ok' : 'err');
        } catch (e) {
            setSaveMsg('err');
        }
        setTimeout(() => setSaveMsg(''), 3000);
    };

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
                    <div className="mt-4">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Webhook URL (Slack/Discord)</label>
                        <input type="text" className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none text-sm" placeholder="https://hooks.slack.com/services/..." value={settings.webhookUrl || ''} onChange={e => handleSettingChange('webhookUrl', e.target.value)} />
                        <p className="text-xs text-slate-400 mt-1">Slack veya Discord webhook URL. Yeni cevaplar ve haftalık özetler gönderilir.</p>
                    </div>

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

            {/* Promosyon Şablonu Editor */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold mb-6 flex items-center gap-2"><window.Icon name="gift" className="w-5 h-5 text-pink-500" /> Promosyon Şablonu</h3>

                <p className="text-xs text-slate-500 mb-4 bg-pink-50 p-3 rounded-lg border border-pink-100">
                    Özel promosyonlarınız için bu şablonu kullanabilirsiniz. CRM tablosunda her satırda pembe "hediye" butonuna tıklayarak bu şablonu gönderebilirsiniz.
                </p>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Aşama Adı</label>
                        <input
                            type="text"
                            value={(activeTemplateLang === 'EN' ? settings.promotionTemplateEN : settings.promotionTemplateTR)?.label || ''}
                            onChange={e => updatePromotionTemplate('label', e.target.value)}
                            className="w-full p-2 border rounded text-sm font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Konu</label>
                        <input
                            type="text"
                            value={(activeTemplateLang === 'EN' ? settings.promotionTemplateEN : settings.promotionTemplateTR)?.subject || ''}
                            onChange={e => updatePromotionTemplate('subject', e.target.value)}
                            className="w-full p-2 border rounded text-sm font-bold"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">İçerik</label>
                        <textarea
                            value={(activeTemplateLang === 'EN' ? settings.promotionTemplateEN : settings.promotionTemplateTR)?.body || ''}
                            onChange={e => updatePromotionTemplate('body', e.target.value)}
                            className="w-full h-48 p-3 border rounded text-sm resize-none leading-relaxed focus:ring-2 focus:ring-pink-500 outline-none"
                        />
                    </div>
                    <p className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded">İpucu: <code>{`{{Website}}`}</code> etiketi gönderim sırasında otomatik olarak site adıyla değiştirilir.</p>
                </div>
            </div>

            {/* Otomatik Takip Sistemi (Mevcut Workflow Kullanır) */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold mb-6 flex items-center gap-2"><window.Icon name="clock" className="w-5 h-5 text-orange-500" /> Otomatik Takip Sistemi</h3>

                <p className="text-xs text-slate-500 mb-4 bg-orange-50 p-3 rounded-lg border border-orange-100">
                    <strong>Otomatik Takip Sistemi:</strong> Seçtiğiniz lead'lere 7 gün aralıklarla otomatik takip maili gönderilir.
                    <br/>Sistem mevcut <strong>workflow şablonlarını</strong> (İlk Temas → Takip 1 → Takip 2 → ...) sırayla kullanır.
                    <br/>Cevap geldiğinde (INTERESTED, IN_PROCESS vb.) sistem otomatik olarak durur.
                </p>

                <div className="space-y-3">
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-xs font-bold text-slate-600 mb-2">Kullanılacak Şablonlar:</div>
                        <div className="flex flex-wrap gap-2">
                            {(activeTemplateLang === 'EN' ? settings.workflowEN : settings.workflowTR).slice(0, 6).map((step, idx) => (
                                <span key={idx} className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600">
                                    {idx + 1}. {step.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-400">
                        Not: Otomatik takip, mevcut workflow şablonlarını sırayla kullanır (İlk Temas → Takip 1 → Takip 2 → Takip 3 → Takip 4 → Takip 5).
                        Her 7 günde bir bir sonraki şablona geçer.
                    </p>
                </div>
            </div>

            {/* Site Avcısı Otomasyon Ayarları */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
                <h3 className="font-bold mb-6 flex items-center gap-2"><window.Icon name="radar" className="w-5 h-5 text-indigo-600" /> Site Avcısı Otomasyonu</h3>

                <p className="text-xs text-slate-500 mb-4 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <strong>Otomatik Tarama Sistemi:</strong> Her pazartesi saat 07:00'de Türkiye ilçelerinden haber siteleri arar.
                    Her hafta en az {settings.hunterTargetCount || 100} uygun site buluncaya kadar tarar ve otomatik CRM'e ekler.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Haftalık Hedef (Site Sayısı)</label>
                        <input
                            type="number"
                            min="10"
                            max="500"
                            value={settings.hunterTargetCount || 100}
                            onChange={e => handleSettingChange('hunterTargetCount', parseInt(e.target.value) || 100)}
                            className="w-full p-2 border rounded text-sm"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Her hafta en az kaç uygun site bulunsun?</p>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1">Türkiye İlçe Listesi</label>
                        <textarea
                            value={settings.ilceListesi || ''}
                            onChange={e => handleSettingChange('ilceListesi', e.target.value)}
                            className="w-full h-40 p-3 border rounded text-sm resize-none"
                            placeholder={`Kadıköy, İstanbul\nBeşiktaş, İstanbul\nNilüfer, Bursa\nKonyaaltı, Antalya\n...`}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Her satıra bir ilçe yazın. Format: "İlçe, İl" (örn: Kadıköy, İstanbul)</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={settings.autoHunterEnabled || false}
                                onChange={e => handleSettingChange('autoHunterEnabled', e.target.checked)}
                                className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-bold text-slate-700">Otomatik Taramayı Aktif Et</span>
                        </label>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Son Tarama</label>
                        <div className="p-2 bg-slate-50 rounded text-sm text-slate-600">
                            {settings.lastHunterRunDate
                                ? new Date(settings.lastHunterRunDate).toLocaleString('tr-TR')
                                : 'Henüz çalıştırılmadı'}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] text-slate-400 whitespace-nowrap">Son çalışılan ilçe #:</p>
                            <input
                                type="number" min="0"
                                value={settings.lastHunterIlceIndex || 0}
                                onChange={e => handleSettingChange('lastHunterIlceIndex', parseInt(e.target.value) || 0)}
                                className="w-16 px-1 py-0.5 border border-slate-300 rounded text-xs text-center"
                            />
                            <button
                                onClick={handleSaveIlceIndex}
                                className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${saveMsg === 'ok' ? 'bg-green-500 text-white' : saveMsg === 'err' ? 'bg-red-400 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >{saveMsg === 'ok' ? '✓ Kaydedildi' : saveMsg === 'err' ? '✗ Bağlantı Yok' : saveMsg === '...' ? '...' : 'Kaydet'}</button>
                        </div>
                        <button
                            onClick={() => {
                                if (confirm('İlçe indeksi sıfırlanacak! Tarama en baştan başlayacak. Onaylıyor musunuz?')) {
                                    resetHunterProgress();
                                }
                            }}
                            className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-bold"
                        >
                            🔄 İlçe İndeksini Sıfırla
                        </button>
                    </div>

                    {/* Manuel Başlat Butonu */}
                    <div className="md:col-span-2 mt-4">
                        <label className="block text-xs font-bold text-slate-500 mb-2">Manuel Çalıştırma</label>
                        <div className="flex gap-3">
                            {!isHunterRunning ? (
                                <button 
                                    onClick={() => {
                                        if (confirm('Otomatik tarama başlatılacak. Devam edilsin mi?')) {
                                            runAutoHunterScan();
                                        }
                                    }}
                                    disabled={!settings.ilceListesi || settings.ilceListesi.trim().length === 0}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-colors ${
                                        settings.ilceListesi && settings.ilceListesi.trim().length > 0
                                        ? 'bg-indigo-600 hover:bg-indigo-700' 
                                        : 'bg-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    <window.Icon name="play" className="w-5 h-5" />
                                    Tararmayı Manuel Başlat
                                </button>
                            ) : (
                                <button 
                                    onClick={() => {
                                        if (confirm('Tarama durdurulacak. Devam edilsin mi?')) {
                                            stopAutoHunterScan();
                                        }
                                    }}
                                    className="flex-1 py-3 px-4 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2 transition-colors"
                                >
                                    <window.Icon name="square" className="w-5 h-5" />
                                    Tararmayı Durdur
                                </button>
                            )}
                        </div>
                        {isHunterRunning && (
                            <p className="text-xs text-amber-600 mt-2 text-center animate-pulse">
                                ⏳ Tarama çalışıyor... Tarayıcıyı kapatmayın.
                            </p>
                        )}
                    </div>

                    {/* CANLI TARAMA LOGU */}
                    {(autoHunterLogs && autoHunterLogs.length > 0) && (
                        <div className="md:col-span-2 mt-4">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-bold text-slate-500">
                                    📡 Canlı Tarama Logu {isHunterRunning && <span className="text-green-600">● Aktif</span>}
                                </label>
                                <span className="text-[10px] text-slate-400">{autoHunterLogs.length} satır</span>
                            </div>
                            <div className="bg-slate-900 text-slate-200 rounded-lg p-3 h-64 overflow-y-auto font-mono text-[11px] leading-relaxed border border-slate-700">
                                {autoHunterLogs.map((log, idx) => {
                                    const color =
                                        log.type === 'success' ? 'text-emerald-400' :
                                        log.type === 'warn' ? 'text-amber-400' :
                                        log.type === 'error' ? 'text-red-400' :
                                        'text-slate-300';
                                    return (
                                        <div key={idx} className={`${color} whitespace-pre-wrap break-words`}>
                                            <span className="text-slate-500 mr-2">[{log.time}]</span>
                                            {log.message}
                                        </div>
                                    );
                                })}
                                <div ref={autoHunterLogsEndRef} />
                            </div>

                            {/* CANLI İSTATİSTİK */}
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Bulunan Site</div>
                                    <div className="text-2xl font-bold text-blue-800 mt-1">{autoHunterStats?.totalFound || 0}</div>
                                </div>
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                    <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Tam Veriye Sahip</div>
                                    <div className="text-2xl font-bold text-emerald-800 mt-1">{autoHunterStats?.fullData || 0}</div>
                                    <div className="text-[9px] text-emerald-600 mt-0.5">(Trafik + Email var)</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-800">
                        <strong>Nasıl Çalışır:</strong> Her pazartesi 07:00'de otomatik başlar.
                        İlçe listesinden sırayla "haberleri", "son dakika", "güncel", "haber", "gazete" kelimeleriyle arama yapar.
                        Her arama sonucu trafiği kontrol edilir ve uygun siteler (trafik büyüktür 0) CRM'e "New" olarak eklenir.
                        {settings.hunterTargetCount || 100} site bulunduktan sonra o hafta durur, bir sonraki hafta kaldığı yerden devam eder.
                    </p>
                </div>
            </div>

            {/* Veri Bakım */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
                <h3 className="font-bold mb-4 flex items-center gap-2"><window.Icon name="tool" className="w-5 h-5 text-slate-600" /> Veri Bakım</h3>
                <p className="text-xs text-slate-500 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    Tutarsız verileri düzeltir: Mail gönderilmiş/okunmuş ama hâlâ "New" durumunda olan lead'leri "No Reply" olarak günceller.
                    Bounce kaydı olan ama "Error in Mail" olarak işaretlenmemiş lead'leri düzeltir.
                </p>
                <button
                    onClick={fixLeadConsistency}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
                >
                    <window.Icon name="refresh-cw" className="w-4 h-4" /> Veri Tutarlılığını Düzelt
                </button>
            </div>
        </div >
    );
};
