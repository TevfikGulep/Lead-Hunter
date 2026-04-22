<?php
/**
 * Lead Hunter - Inbox Sync (Reply Check) Cron Script
 * 
 * Bu script Gmail inbox'undaki yeni mesajları çeker ve Lead Hunter database'i ile eşleştirir.
 * Eski "her lead için tek tek Gmail'e sor" yönteminden çok daha verimlidir.
 * 
 * cPanel Cron Job:
 * */15 * * * * /usr/local/bin/lsphp /home/tevfikgulep/leadhunter.tevfikgulep.com/cron/sync-replies.php
 */

define('SERVICE_ACCOUNT_FILE', __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json');
define('LOG_FILE', __DIR__ . '/../logs/sync-replies.log');
define('SECRET_KEY', 'LEADHUNTER_SYNC_2026');

function writeLog($message, $type = 'INFO') {
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] [$type] $message\n";
    @file_put_contents(LOG_FILE, $logMessage, FILE_APPEND);
    echo $logMessage;
}

function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function getFirebaseAccessToken($serviceAccountFile) {
    if (!file_exists($serviceAccountFile)) return null;
    $serviceAccount = json_decode(file_get_contents($serviceAccountFile), true);
    if (!$serviceAccount) return null;

    $header = base64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'RS256']));
    $now = time();
    $payload = base64url_encode(json_encode([
        'iss' => $serviceAccount['client_email'],
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
        'scope' => 'https://www.googleapis.com/auth/datastore'
    ]));

    $signature = '';
    openssl_sign($header . '.' . $payload, $signature, $serviceAccount['private_key'], OPENSSL_ALGO_SHA256);
    $jwt = $header . '.' . $payload . '.' . base64url_encode($signature);

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $jwt
    ]));
    $resp = curl_exec($ch);
    $data = json_decode($resp, true);
    return $data['access_token'] ?? null;
}

// Firestore helper to fetch leads with threadId
function getLeadsWithThreads($accessToken, $projectId) {
    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery";
    
    // Sadece threadId alanı olan ve aktif süreçte olanları çekmeye çalışalım
    // Not: Firestore'da 'exists' sorgusu zordur, bu yüzden basitçe son güncellenenleri veya belirli statüleri çekebiliriz.
    // Şimdilik performansı korumak için sadece NO_REPLY olanları çekelim.
    $query = [
        'structuredQuery' => [
            'from' => [['collectionId' => 'leads']],
            'where' => [
                'fieldFilter' => [
                    'field' => ['fieldPath' => 'statusKey'],
                    'op' => 'EQUAL',
                    'value' => ['stringValue' => 'NO_REPLY']
                ]
            ]
        ]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $accessToken", "Content-Type: application/json"]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($query));
    $resp = curl_exec($ch);
    $data = json_decode($resp, true);
    
    $results = [];
    if (is_array($data)) {
        foreach ($data as $doc) {
            if (isset($doc['document'])) {
                $fields = $doc['document']['fields'];
                $id = basename($doc['document']['name']);
                $results[] = [
                    'id' => $id,
                    'email' => $fields['email']['stringValue'] ?? '',
                    'threadId' => $fields['threadId']['stringValue'] ?? '',
                    'statusKey' => $fields['statusKey']['stringValue'] ?? '',
                    'url' => $fields['url']['stringValue'] ?? ''
                ];
            }
        }
    }
    return $results;
}

function updateLeadStatus($accessToken, $projectId, $id, $updateData) {
    $mask = [];
    $fields = [];
    foreach ($updateData as $k => $v) {
        $mask[] = "updateMask.fieldPaths=" . $k;
        if (is_bool($v)) $fields[$k] = ['booleanValue' => $v];
        else $fields[$k] = ['stringValue' => (string)$v];
    }
    
    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/leads/$id?" . implode('&', $mask);
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $accessToken", "Content-Type: application/json"]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['fields' => $fields]));
    curl_exec($ch);
}

try {
    writeLog("Inbox Sync started");

    $accessToken = getFirebaseAccessToken(SERVICE_ACCOUNT_FILE);
    if (!$accessToken) throw new Exception("Firebase access token fail");

    $serviceAccount = json_decode(file_get_contents(SERVICE_ACCOUNT_FILE), true);
    $projectId = $serviceAccount['project_id'];

    // 1. Settings'den Google Script URL çek
    $ch = curl_init("https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/system/config");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $accessToken"]);
    $configResp = curl_exec($ch);
    $config = json_decode($configResp, true);
    $googleScriptUrl = $config['fields']['googleScriptUrl']['stringValue'] ?? '';

    if (!$googleScriptUrl) throw new Exception("Google Script URL not found in config");

    // 2. Apps Script'ten Inbox verilerini çek (Son 100 mesaj)
    writeLog("Fetching inbox from Gmail...");
    $ch = curl_init($googleScriptUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['action' => 'sync_inbox', 'limit' => 100]));
    $inboxResp = curl_exec($ch);
    $inboxData = json_decode($inboxResp, true);

    if ($inboxData['status'] !== 'success') {
        throw new Exception("Gmail sync error: " . ($inboxData['message'] ?? 'Unknown'));
    }

    $replies = $inboxData['results'] ?? [];
    writeLog("Found " . count($replies) . " potential replies in inbox.");

    if (empty($replies)) {
        writeLog("No new replies to process.");
        exit;
    }

    // 3. Database'deki aktif leadleri çek
    $leads = getLeadsWithThreads($accessToken, $projectId);
    writeLog("Comparing with " . count($leads) . " active leads (NO_REPLY).");

    $processedThreads = [];
    $matchedCount = 0;

    foreach ($replies as $reply) {
        $fromEmail = '';
        if (preg_match('/<([^>]+)>/', $reply['from'], $m)) $fromEmail = strtolower($m[1]);
        else $fromEmail = strtolower(trim($reply['from']));

        foreach ($leads as $lead) {
            $match = false;
            // Eşleşme 1: Thread ID
            if ($lead['threadId'] === $reply['threadId']) $match = true;
            // Eşleşme 2: Email adresi
            elseif (strpos(strtolower($lead['email']), $fromEmail) !== false) $match = true;

            if ($match) {
                writeLog("MATCH FOUND: {$lead['url']} - Sender: $fromEmail");
                
                // Firestore Güncelle
                $snippet = $reply['snippet'];
                $updateData = [
                    'statusKey' => 'NEEDS_REVIEW',
                    'statusLabel' => 'New Reply (Inbox Sync)',
                    'lastContactDate' => date('c'),
                    'autoFollowupEnabled' => false // Cevap gelince otomatiği durdur
                ];
                
                updateLeadStatus($accessToken, $projectId, $lead['id'], $updateData);
                
                $processedThreads[] = $reply['threadId'];
                $matchedCount++;
                break; // Bu reply için eşleşme bulundu, sonraki reply'a geç
            }
        }
    }

    writeLog("Matched and updated $matchedCount leads.");

    // 4. İşlenen threadleri arşivle (İsteğe bağlı - Inbox'ı temiz tutar)
    if (!empty($processedThreads)) {
        writeLog("Archiving processed threads...");
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'action' => 'archive_threads', 
            'threadIds' => $processedThreads,
            'markRead' => true
        ]));
        curl_exec($ch);
    }

    writeLog("Inbox Sync completed successfully.");

} catch (Exception $e) {
    writeLog("CRITICAL ERROR: " . $e->getMessage(), "ERROR");
}
