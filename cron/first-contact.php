<?php
/**
 * Lead Hunter - Otomatik İlk Temas Cron Script
 *
 * Her gün saat 14:00'te çalışır (hafta içi)
 * statusKey === 'READY_TO_SEND' olan leadlere ilk maili gönderir
 * Workflow stage 0 template'ini kullanır
 *
 * cPanel Cron Job:
 * 0 14 * * 1-5 /usr/bin/php /home/[cpanel_kullanici]/public_html/cron/first-contact.php
 * Manuel: ?manual=1 veya ?secret=LEADHUNTER_FIRSTCONTACT_2026
 */

define('SERVICE_ACCOUNT_FILE', __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json');
define('SECRET_KEY', 'LEADHUNTER_FIRSTCONTACT_2026');
define('LOG_FILE', __DIR__ . '/../logs/first-contact.log');
define('SERVER_URL', 'https://leadhunter.tevfikgulep.com/traffic-api.php');
define('MAX_EMAILS_PER_RUN', 30); // Gmail günlük limit koruması

header('Content-Type: text/plain; charset=utf-8');

function writeLog($message, $type = 'INFO') {
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] [$type] $message\n";
    @file_put_contents(LOG_FILE, $logMessage, FILE_APPEND);
    echo $logMessage;
}

// --- AUTH ---
$isManual = isset($_GET['manual']);
$secret = $_GET['secret'] ?? '';

if ($secret === SECRET_KEY) {
    writeLog("Güvenli erişimle başlatıldı", "INFO");
} elseif ($isManual) {
    writeLog("Manuel başlatıldı", "INFO");
} else {
    $now = new DateTime('now', new DateTimeZone('Europe/Istanbul'));
    $dayOfWeek = (int)$now->format('N');
    $hour = (int)$now->format('H');

    if ($dayOfWeek < 1 || $dayOfWeek > 5) {
        echo "SKIP: Hafta sonu\n";
        exit;
    }
    if ($hour < 13 || $hour > 15) {
        echo "SKIP: Çalışma saati değil\n";
        exit;
    }
    writeLog("Otomatik ilk temas başlıyor", "INFO");
}

// --- FIREBASE HELPERS ---

function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function getFirebaseAccessToken($serviceAccountFile) {
    if (!file_exists($serviceAccountFile)) return null;
    $serviceAccount = json_decode(file_get_contents($serviceAccountFile), true);

    $header = base64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'RS256']));
    $now = time();
    $payload = base64url_encode(json_encode([
        'iss' => $serviceAccount['client_email'],
        'sub' => $serviceAccount['client_email'],
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
        'scope' => 'https://www.googleapis.com/auth/firestore https://www.googleapis.com/auth/datastore'
    ]));

    $signature = '';
    openssl_sign($header . '.' . $payload, $signature, $serviceAccount['private_key'], OPENSSL_ALGO_SHA256);
    $signature = base64url_encode($signature);

    $jwt = $header . '.' . $payload . '.' . $signature;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://oauth2.googleapis.com/token');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $jwt
    ]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true)['access_token'] ?? null;
}

function getStringValue($fields, $key, $default = '') {
    if (!isset($fields[$key])) return $default;
    if (isset($fields[$key]['stringValue'])) return $fields[$key]['stringValue'];
    return $default;
}

function getArrayValue($fields, $key) {
    if (!isset($fields[$key]['arrayValue']['values'])) return [];
    $result = [];
    foreach ($fields[$key]['arrayValue']['values'] as $item) {
        if (!isset($item['mapValue']['fields'])) continue;
        $map = $item['mapValue']['fields'];
        $parsed = [];
        foreach ($map as $k => $v) {
            $parsed[$k] = getStringValue($map, $k, '');
        }
        $result[] = $parsed;
    }
    return $result;
}

function getAllLeads($accessToken, $projectId) {
    $leads = [];
    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/leads?pageSize=500";
    $nextPageToken = null;

    do {
        $fetchUrl = $nextPageToken ? $url . "&pageToken=" . urlencode($nextPageToken) : $url;
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $fetchUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $accessToken"]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        $response = curl_exec($ch);
        curl_close($ch);

        $data = json_decode($response, true);
        if (isset($data['documents'])) {
            foreach ($data['documents'] as $doc) {
                $docName = $doc['name'] ?? '';
                $docId = basename($docName);
                $fields = $doc['fields'] ?? [];
                $leads[] = [
                    'id' => $docId,
                    'fields' => $fields,
                    'url' => getStringValue($fields, 'url'),
                    'email' => getStringValue($fields, 'email'),
                    'statusKey' => getStringValue($fields, 'statusKey', 'NEW'),
                    'language' => getStringValue($fields, 'language', 'TR'),
                    'stage' => isset($fields['stage']['integerValue']) ? (int)$fields['stage']['integerValue'] : 0,
                    'threadId' => getStringValue($fields, 'threadId')
                ];
            }
        }
        $nextPageToken = $data['nextPageToken'] ?? null;
    } while ($nextPageToken);

    return $leads;
}

function updateFirestoreLead($accessToken, $projectId, $docId, $data) {
    $maskParams = array_map(function($key) {
        return 'updateMask.fieldPaths=' . urlencode($key);
    }, array_keys($data));
    $maskQuery = implode('&', $maskParams);

    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/leads/$docId?$maskQuery";

    $fields = [];
    foreach ($data as $key => $value) {
        if (is_bool($value)) $fields[$key] = ['booleanValue' => $value];
        elseif (is_int($value)) $fields[$key] = ['integerValue' => (string)$value];
        else $fields[$key] = ['stringValue' => (string)$value];
    }

    $body = json_encode(['fields' => $fields]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $accessToken",
        "Content-Type: application/json"
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return $httpCode === 200 || $httpCode === 201;
}

function sendEmail($to, $subject, $body, $signature, $googleScriptUrl, $trackingId = null) {
    $messageHtml = nl2br(htmlspecialchars($body, ENT_QUOTES, 'UTF-8'));

    // Tracking pixel
    $trackingPixel = '';
    if ($trackingId) {
        $trackingPixel = '<img src="' . SERVER_URL . '?type=track&id=' . $trackingId . '" width="1" height="1" style="display:none;" alt="" />';
    }

    $htmlBody = '<div style="font-family: Arial, sans-serif; font-size: 14px;">' . $messageHtml . '</div>';
    if ($signature) {
        $htmlBody .= '<br><br><div>' . $signature . '</div>';
    }
    $htmlBody .= $trackingPixel;

    $plainBody = $body;
    if ($signature) {
        $plainBody .= "\n\n--\n" . strip_tags($signature);
    }

    $postData = json_encode([
        'action' => 'send_mail',
        'to' => $to,
        'subject' => $subject,
        'body' => $plainBody,
        'htmlBody' => $htmlBody,
        'threadId' => null // First contact = new thread
    ]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $googleScriptUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: text/plain;charset=utf-8']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $result = json_decode($response, true);

    return [
        'success' => (isset($result['status']) && $result['status'] === 'success'),
        'threadId' => $result['threadId'] ?? null,
        'message' => $result['message'] ?? ''
    ];
}

// === MAIN ===
try {
    writeLog("İlk temas işlemi başladı", "INFO");

    if (!file_exists(SERVICE_ACCOUNT_FILE)) {
        writeLog("Service account bulunamadı", "ERROR");
        exit;
    }

    $serviceAccount = json_decode(file_get_contents(SERVICE_ACCOUNT_FILE), true);
    $projectId = $serviceAccount['project_id'];

    $accessToken = getFirebaseAccessToken(SERVICE_ACCOUNT_FILE);
    if (!$accessToken) {
        writeLog("Firebase token alınamadı", "ERROR");
        exit;
    }
    writeLog("Firebase OK", "INFO");

    // Get settings
    $settingsUrl = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/system/config";
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $settingsUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $accessToken"]);
    $settingsResp = curl_exec($ch);
    curl_close($ch);

    $settingsData = json_decode($settingsResp, true);
    $settingsFields = $settingsData['fields'] ?? [];

    $googleScriptUrl = getStringValue($settingsFields, 'googleScriptUrl');
    $signature = getStringValue($settingsFields, 'signature');

    if (empty($googleScriptUrl)) {
        writeLog("Google Script URL bulunamadı", "ERROR");
        exit;
    }

    // Get workflows
    $workflowTR = getArrayValue($settingsFields, 'workflowTR');
    $workflowEN = getArrayValue($settingsFields, 'workflowEN');

    // Fallback workflows
    if (empty($workflowTR)) {
        $workflowTR = [
            ['label' => 'İlk Temas', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Merhabalar, ben optAd360 ekibinden. {{Website}} siteniz için önemli bir reklam gelir fırsatı hakkında konuşmak istiyorum. Google Certified Publisher Partner olarak mevcut reklam düzeninize dokunmadan ek gelir katmanı oluşturuyoruz. 15 dakikalık kısa bir görüşme ayarlayabilir miyiz?']
        ];
    }
    if (empty($workflowEN)) {
        $workflowEN = [
            ['label' => 'First Contact', 'subject' => 'Partnership Opportunity for {{Website}}', 'body' => 'Hello, I am from the optAd360 team. We noticed a significant revenue opportunity on {{Website}}. As a Google Certified Publisher Partner, we help publishers build an additional revenue layer without touching existing ad layouts. Could we schedule a 15-minute call?']
        ];
    }

    writeLog("Workflow TR stages: " . count($workflowTR) . " | EN stages: " . count($workflowEN), "INFO");

    // Get leads
    $allLeads = getAllLeads($accessToken, $projectId);

    // Filter READY_TO_SEND
    $candidates = array_filter($allLeads, function($lead) {
        return $lead['statusKey'] === 'READY_TO_SEND'
            && !empty($lead['email'])
            && strlen($lead['email']) >= 5
            && strpos($lead['email'], '@') !== false;
    });
    $candidates = array_values($candidates);

    writeLog("READY_TO_SEND lead sayısı: " . count($candidates), "INFO");

    if (count($candidates) === 0) {
        writeLog("Gönderilecek lead bulunamadı", "INFO");
        echo "SUCCESS: Gönderilecek lead yok\n";
        exit;
    }

    // Limit per run
    $candidates = array_slice($candidates, 0, MAX_EMAILS_PER_RUN);
    writeLog("Bu turda işlenecek: " . count($candidates) . " lead", "INFO");

    $sentCount = 0;
    $failedCount = 0;

    foreach ($candidates as $lead) {
        $domain = parse_url($lead['url'], PHP_URL_HOST);
        if (!$domain) $domain = str_replace(['https://', 'http://'], '', $lead['url']);
        $domain = preg_replace('/^www\./', '', $domain);

        $email = trim(explode(',', $lead['email'])[0]); // İlk email'i al
        $lang = $lead['language'] ?: 'TR';
        $workflow = $lang === 'EN' ? $workflowEN : $workflowTR;

        if (empty($workflow) || !isset($workflow[0])) {
            writeLog("Workflow bulunamadı: $domain ($lang)", "ERROR");
            $failedCount++;
            continue;
        }

        $template = $workflow[0]; // Stage 0 = First Contact
        $subject = str_replace('{{Website}}', $domain, $template['subject'] ?? '');
        $body = str_replace('{{Website}}', $domain, $template['body'] ?? '');

        writeLog("Gönderiliyor: $email ($domain) - $lang", "INFO");

        $result = sendEmail($email, $subject, $body, $signature, $googleScriptUrl, $lead['id']);

        if ($result['success']) {
            writeLog("  ✅ Gönderildi (Thread: {$result['threadId']})", "SUCCESS");

            $nextFollowupDate = new DateTime('now', new DateTimeZone('Europe/Istanbul'));
            $nextFollowupDate->modify('+7 days');

            $updateData = [
                'stage' => 1,
                'statusKey' => 'NO_REPLY',
                'statusLabel' => 'No reply yet',
                'lastContactDate' => date('c'),
                'autoFollowupEnabled' => true,
                'nextFollowupDate' => $nextFollowupDate->format('c'),
                'followupCount' => 1
            ];

            if ($result['threadId']) {
                $updateData['threadId'] = $result['threadId'];
            }

            $updateSuccess = updateFirestoreLead($accessToken, $projectId, $lead['id'], $updateData);

            if ($updateSuccess) {
                $sentCount++;
                writeLog("  ✅ DB güncellendi", "SUCCESS");
            } else {
                writeLog("  ⚠️ DB güncelleme hatası", "ERROR");
                $sentCount++; // Mail yine de gönderildi
            }
        } else {
            writeLog("  ❌ Gönderilemedi: {$result['message']}", "ERROR");
            $failedCount++;
        }

        // Rate limiting - 3 seconds between emails
        sleep(3);
    }

    writeLog("İlk temas tamamlandı. Gönderilen: $sentCount | Başarısız: $failedCount", "INFO");
    echo "\nSUCCESS: $sentCount ilk temas maili gönderildi.\n";

} catch (Exception $e) {
    writeLog("HATA: " . $e->getMessage(), "ERROR");
    echo "ERROR: " . $e->getMessage() . "\n";
}
