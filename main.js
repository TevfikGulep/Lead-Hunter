// main.js

// React uygulamasını DOM'a monte etme işlemi
// ÖNEMLİ: Bu dosya, diğer tüm bileşen dosyalarından (components.js, LeadHunter.js vb.) SONRA yüklenmelidir.

const root = ReactDOM.createRoot(document.getElementById('root'));

// LeadHunter bileşenini bul (Global scope veya window üzerinden)
const AppEntry = window.LeadHunter || (typeof LeadHunter !== 'undefined' ? LeadHunter : null);

if (AppEntry) {
    root.render(React.createElement(AppEntry));
} else {
    console.error("KRİTİK HATA: 'LeadHunter' ana bileşeni bulunamadı. Lütfen index.html içindeki script sıralamasını kontrol edin.");
    document.getElementById('root').innerHTML = '<div style="color:red; padding:20px; font-family:sans-serif;"><h3>Başlatma Hatası</h3><p>Ana uygulama bileşeni yüklenemedi. Console loglarını kontrol ediniz.</p></div>';
}