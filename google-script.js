//google script dosyası

function doPost(e) {
  try {
    // Veriyi güvenli parse et
    var content = e.postData ? e.postData.contents : "{}";
    var data = JSON.parse(content);
    var myEmail = Session.getActiveUser().getEmail();

    // Action kontrolü
    if (!data.action) {
      return createJSON({ 'status': 'error', 'message': 'Action belirtilmedi.' });
    }

    // --- 1. CEVAP KONTROL ---
    if (data.action === 'check_reply') {
      if (!data.threadId) return createJSON({ 'status': 'error', 'message': 'Thread ID yok' });
      return createJSON({ 'status': 'success', ...checkSingleThread(data.threadId, myEmail) });
    }

    // --- 2. TOPLU KONTROL ---
    else if (data.action === 'check_replies_bulk') {
      var results = {};
      var foundCount = 0;
      var bounceCount = 0;
      var ids = data.threadIds || [];
      
      for (var i = 0; i < ids.length; i++) {
        try {
          var check = checkSingleThread(ids[i], myEmail);
          if (check.hasReply) {
             results[ids[i]] = check;
             check.isBounce ? bounceCount++ : foundCount++;
          }
        } catch (err) {}
      }
      return createJSON({ 'status': 'success', 'results': results, 'foundCount': foundCount, 'bounceCount': bounceCount });
    }

    // --- 3. MAIL GÖNDERME ---
    else if (data.action === 'send_mail') {
        
        var rawTo = data.to;
        var cleanTo = "";

        // Alıcı adresi temizliği
        if (rawTo && typeof rawTo === 'string' && rawTo.trim().length > 0) {
            cleanTo = rawTo.trim();
        }

        // KRİTİK KONTROL: Alıcı yoksa işlemi durdur.
        if (cleanTo === "") {
            return createJSON({ 
                'status': 'error', 
                'message': 'Mail gönderilemedi: Alıcı adresi (to) boş veya geçersiz.' 
            });
        }

        var subject = data.subject || "(Konu Yok)";
        var body = data.body || "";
        var htmlBody = data.htmlBody || body;
        var threadId = data.threadId;
        var resultThreadId = null;

        // Thread ID varsa işlem yap
        if (threadId) {
          try {
            var thread = GmailApp.getThreadById(threadId);
            if (thread) {
                // --- THREADING (GRUPLAMA) İÇİN KRİTİK DÜZELTME ---
                // Gmail'in mailleri aynı zincirde tutması için konu başlığının (Subject)
                // karakteri karakterine aynı olması gerekir. Şablondan gelen konu bazen
                // farklı olabilir. Bu yüzden mevcut thread'in konusunu alıp onu kullanıyoruz.
                var threadSubject = thread.getFirstMessageSubject();
                if (threadSubject && threadSubject !== "") {
                   subject = threadSubject; 
                }

                var messages = thread.getMessages();
                var myEmailLower = myEmail.toLowerCase();
                
                // Müşteriden gelen bir mesaj var mı diye bak
                var msgFromCustomer = null;
                // Sondan başa doğru tara
                for (var k = messages.length - 1; k >= 0; k--) {
                     // Eğer gönderen ben değilsem, müşteridir.
                     if (messages[k].getFrom().toLowerCase().indexOf(myEmailLower) === -1) {
                         msgFromCustomer = messages[k];
                         break;
                     }
                }

                if (msgFromCustomer) {
                    // DURUM A: Müşteriden bir mesaj var (Cevap vermiş).
                    // O zaman doğrudan o mesaja 'reply' atıyoruz.
                    // Bu fonksiyon, "Reply" headerlarını ekler ve zinciri kesin olarak korur.
                    msgFromCustomer.reply(body, { htmlBody: htmlBody, from: myEmail });
                    resultThreadId = threadId;
                } else {
                    // DURUM B: Müşteriden hiç mesaj yok (Sadece ben takip mailleri atmışım).
                    // Eğer 'reply' kullanırsam, son mesaj benden olduğu için mail BANA gelir.
                    // Bu yüzden 'createDraft' (veya sendEmail) ile yeni bir mail atıyoruz.
                    // ANCAK: Yukarıda 'subject' değişkenini thread'in konusuyla eşitlediğimiz için
                    // Gmail bunları otomatik olarak gruplayacaktır.
                    resultThreadId = null; // null yaparak aşağıda createDraft bloğuna düşmesini sağlıyoruz.
                }
            }
          } catch (err) { 
              // Thread ID bozuksa null yap, sıfırdan mail at
              threadId = null; 
          }
        }

        // Eğer yukarıda bir reply işlemi yapılmadıysa (veya thread yoksa)
        if (!resultThreadId) {
          try {
              // Yeni mail oluştur (veya takip maili)
              // Konu başlığı (subject) yukarıda thread ile eşitlendiği için gruplanacaktır.
              var draft = GmailApp.createDraft(cleanTo, subject, body, { htmlBody: htmlBody });
              var message = draft.send(); 
              resultThreadId = message.getThread().getId();
          } catch (sendErr) {
              return createJSON({ 'status': 'error', 'message': 'Gmail Hatası: ' + sendErr.toString() });
          }
        }

        return createJSON({ 'status': 'success', 'threadId': resultThreadId });
    }

    return createJSON({ 'status': 'error', 'message': 'Bilinmeyen işlem: ' + data.action });

  } catch (globalError) {
    return createJSON({ 'status': 'error', 'message': 'Global Hata: ' + globalError.toString() });
  }
}

// --- AKILLI TARAMA FONKSİYONU ---
function checkSingleThread(threadId, myEmail) {
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) return { hasReply: false };
    
    var msgs = thread.getMessages();
    var myEmailLower = myEmail.toLowerCase();
    
    // Sondan başa doğru son 3 mesajı tara
    var scanLimit = Math.max(0, msgs.length - 3);

    for (var i = msgs.length - 1; i >= scanLimit; i--) {
        var msg = msgs[i];
        var from = msg.getFrom().toLowerCase();
        var subj = msg.getSubject().toLowerCase();
        var body = msg.getPlainBody().toLowerCase(); 

        // 1. BOUNCE (HATA) KONTROLÜ
        var isBounceSender = (from.includes('mailer-daemon') || from.includes('postmaster') || from.includes('delivery') || from.includes('google') || from.includes('notify'));
        
        var isBounceContent = (
            subj.includes('failure') || subj.includes('delivery status') || subj.includes('undeliverable') || subj.includes('iletilemedi') ||
            body.includes('address not found') || body.includes('adres bulunamadı') || body.includes('blocked') || body.includes('rejected') || 
            body.includes('message not delivered') || body.includes('returned to sender')
        );

        if (isBounceSender && isBounceContent) {
             return {
                hasReply: true,
                isBounce: true,
                snippet: "⚠️ HATA: " + msg.getSubject(),
                from: msg.getFrom(),
                date: msg.getDate()
            };
        }

        // 2. NORMAL CEVAP KONTROLÜ
        if (from.indexOf(myEmailLower) === -1) {
             if (!isBounceSender) {
                 return {
                    hasReply: true,
                    isBounce: false,
                    snippet: msg.getSnippet(),
                    from: msg.getFrom(),
                    date: msg.getDate()
                };
             }
        }
    }
    
    return { hasReply: false };
  } catch (e) { return { hasReply: false }; }
}

function createJSON(content) {
  return ContentService.createTextOutput(JSON.stringify(content)).setMimeType(ContentService.MimeType.JSON);
}
