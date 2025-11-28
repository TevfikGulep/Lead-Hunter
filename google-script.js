//google scripts içindeki kod

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var myEmail = Session.getActiveUser().getEmail();

    // --- GÜVENLİK DUVARI: Eylem (Action) yoksa işlem yapma ---
    if (!data.action) {
      return createJSON({ 'status': 'error', 'message': 'GÜVENLİK: İşlem türü (action) belirtilmedi. Script güncel, ancak App.js eski olabilir.' });
    }

    // 1. CEVAP KONTROL (TEKİL)
    if (data.action === 'check_reply') {
      var threadId = data.threadId;
      if (!threadId) return createJSON({ 'status': 'error', 'message': 'Thread ID yok' });
      var result = checkSingleThread(threadId, myEmail);
      return createJSON({ 'status': 'success', ...result });
    }

    // 2. CEVAP KONTROL (TOPLU)
    else if (data.action === 'check_replies_bulk') {
      var threadIds = data.threadIds;
      var results = {};
      var foundCount = 0;
      var bounceCount = 0;

      if (!threadIds || threadIds.length === 0) return createJSON({ 'status': 'error', 'message': 'Liste boş' });

      for (var i = 0; i < threadIds.length; i++) {
        var tid = threadIds[i];
        try {
          var check = checkSingleThread(tid, myEmail);
          if (check.hasReply) {
             results[tid] = check;
             if (check.isBounce) bounceCount++;
             else foundCount++;
          }
        } catch (err) {
          console.log("Hata: " + tid + " - " + err);
        }
      }
      return createJSON({ 'status': 'success', 'results': results, 'foundCount': foundCount, 'bounceCount': bounceCount });
    }

    // 3. MAIL GÖNDERME (Artık sadece 'send_mail' etiketi varsa çalışır)
    else if (data.action === 'send_mail') {
        var to = data.to;
        var subject = data.subject;
        var body = data.body;
        var htmlBody = data.htmlBody;
        var threadId = data.threadId;
        var resultThreadId = null;

        if (threadId) {
          try {
            var thread = GmailApp.getThreadById(threadId);
            if (thread) {
              thread.reply(body, { htmlBody: htmlBody, from: myEmail });
              resultThreadId = threadId;
            }
          } catch (err) { threadId = null; }
        }

        if (!threadId) {
          var draft = GmailApp.createDraft(to, subject, body, { htmlBody: htmlBody });
          var message = draft.send();
          resultThreadId = message.getThread().getId();
        }
        return createJSON({ 'status': 'success', 'threadId': resultThreadId });
    }

    // Bilinmeyen eylem
    return createJSON({ 'status': 'error', 'message': 'Geçersiz işlem: ' + data.action });

  } catch (error) {
    return createJSON({ 'status': 'error', 'message': error.toString() });
  }
}

// --- GELİŞMİŞ BOUNCE (HATA) KONTROLÜ ---
function checkSingleThread(threadId, myEmail) {
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) return { hasReply: false, error: 'Not found' };

    var messages = thread.getMessages();
    var isBounce = false;
    var bounceMsg = null;

    // Sondan başa doğru son 3 mesajı tara
    var scanLimit = Math.max(0, messages.length - 3);
    
    for (var k = messages.length - 1; k >= scanLimit; k--) {
        var msg = messages[k];
        var from = msg.getFrom().toLowerCase();
        var subj = msg.getSubject().toLowerCase();
        var body = msg.getPlainBody().toLowerCase(); 
        var snippet = msg.getSnippet().toLowerCase();

        // 1. Gönderen Kontrolü
        if (from.includes('mailer-daemon') || from.includes('postmaster') || from.includes('delivery') || from.includes('noreply')) {
            if(subj.includes('failure') || subj.includes('fail') || body.includes('found') || body.includes('ileti') || body.includes('delivery') || body.includes('blok') || body.includes('block')) {
               isBounce = true;
            }
        }
        
        // 2. Konu ve İçerik Kontrolü
        var bounceTerms = [
            'delivery status notification', 'teslimat durumu bildirimi', 'teslimat hatası', 
            'delivery failure', 'undeliverable', 'iletilemedi', 'message not delivered', 
            'address not found', 'adres bulunamadı', 'could not be delivered',
            'recipients failed', 'rejected', 'engellendi', 'bloklandı', 'not exist', 'bulunamıyor'
        ];
        
        for(var b=0; b<bounceTerms.length; b++) {
            if (subj.includes(bounceTerms[b]) || snippet.includes(bounceTerms[b]) || body.includes(bounceTerms[b])) {
                isBounce = true;
            }
        }

        if (isBounce) {
            bounceMsg = msg;
            break;
        }
    }

    if (isBounce && bounceMsg) {
      return {
        hasReply: true,
        isBounce: true,
        snippet: "⚠️ HATA: " + bounceMsg.getSubject(),
        from: bounceMsg.getFrom(),
        date: bounceMsg.getDate()
      };
    } 
    
    // Normal cevap kontrolü (Son mesajı ben atmadıysam cevaptır)
    var lastMessage = messages[messages.length - 1];
    var senderEmail = lastMessage.getFrom();
    var isReply = senderEmail.indexOf(myEmail) === -1; 

    if (isReply) {
      return {
        hasReply: true,
        isBounce: false,
        snippet: lastMessage.getSnippet(),
        from: senderEmail,
        date: lastMessage.getDate()
      };
    }

    return { hasReply: false };

  } catch (e) {
    return { hasReply: false, error: e.toString() };
  }
}

function createJSON(content) {
  return ContentService.createTextOutput(JSON.stringify(content)).setMimeType(ContentService.MimeType.JSON);
}