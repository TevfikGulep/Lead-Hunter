//google script dosyası - FOLLOW-UP FIX v3.2 (Bounce Priority Fix)

function doPost(e) {
  var debugLogs = []; // Olay günlüğü
  function log(msg) {
    var time = new Date().toLocaleTimeString('tr-TR');
    debugLogs.push("[" + time + "] " + msg);
  }

  try {
    var content = e.postData ? e.postData.contents : "{}";
    var data = JSON.parse(content);
    
    // Email alma yöntemini güçlendir
    var myEmail = Session.getActiveUser().getEmail();
    if (!myEmail) myEmail = Session.getEffectiveUser().getEmail();
    
    // Debug için maili loglara ekle (güvenlik için maskelenebilir ama debugda lazım)
    log("System User: " + myEmail);

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

      log("BULK CHECK STARTED. IDs received: " + ids.length);
      if (ids.length > 0) log("First ID: " + ids[0]);

      for (var i = 0; i < ids.length; i++) {
        try {
          var check = checkSingleThread(ids[i], myEmail);

          results[ids[i]] = check; // Her sonucu kaydet (Debug icin)

          if (check.hasReply) {
            check.isBounce ? bounceCount++ : foundCount++;
          }
        } catch (err) {
          results[ids[i]] = { error: err.toString() };
        }
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
            
            // Eğer myEmail boşsa eşleştirme yapma (false)
            var senderMatch = false;
            if (myEmailNorm && lastSenderNorm.indexOf(myEmailNorm) !== -1) {
                senderMatch = true;
            }

            log("Son gönderen ben miyim? " + (senderMatch ? "EVET" : "HAYIR"));

            var commonOptions = {
              htmlBody: htmlBody
            };

            if (!senderMatch) {
              // Müşteriden gelmiş -> Normal Cevap (Reply)
              log("Yöntem: lastMsg.reply() (Müşteriye Cevap)");
              lastMsg.reply(body, commonOptions);
              resultThreadId = threadId;
              methodUsed = "lastMsg.reply";
            } else {
              // Benden gelmiş -> Takip Maili (Follow-up) (Forward kullan)
              log("Yöntem: lastMsg.forward() (Takip Maili -> " + cleanTo + ")");
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
  var debugMsgs = [];
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) return { hasReply: false, error: "Thread not found" };

    var msgs = thread.getMessages();
    var myEmailLower = myEmail ? myEmail.toLowerCase() : "";

    // Debug: Son 5 mesajı inceleyelim
    var scanLimit = Math.max(0, msgs.length - 5);

    for (var i = msgs.length - 1; i >= scanLimit; i--) {
      var msg = msgs[i];
      var from = msg.getFrom().toLowerCase();
      
      var plainBody = msg.getPlainBody();
      var snippet = plainBody.length > 100 ? plainBody.substring(0, 100) + "..." : plainBody;

      // Her mesajı debug listesine ekle
      debugMsgs.push({
        index: i,
        from: from,
        snippet: snippet,
        date: msg.getDate()
      });

      // 1. ÖNCE BOUNCE KONTROLÜ (Kimden geldiğine bakmaksızın)
      var isBounce = from.includes('mailer-daemon') ||
          from.includes('postmaster') ||
          from.includes('delivery-status') ||
          from.includes('notification') ||
          from.includes('notify') ||
          from.includes('google') ||
          from.includes('bounce') ||
          from.includes('failed') ||
          from.includes('failure') ||
          from.includes('rejected') ||
          from.includes('undeliverable') ||
          from.includes('returned') ||
          from.includes('blocked') ||
          from.includes('spam');

      if (isBounce) {
          return {
            hasReply: true,
            isBounce: true,
            snippet: "BOUNCE DETECTED: " + snippet,
            from: msg.getFrom(),
            debug_last_from: from,
            messages_inspected: debugMsgs
          };
      }

      // 2. SONRA "BEN MİYİM?" KONTROLÜ
      // Eğer myEmailLower boşsa, kimseyi "ben" olarak işaretleme (false), böylece loop devam eder veya cevap sayılır.
      var isMe = false;
      if (myEmailLower && from.indexOf(myEmailLower) !== -1) {
          isMe = true;
      }

      // Eğer gönderen ben değilsem (ve bounce değilse - yukarıda yakalanmadıysa) -> Normal Cevaptır
      if (!isMe) {
        return {
          hasReply: true,
          isBounce: false,
          snippet: snippet,
          from: msg.getFrom(),
          debug_last_from: from,
          messages_inspected: debugMsgs
        };
      }
    }

    // Döngü bitti, cevap bulunamadı
    return {
      hasReply: false,
      debug_last_from: msgs.length > 0 ? msgs[msgs.length - 1].getFrom() : "Empty",
      messages_inspected: debugMsgs
    };

  } catch (e) {
    return {
      hasReply: false,
      error: e.toString(),
      messages_inspected: debugMsgs
    };
  }
}
