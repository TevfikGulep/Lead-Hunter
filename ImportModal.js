// ImportModal.js

// Bağımlılıklar: Icon, utils (cleanDomain, checkTraffic, findEmailsOnSite)

const { useState, useRef } = React;

window.ImportModal = ({ 
    isOpen, 
    onClose, 
    crmData, 
    dbInstance, 
    isDbConnected 
}) => {
    const [file, setFile] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const [logs, setLogs] = useState([]);
    const [importLanguage, setImportLanguage] = useState('TR');
    
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const addLog = (msg, type = 'info') => {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setLogs([]); // Yeni dosya seçildiğinde logları temizle
        }
    };

    const parseFileContent = async (file) => {
        const text = await file.text();
        const lines = text.split(/\r?\n/);
        const domains = [];

        // CSV veya TXT ayrımı
        if (file.name.endsWith('.csv')) {
            // Basit CSV parse: İlk kolonu veya 'website', 'domain', 'url' başlıklarını ara
            // utils.js'deki parseCSV fonksiyonunu kullanıyoruz
            const parsed = window.parseCSV(text);
            parsed.forEach(row => {
                // Olası kolon isimleri (büyük/küçük harf duyarsız)
                const keys = Object.keys(row);
                let domainVal = null;
                
                // Öncelikli başlıkları kontrol et
                const targetKeys = ['website', 'domain', 'url', 'site'];
                for (const k of keys) {
                    if (targetKeys.includes(k.toLowerCase())) {
                        domainVal = row[k];
                        break;
                    }
                }
                
                // Başlık bulunamazsa ilk kolonu al
                if (!domainVal && keys.length > 0) {
                    domainVal = row[keys[0]];
                }

                if (domainVal) domains.push(domainVal);
            });
        } else {
            // TXT: Her satır bir domain kabul edilir
            lines.forEach(line => {
                if (line.trim()) domains.push(line.trim());
            });
        }
        
        // Boşlukları temizle ve sadece benzersiz olanları döndür
        const uniqueDomains = [...new Set(domains.map(d => d.trim()).filter(d => d.length > 0))];
        return uniqueDomains;
    };

    const startImport = async () => {
        if (!file) return alert("Lütfen bir dosya seçin (.txt veya .csv)");
        if (!isDbConnected) return alert("Veritabanı bağlantısı yok. İşlem yapılamaz.");

        setIsImporting(true);
        setLogs([]);
        addLog("Dosya okunuyor ve analiz ediliyor...", "info");

        try {
            const rawDomains = await parseFileContent(file);
            const total = rawDomains.length;
            
            if (total === 0) {
                alert("Dosyada uygun domain bulunamadı.");
                setIsImporting(false);
                return;
            }

            addLog(`${total} adet satır bulundu. İşlem başlıyor...`, "info");
            setImportProgress({ current: 0, total });

            // Mevcut domainlerin temiz listesini (Set) oluştur - Hızlı mükerrer kontrolü için
            const existingDomains = new Set(crmData.map(lead => window.cleanDomain(lead.url)));

            let addedCount = 0;
            let skippedCount = 0;

            for (let i = 0; i < total; i++) {
                setImportProgress({ current: i + 1, total });
                const rawUrl = rawDomains[i];
                const cleanUrl = window.cleanDomain(rawUrl);

                // 1. Validasyon: Domain geçerli mi?
                if (!cleanUrl || cleanUrl.length < 4 || !cleanUrl.includes('.')) {
                    addLog(`${rawUrl}: Geçersiz format, atlandı.`, "warning");
                    continue;
                }

                // 2. Mükerrer Kontrolü: Veritabanında var mı?
                if (existingDomains.has(cleanUrl)) {
                    addLog(`${cleanUrl}: Sistemde zaten kayıtlı.`, "warning");
                    skippedCount++;
                    continue; // Döngüyü pas geç, bir sonrakine git
                }

                // 3. Veri Zenginleştirme (Trafik ve Email Taraması)
                addLog(`${cleanUrl}: Taranıyor...`, "info");
                
                let trafficData = { viable: false, label: 'Bilinmiyor', value: 0 };
                let emailData = '';

                // Trafik Kontrolü
                try {
                    const tCheck = await window.checkTraffic(cleanUrl);
                    if (tCheck && tCheck.label !== 'Hata') {
                        trafficData = tCheck;
                    }
                } catch (err) {
                    // Trafik hatası importu durdurmasın
                    console.error("Trafik hatası:", err);
                }

                // Email Kontrolü
                try {
                    const eCheck = await window.findEmailsOnSite(cleanUrl);
                    if (eCheck) {
                        emailData = eCheck;
                    }
                } catch (err) {
                    // Email hatası importu durdurmasın
                    console.error("Email hatası:", err);
                }

                // 4. Veritabanına Ekleme
                try {
                    const newLead = {
                        url: cleanUrl, // Temiz halini kaydet
                        email: emailData,
                        statusKey: 'New',
                        statusLabel: 'New',
                        stage: 0,
                        language: importLanguage,
                        trafficStatus: trafficData,
                        addedDate: new Date().toISOString(),
                        notes: `Toplu Liste Yükleme (${file.name}) ile eklendi.`,
                        activityLog: [{
                            date: new Date().toISOString(),
                            type: 'SYSTEM',
                            content: `İçe aktarıldı. Kaynak Dosya: ${file.name}`
                        }]
                    };

                    await dbInstance.collection("leads").add(newLead);
                    
                    const statusMsg = `Eklendi! (Trafik: ${trafficData.label}, Mail: ${emailData ? 'Var' : 'Yok'})`;
                    addLog(`${cleanUrl}: ${statusMsg}`, "success");
                    
                    addedCount++;
                    
                    // Ekledikten sonra bu oturum için existing set'e de ekle ki dosya içinde aynı domain 2 kere varsa ikincisini eklemesin
                    existingDomains.add(cleanUrl);

                } catch (saveErr) {
                    addLog(`${cleanUrl}: Kayıt hatası - ${saveErr.message}`, "error");
                }

                // API Rate limitlerini (istek sınırlarını) zorlamamak için her işlemden sonra kısa bekleme
                await new Promise(r => setTimeout(r, 500));
            }

            addLog(`İŞLEM TAMAMLANDI.`, "success");
            addLog(`Toplam: ${total} | Eklenen: ${addedCount} | Zaten Mevcut: ${skippedCount}`, "success");

        } catch (error) {
            addLog(`Kritik Hata: ${error.message}`, "error");
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-5 border-b flex justify-between items-center bg-indigo-50">
                    <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                        <window.Icon name="upload-cloud" className="w-5 h-5"/> Toplu Site Yükle
                    </h3>
                    {!isImporting && <button onClick={onClose}><window.Icon name="x" className="w-5 h-5 text-indigo-400"/></button>}
                </div>
                
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                    {!isImporting ? (
                        /* Yükleme Ekranı */
                        <div className="space-y-4">
                            <div 
                                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 hover:border-indigo-400 transition-colors cursor-pointer group" 
                                onClick={() => fileInputRef.current.click()}
                            >
                                <window.Icon name="file-spreadsheet" className="w-10 h-10 text-slate-300 group-hover:text-indigo-500 mx-auto mb-2 transition-colors"/>
                                <p className="text-sm font-bold text-slate-600 group-hover:text-indigo-600">
                                    {file ? file.name : "Dosya Seç (.txt veya .csv)"}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {file ? `${(file.size / 1024).toFixed(1)} KB` : "Her satırda bir domain olmalıdır."}
                                </p>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    accept=".csv,.txt" 
                                    className="hidden" 
                                />
                            </div>

                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <label className="block text-xs font-bold text-blue-800 mb-2">Eklenecek Sitelerin Varsayılan Dili</label>
                                <div className="flex gap-2">
                                    <button onClick={()=>setImportLanguage('TR')} className={`flex-1 py-2 text-xs font-bold rounded border transition-colors ${importLanguage==='TR'?'bg-white border-blue-300 text-blue-700 shadow-sm':'bg-blue-100/50 border-transparent text-blue-400'}`}>Türkçe (TR)</button>
                                    <button onClick={()=>setImportLanguage('EN')} className={`flex-1 py-2 text-xs font-bold rounded border transition-colors ${importLanguage==='EN'?'bg-white border-blue-300 text-blue-700 shadow-sm':'bg-blue-100/50 border-transparent text-blue-400'}`}>English (EN)</button>
                                </div>
                            </div>
                            
                            <div className="text-[10px] text-slate-400 leading-relaxed">
                                <strong className="text-slate-500">Not:</strong> Yüklenen listedeki siteler veritabanında zaten varsa otomatik olarak atlanır (mükerrer kayıt oluşmaz). Yeni sitelerin trafiği ve mail adresleri yükleme sırasında taranır.
                            </div>
                        </div>
                    ) : (
                        /* İşlem Ekranı (Progress) */
                        <div className="space-y-4">
                            <div className="text-center">
                                <div className="text-3xl font-bold text-indigo-600 mb-1">
                                    %{importProgress.total > 0 ? Math.round((importProgress.current/importProgress.total)*100) : 0}
                                </div>
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                    {importProgress.current} / {importProgress.total} Site İşlendi
                                </div>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden shadow-inner">
                                <div className="bg-indigo-600 h-full transition-all duration-300 ease-out" style={{width: `${(importProgress.current/importProgress.total)*100}%`}}></div>
                            </div>
                        </div>
                    )}

                    {/* LOG EKRANI (Her iki durumda da görünür ama boşsa gizli kalabilir) */}
                    <div className="h-48 bg-slate-900 rounded-xl p-4 custom-scrollbar overflow-y-auto console-log border border-slate-700 shadow-inner">
                        {logs.length === 0 && <div className="text-slate-600 italic text-center mt-16 text-xs">İşlem bekleniyor...</div>}
                        {logs.map((log, i) => (
                            <div key={i} className={`mb-1 text-[10px] font-mono border-b border-white/5 pb-0.5 ${log.type === 'success' ? 'text-green-400' : log.type === 'error' ? 'text-red-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-slate-300'}`}>
                                <span className="opacity-40 mr-2">[{log.time}]</span>
                                {log.msg}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t bg-slate-50 text-center">
                    {!isImporting ? (
                        <button 
                            onClick={startImport} 
                            disabled={!file}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <window.Icon name="play" className="w-4 h-4"/> Analiz Et ve Yükle
                        </button>
                    ) : (
                        <span className="text-xs font-bold text-indigo-600 animate-pulse flex items-center justify-center gap-2">
                            <window.Icon name="loader-2" className="w-4 h-4 animate-spin"/>
                            Siteler analiz ediliyor, lütfen bekleyiniz...
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};