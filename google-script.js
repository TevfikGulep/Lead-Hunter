//google script dosyası - FOLLOW-UP FIX v4.0 (Inbox Sync Support)

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
    
    // Debug için maili loglara ekle
    log("System User: " + myEmail);

    // --- 1. CEVAP KONTROL (Tekil) ---
    if (data.action === 'check_reply') {
      if (!data.threadId) return createJSON({ 'status': 'error', 'message': 'Thread ID yok', 'logs': debugLogs });
      return createJSON({ 'status': 'success', 'logs': debugLogs, ...checkSingleThread(data.threadId, myEmail) });
    }

    // --- 2. TOPLU KONTROL (Eski Model) ---
    else if (data.action === 'check_replies_bulk') {
      var results = {};
      var foundCount = 0;
      var bounceCount = 0;
      var ids = data.threadIds || [];

      log("BULK CHECK STARTED. IDs received: " + ids.length);

      for (var i = 0; i < ids.length; i++) {
        try {
          var check = checkSingleThread(ids[i], myEmail);
          results[ids[i]] = check;
          if (check.hasReply) {
            check.isBounce ? bounceCount++ : foundCount++;
          }
        } catch (err) {
          results[ids[i]] = { error: err.toString() };
        }
      }
      return createJSON({ 'status': 'success', 'results': results, 'foundCount': foundCount, 'bounceCount': bounceCount, 'logs': debugLogs });
    }

    // --- 2.3 INBOX SYNC (YENİ MODEL - VERİMLİ) ---
    else if (data.action === 'sync_inbox') {
      var limit = data.limit || 100;
      var query = data.query || 'label:inbox'; 
      
      log("INBOX SYNC STARTED. Query: " + query + " Limit: " + limit);
      
      var threads = GmailApp.search(query, 0, limit);
      var inboxResults = [];
      
      for (var i = 0; i < threads.length; i++) {
        var thread = threads[i];
        var msgs = thread.getMessages();
        if (msgs.length === 0) continue;
        
        var lastMsg = msgs[msgs.length - 1];
        var from = lastMsg.getFrom();
        var fromLower = from.toLowerCase();
        
        // Eğer son mesaj benden değilse bu bir cevaptır
        var isMe = false;
        if (myEmail && fromLower.indexOf(myEmail.toLowerCase()) !== -1) {
          isMe = true;
        }
        
        if (!isMe) {
          inboxResults.push({
            threadId: thread.getId(),
            from: from,
            subject: thread.getFirstMessageSubject(),
            snippet: lastMsg.getPlainBody().substring(0, 300),
            date: lastMsg.getDate().toISOString(),
            unread: thread.isUnread()
          });
        }
      }
      
      return createJSON({ 
        'status': 'success', 
        'count': inboxResults.length, 
        'results': inboxResults,
        'logs': debugLogs 
      });
    }

    // --- 2.4 ARCHIVE THREADS ---
    else if (data.action === 'archive_threads') {
      var ids = data.threadIds || [];
      log("ARCHIVING THREADS: " + ids.length);
      
      for (var i = 0; i < ids.length; i++) {
        try {
          var thread = GmailApp.getThreadById(ids[i]);
          if (thread) {
            thread.moveToArchive();
            if (data.markRead) thread.markRead();
          }
        } catch (err) {
          log("Archive error (" + ids[i] + "): " + err.toString());
        }
      }
      return createJSON({ 'status': 'success', 'logs': debugLogs });
    }

    // --- 3. MAIL GÖNDERME ---
    else if (data.action === 'send_mail') {
      var cleanTo = (data.to || "").trim();
      if (cleanTo === "") return createJSON({ 'status': 'error', 'message': 'Alıcı adresi boş.', 'logs': debugLogs });

      var subject = data.subject || "(Konu Yok)";
      var body = data.body || " ";
      var htmlBody = data.htmlBody || body;
      var threadId = data.threadId;
      var resultThreadId = null;
      var methodUsed = "New Thread";

      if (threadId) {
        try {
          var thread = GmailApp.getThreadById(threadId);
          if (thread) {
            var messages = thread.getMessages();
            var lastMsg = messages[messages.length - 1];
            var lastSender = lastMsg.getFrom().toLowerCase();
            var myEmailNorm = myEmail.toLowerCase();
            
            var senderMatch = (myEmailNorm && lastSender.indexOf(myEmailNorm) !== -1);

            if (!senderMatch) {
              lastMsg.reply(body, { htmlBody: htmlBody });
              resultThreadId = threadId;
              methodUsed = "Reply";
            } else {
              lastMsg.forward(cleanTo, { htmlBody: htmlBody, subject: subject });
              resultThreadId = threadId;
              methodUsed = "Forward";
            }
          }
        } catch (err) { log("Thread Error: " + err.toString()); }
      }

      if (!resultThreadId) {
        var draft = GmailApp.createDraft(cleanTo, subject, body, { htmlBody: htmlBody });
        var message = draft.send();
        resultThreadId = message.getThread().getId();
      }

      return createJSON({ 'status': 'success', 'threadId': resultThreadId, 'method_used': methodUsed, 'logs': debugLogs });
    }

    // --- 4. YARDIMCI İŞLEMLER ---
    else if (data.action === 'check_thread_by_email') {
      var to = (data.to || '').toString().trim().toLowerCase();
      var foundThreadId = findThreadIdByRecipient(to, debugLogs);
      return createJSON({ 'status': foundThreadId ? 'success' : 'error', 'threadId': foundThreadId, 'logs': debugLogs });
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
    var scanLimit = Math.max(0, msgs.length - 5);

    for (var i = msgs.length - 1; i >= scanLimit; i--) {
      var msg = msgs[i];
      var from = msg.getFrom().toLowerCase();
      var plainBody = msg.getPlainBody();
      var snippet = plainBody.length > 150 ? plainBody.substring(0, 150) + "..." : plainBody;

      var isBounce = from.includes('mailer-daemon') || from.includes('postmaster') || from.includes('delivery-status') || 
                     from.includes('bounce') || from.includes('failed') || from.includes('undeliverable');

      if (isBounce) {
          return { hasReply: true, isBounce: true, snippet: snippet, from: msg.getFrom() };
      }

      var isMe = (myEmailLower && from.indexOf(myEmailLower) !== -1);
      if (!isMe) {
        return { hasReply: true, isBounce: false, snippet: snippet, from: msg.getFrom() };
      }
    }
    return { hasReply: false };
  } catch (e) { return { hasReply: false, error: e.toString() }; }
}

function findThreadIdByRecipient(toEmail, debugLogs) {
  try {
    var queries = ['to:' + toEmail, 'from:' + toEmail, '"' + toEmail + '"'];
    for (var q = 0; q < queries.length; q++) {
      var threads = GmailApp.search(queries[q], 0, 10);
      if (threads && threads.length > 0) return threads[0].getId();
    }
    return null;
  } catch (e) { return null; }
}

function checkThreadSentInfo(threadId, myEmail) {
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) return { hasSent: false };
    var msgs = thread.getMessages();
    var myEmailLower = (myEmail || '').toLowerCase();
    var lastSentDate = null;
    for (var i = 0; i < msgs.length; i++) {
      var from = (msgs[i].getFrom() || '').toLowerCase();
      if (myEmailLower && from.indexOf(myEmailLower) !== -1) {
        var d = msgs[i].getDate();
        if (!lastSentDate || d.getTime() > lastSentDate.getTime()) lastSentDate = d;
      }
    }
    return { hasSent: !!lastSentDate, lastSentAt: lastSentDate ? lastSentDate.toISOString() : null };
  } catch (e) { return { hasSent: false }; }
}
