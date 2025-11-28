// constants.js

// Sayfalama Ayarı
window.ITEMS_PER_PAGE = 50; 

// Arama Lokasyonları
window.SEARCH_COUNTRIES = [
    { code: 'tr', lang: 'tr', name: 'Türkiye 🇹🇷' },
    { code: 'us', lang: 'en', name: 'ABD (USA) 🇺🇸' },
    { code: 'gb', lang: 'en', name: 'Birleşik Krallık (UK) 🇬🇧' },
    { code: 'de', lang: 'de', name: 'Almanya 🇩🇪' },
    { code: 'fr', lang: 'fr', name: 'Fransa 🇫🇷' },
    { code: 'it', lang: 'it', name: 'İtalya 🇮🇹' },
    { code: 'es', lang: 'es', name: 'İspanya 🇪🇸' },
    { code: 'nl', lang: 'nl', name: 'Hollanda 🇳🇱' },
    { code: 'pl', lang: 'pl', name: 'Polonya 🇵🇱' },
    { code: 'ro', lang: 'ro', name: 'Romanya 🇷🇴' },
    { code: 'gr', lang: 'el', name: 'Yunanistan 🇬🇷' },
    { code: 'bg', lang: 'bg', name: 'Bulgaristan 🇧🇬' }
];

// Config dosyasından verileri al, yoksa varsayılanı kullan
	const FIRMA = (window.APP_CONFIG && window.APP_CONFIG.FIRMA_ADI) || "[FIRMA]";
	const ISIM = (window.APP_CONFIG && window.APP_CONFIG.KULLANICI_ISMI) || "[ISIM]";

// Lead Durumları
window.LEAD_STATUSES = {
    NO_REPLY: { label: 'No reply yet', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    ASKED_MORE: { label: 'Asked more', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    INTERESTED: { label: 'Showed interest', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    IN_PROCESS: { label: 'In process', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    DEAL_ON: { label: 'Deal On', color: 'bg-green-100 text-green-800 border-green-300 font-bold shadow-sm' },
    DENIED: { label: 'Denied', color: 'bg-red-50 text-red-700 border-red-200' },
    MAIL_ERROR: { label: 'Error in mail', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    NOT_VIABLE: { label: 'Not viable', color: 'bg-gray-200 text-gray-500 border-gray-300 decoration-line-through' },
    NOT_POSSIBLE: { label: 'Not Possible', color: 'bg-gray-300 text-gray-600 border-gray-400 decoration-line-through font-medium' },
    NON_RESPONSIVE: { label: 'Non Responsive', color: 'bg-orange-50 text-orange-700 border-orange-200' }
};

// Varsayılan İş Akışları (TR)
window.DEFAULT_WORKFLOW_TR = [
    { id: 0, label: 'İlk Temas', subject: '{{Website}} Reklam Partnerlik Hk.', body: `Merhabalar,\nBen ${FIRMA} ekibinde ${ISIM}.\n\nPolonya merkezli firmamızın Türkiye faaliyetlerine başlamasının ardından ilk görüşme gerçekleştirmek istediğimiz firmalardan birisi sizsiniz. İncelemelerimiz sırasında, {{Website}} sitenizde gözden kaçan önemli bir gelir fırsatı olduğunu fark ettik.\n\nGoogle Certified Publisher Partner olarak sizin gibi değerli yayıncıların mevcut reklam düzenlerine hiç dokunmadan, üzerine ek bir gelir katmanı daha inşa etmelerine yardımcı oluyoruz. Amacımız, mevcut ortaklarınızı değiştirmek değil, onlarla birlikte çalışarak toplam gelirinizi artırmaktır.\n\nBu fırsatı ve siteniz için özel olarak neler yapabileceğimizi konuşmak üzere, önümüzdeki hafta size uygun bir zamanda 15 dakikalık kısa bir online/telefon görüşmesi yapabilir miyiz?\n\nİyi çalışmalar dilerim.` },
    { id: 1, label: 'Takip 1 (Hatırlatma)', subject: '{{Website}} Reklam Partnerlik Hk.', body: `Merhabalar,\n\nGeçen haftaki e-postamla ilgili size ulaşıyorum, umarım her şey yolundadır. Yoğunluktan gözden kaçmış olabileceğini düşündüm.\n\nKısaca özetlemek gerekirse, {{Website}} için mevcut reklamlarınıza dokunmadan, üzerine ek bir gelir katmanı inşa etme fırsatından bahsetmiştim.\n\nSalı saat 11’de bir görüşme gerçekleştirebiliriz. Uygun değilseniz bildirebilirseniz sevinirim.\n\nSaygılarımla,` },
    { id: 2, label: 'Takip 2 (Potansiyel)', subject: '{{Website}} Reklam Partnerlik Hk.', body: `Merhabalar,\n\nSiteniz gibi yüksek trafiğe sahip yayıncılarla çalışırken sıkça gördüğümüz bir durum var: Mevcut reklam ortakları iyi gelir getirse bile, her zaman optimize edilebilecek ve ek gelir getirecek alanlar kalıyor.\n\nBizim uzmanlığımız da tam olarak bu üstüne düşülmemiş potansiyeli bulup ortaya çıkarmak. Amacımız, her bir ziyaretçiden elde ettiğiniz değeri en üst seviyeye çıkarmanıza yardımcı olmak.\n\nAynı zamanda ziyaretçileri boğmadan reklamlar oluşturuyoruz.\n\nBu potansiyeli size somut örneklerle anlatacağımız kısa bir görüşme yapmak isterim.\n\nSaygılarımla` },
    { id: 3, label: 'Takip 3 (İlişki)', subject: '{{Website}} Reklam Partnerlik Hk.', body: `Merhabalar,\n\nUmarım iyisinizdir. Tekrar yazmamın sebebi, bizim çalışma şeklimizin sadece teknolojiyle ilgili olmadığını vurgulamak.\n\nBizim için her yayıncıyla kurulan ilişki çok değerli. Otomatik sistemlerin aksine, sizinle birebir iletişimde kalarak, stratejiyi birlikte çizerek ve yol boyunca omuz omuza çalışarak ilerlemeyi tercih ediyoruz.\n\nGelir stratejinizi optimize etmek şu anki öncelikleriniz arasında yer alıyor mu?\n\nİyi çalışmalar,` },
    { id: 4, label: 'Takip 4 (Kısa Kontrol)', subject: '{{Website}} Reklam Partnerlik Hk.', body: `Merhaba,\n\nVaktinizi almak istemem, bu yüzden doğrudan soracağım: Acaba mevcut reklam gelirlerinizi artırma konusu şu an için gündeminizde değil mi?\n\nEğer zamanlama uygun değilse hiç sorun değil. Sadece siteniz için masada duran ve kolayca hayata geçirilebilecek bir fırsat olduğunu düşündüğüm için haber vermek istedim.\n\nBu konuyu değerlendirmek zamanınız var mı acaba?\n\nSaygılarımla,` },
    { id: 5, label: 'Takip 5 (Veda & Anket)', subject: '{{Website}} Reklam Partnerlik Hk.', body: `Merhaba,\n\nSizden bir geri dönüş alamayınca, bu konunun şu an için önceliğiniz olmadığını anlıyorum.\n\nYoğunluğunuza ve mevcut planlarınıza tamamen saygı duyuyorum. Bu nedenle, bu konuyla ilgili size daha fazla ileti göndermeyeceğim. Eğer ileride şartlar değişir ve bu konu tekrar gündeminize gelirse, bir e-posta uzağınızda olduğumu bilmenizi isterim.\n\nSadece kendi yaklaşımımı geliştirebilmem adına bir yardım istiyorum. Durumunuzu en iyi anlatan harfi yanıt olarak göndermeniz benim için harika bir geri bildirim olur.\n\nA - Konuyla ilgileniyorum ama şu an çok yoğunum. Gelecek hafta tekrar iletişime geçin.\nB - İş birliği hakkında daha fazla detay almak isterim. \nC - Şu anda yeni bir iş birliğine açık değiliz. Gelecek ay tekrar ulaşabilirsiniz. \nD - Halihazırda benzer firmalarla çalışıyoruz. \nE - E-postalarınız spam (gereksiz) klasörüne düşmüş. Lütfen teklifinizi tekrar gönderir misiniz?\n\nŞimdiden teşekkür ederim.\nSize ve {{Website}} ekibine çalışmalarınızda başarılar dilerim.` }
];

// Varsayılan İş Akışları (EN)
window.DEFAULT_WORKFLOW_EN = [
    { id: 0, label: 'First Contact', subject: 'Partnership Opportunity for {{Website}}', body: `Hello,\nI am ${ISIM} from the ${FIRMA} team.\n\nFollowing the start of our Poland-based company's activities in the region, yours is one of the first publishers we wanted to contact. During our review, we noticed a significant revenue opportunity on {{Website}} that might be overlooked.\n\nAs a Google Certified Publisher Partner, we help valuable publishers like you build an additional revenue layer without touching your existing ad layout. Our goal is not to replace your current partners, but to work alongside them to increase your total revenue.\n\nCould we have a short 15-minute online call next week to discuss this opportunity and what we can do specifically for your site?\n\nBest regards.` },
    { id: 1, label: 'Follow-up 1 (Reminder)', subject: 'Partnership Opportunity for {{Website}}', body: `Hello,\n\nI am following up on my email from last week, I hope everything is going well. I thought it might have been overlooked due to your busy schedule.\n\nTo briefly summarize, I mentioned an opportunity to build an additional revenue layer for {{Website}} without touching your existing ads.\n\nWe could schedule a meeting for Tuesday at 11 AM. Please let me know if that works for you.\n\nBest regards.` },
    { id: 2, label: 'Follow-up 2', subject: 'Partnership Opportunity for {{Website}}', body: `Hello, check 2...` }, 
    { id: 3, label: 'Follow-up 3', subject: 'Partnership Opportunity for {{Website}}', body: `Hello, check 3...` },
    { id: 4, label: 'Follow-up 4', subject: 'Partnership Opportunity for {{Website}}', body: `Hello, check 4...` },
    { id: 5, label: 'Follow-up 5', subject: 'Partnership Opportunity for {{Website}}', body: `Hello, check 5...` }
];