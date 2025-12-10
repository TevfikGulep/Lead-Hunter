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

        // Thread ID varsa kontrol et
        if (threadId) {
          try {
            var thread = GmailApp.getThreadById(threadId);
            if (thread) {
                // Thread mantığı düzeltmesi:
                // Eğer son mesajı ben attıysam ve cevap gelmediyse, 'reply' metodu maili bana (gönderene) atar.
                // Bu yüzden son mesajın kimden geldiğini kontrol ediyoruz.
                
                var messages = thread.getMessages();
                var lastMsg = messages[messages.length - 1];
                var lastSender = lastMsg.getFrom();
                
                // Eğer son mesaj benden değilse (Müşteriden geldiyse), REPLY ile cevap ver (Zinciri korur)
                if (lastSender.toLowerCase().indexOf(myEmail.toLowerCase()) === -1) {
                    thread.reply(body, { htmlBody: htmlBody, from: myEmail });
                    resultThreadId = threadId;
                } else {
                    // Eğer son mesaj bendense (Takip maili), REPLY kullanma.
                    // Çünkü reply kendine mail atar.
                    // Bunun yerine aşağıda createDraft ile gönderilecek.
                    // Gmail, konu başlığı (Subject) aynı olduğu sürece bunları otomatik birleştirir.
                    resultThreadId = null; 
                }
            }
          } catch (err) { threadId = null; }
        }

        // Thread bulunamadıysa veya takip maili ise (Reply kullanılmadıysa)
        if (!resultThreadId) {
          try {
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

// --- GÜNCELLENMİŞ AKILLI TARAMA FONKSİYONU ---
function checkSingleThread(threadId, myEmail) {
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) return { hasReply: false };
    
    var msgs = thread.getMessages();
    var myEmailLower = myEmail.toLowerCase();
    
    // Sondan başa doğru son 3 mesajı tara (Böylece en son mesaj bounce olmasa bile yakalarız)
    // Örnek: Siz mail attınız, bounce geldi, sonra siz tekrar mail attınız. Aradaki bounce'u kaçırmayalım.
    var scanLimit = Math.max(0, msgs.length - 3);

    for (var i = msgs.length - 1; i >= scanLimit; i--) {
        var msg = msgs[i];
        var from = msg.getFrom().toLowerCase();
        var subj = msg.getSubject().toLowerCase();
        var body = msg.getPlainBody().toLowerCase(); 

        // 1. BOUNCE (HATA) KONTROLÜ - Çok sıkı filtreler
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
        // Eğer mesaj benden değilse, bu bir müşteri cevabıdır.
        if (from.indexOf(myEmailLower) === -1) {
             // Ancak bu mesajın bounce olmadığından emin olalım (yukarıdaki if'e girmediyse bounce değildir ama yine de)
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
