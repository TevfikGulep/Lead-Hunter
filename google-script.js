//google script dosyası - FOLLOW-UP FIX v3.0

function doPost(e) {
  var debugLogs = []; // Olay günlüğü
  function log(msg) {
    var time = new Date().toLocaleTimeString('tr-TR');
    debugLogs.push("[" + time + "] " + msg);
  }

  try {
    var content = e.postData ? e.postData.contents : "{}";
    var data = JSON.parse(content);
    var myEmail = Session.getActiveUser().getEmail();

    // --- 1. CEVAP KONTROL ---
    if (data.action === 'check_reply') {
      if (!data.threadId) return createJSON({ 'status': 'error', 'message': 'Thread ID yok', 'logs': debugLogs });
      return createJSON({ 'status': 'success', 'logs': debugLogs, ...checkSingleThread(data.threadId, myEmail) });
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
        } catch (err) { }
      }
      return createJSON({ 'status': 'success', 'results': results, 'foundCount': foundCount, 'bounceCount': bounceCount, 'logs': debugLogs });
    }

    // --- 3. MAIL GÖNDERME (FOLLOW-UP FIX) ---
    else if (data.action === 'send_mail') {
      var rawTo = data.to;
      var cleanTo = rawTo ? rawTo.trim() : "";

      if (cleanTo === "") {
        return createJSON({ 'status': 'error', 'message': 'Alıcı adresi boş.', 'logs': debugLogs });
      }

      var subject = data.subject || "(Konu Yok)";
      var body = data.body || " ";
      var htmlBody = data.htmlBody || body;
      var threadId = data.threadId;
      var resultThreadId = null;
      var methodUsed = "Bilinmiyor";

      log("Mail Gönderimi: " + cleanTo);

      // THREAD KONTROLÜ
      if (threadId) {
        try {
          var thread = GmailApp.getThreadById(threadId);

          if (thread) {
            var messages = thread.getMessages();
            var lastMsg = messages[messages.length - 1];
            var lastSender = lastMsg.getFrom();

            var myEmailNorm = myEmail.toLowerCase();
            var lastSenderNorm = lastSender.toLowerCase();
            // Basit string kontrolü yetmeyebilir, bazen "Isim <mail>" formatında gelir.
            var senderMatch = lastSenderNorm.indexOf(myEmailNorm) !== -1;

            log("Son gönderen ben miyim? " + (senderMatch ? "EVET" : "HAYIR"));

            var commonOptions = {
              htmlBody: htmlBody
            };

            if (!senderMatch) {
              // Müşteriden gelmiş -> Normal Cevap (Reply)
              // Reply otomatik olarak gönderene (Müşteriye) gider.
              log("Yöntem: lastMsg.reply() (Müşteriye Cevap)");
              lastMsg.reply(body, commonOptions);
              resultThreadId = threadId;
              methodUsed = "lastMsg.reply";
            } else {
              // Benden gelmiş -> Takip Maili (Follow-up)
              // Reply veya ReplyAll kullanırsak kendimize atarız.
              // ÇÖZÜM: Forward!
              // Forward, threading'i korur (Referansları taşır) ama alıcıyı (To) manuel seçmemize izin verir.
              log("Yöntem: lastMsg.forward() (Takip Maili -> " + cleanTo + ")");

              // Forward normalde "Fwd:" ekler. Bunu engellemek için subject'i manuel set ediyoruz.
              var fwdOptions = {
                htmlBody: htmlBody,
                subject: subject
              };

              lastMsg.forward(cleanTo, fwdOptions);
              resultThreadId = threadId;
              methodUsed = "lastMsg.forward";
            }
          } else {
            log("HATA: Thread ID Gmail'de bulunamadı (Null).");
          }
        } catch (err) {
          log("Thread İşlem Hatası: " + err.toString());
          threadId = null;
        }
      }

      // Thread başarısızsa veya yoksa yeni mail at
      if (!resultThreadId) {
        log("Fallback: Yeni Draft/Mail oluşturuluyor.");
        try {
          var draft = GmailApp.createDraft(cleanTo, subject, body, { htmlBody: htmlBody });
          var message = draft.send();
          resultThreadId = message.getThread().getId();
          methodUsed = "createDraft (New)";
        } catch (sendErr) {
          log("KRİTİK HATA (Draft): " + sendErr.toString());
          return createJSON({ 'status': 'error', 'message': sendErr.toString(), 'logs': debugLogs });
        }
      }

      log("Başarılı. Thread ID: " + resultThreadId);

      return createJSON({
        'status': 'success',
        'threadId': resultThreadId,
        'debug_logs': debugLogs,
        'method_used': methodUsed
      });
    }

    return createJSON({ 'status': 'error', 'message': 'Bilinmeyen işlem', 'logs': debugLogs });

  } catch (globalError) {
    return createJSON({ 'status': 'error', 'message': 'Global Hata: ' + globalError.toString(), 'logs': debugLogs });
  }
}

function createJSON(content) {
  return ContentService.createTextOutput(JSON.stringify(content)).setMimeType(ContentService.MimeType.JSON);
}

function checkSingleThread(threadId, myEmail) {
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) return { hasReply: false };
    var msgs = thread.getMessages();
    var myEmailLower = myEmail.toLowerCase();
    var scanLimit = Math.max(0, msgs.length - 3);
    for (var i = msgs.length - 1; i >= scanLimit; i--) {
      var msg = msgs[i];
      var from = msg.getFrom().toLowerCase();

      // Eğer gönderen ben değilsem (Benden gelenleri zaten atlıyoruz)
      if (from.indexOf(myEmailLower) === -1) {

        // Bounce Kontrolü (Mailer-Daemon, Postmaster vb.)
        if (from.includes('mailer-daemon') || from.includes('postmaster') || from.includes('delivery-status') || from.includes('notification') || from.includes('notify') || from.includes('google')) {
          return {
            hasReply: true,
            isBounce: true,
            snippet: "BOUNCE: " + msg.getSnippet(),
            from: msg.getFrom(),
            date: msg.getDate()
          };
        }

        // Normal Cevap
        return {
          hasReply: true,
          isBounce: false,
          snippet: msg.getSnippet(),
          from: msg.getFrom(),
          date: msg.getDate()
        };
      }
    }


    // Döngü bitti, cevap yok. Ama debug için son mesajı (eğer varsa) dönelim.
    var lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    var debugLastFrom = lastMsg ? lastMsg.getFrom() : "No Header";

    return {
      hasReply: false,
      debug_last_from: debugLastFrom,
      debug_count: msgs.length
    };

  } catch (e) { return { hasReply: false, error: e.toString() }; }
}
