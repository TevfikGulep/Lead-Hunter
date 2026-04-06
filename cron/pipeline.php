<?php
/**
 * Lead Hunter - Otomatik Zenginleştirme Pipeline
 *
 * Her gün saat 11:00'de çalışır
 * statusKey === 'NEW' olan leadleri bulur, trafik ve email zenginleştirmesi yapar
 * Email bulunursa statusKey → READY_TO_SEND
 *
 * cPanel Cron Job:
 * 0 11 * * 1-5 /usr/bin/php /home/[cpanel_kullanici]/public_html/cron/pipeline.php
 * Manuel: ?manual=1 veya ?secret=LEADHUNTER_PIPELINE_2026
 */

define('SERVICE_ACCOUNT_FILE', __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json');
define('SECRET_KEY', 'LEADHUNTER_PIPELINE_2026');
define('LOG_FILE', __DIR__ . '/../logs/pipeline.log');
define('SERVER_URL', 'https://leadhunter.tevfikgulep.com/traffic-api.php');

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
    writeLog("Güvenli erişimle pipeline başlatıldı", "INFO");
} elseif ($isManual) {
    writeLog("Manuel pipeline başlatıldı", "INFO");
} else {
    $now = new DateTime('now', new DateTimeZone('Europe/Istanbul'));
    $dayOfWeek = (int)$now->format('N');
    $hour = (int)$now->format('H');

    if ($dayOfWeek < 1 || $dayOfWeek > 5) {
        writeLog("Hafta sonu çalışmaz", "INFO");
        echo "SKIP: Hafta sonu\n";
        exit;
    }
    if ($hour < 10 || $hour > 12) {
        writeLog("Çalışma saati değil (Saat: $hour)", "INFO");
        echo "SKIP: Çalışma saati değil\n";
        exit;
    }
    writeLog("Otomatik pipeline başlıyor", "INFO");
}

// --- FIREBASE HELPERS (same pattern as followup.php) ---

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
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
        'scope' => 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform'
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
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $tokenData = json_decode($response, true);
    if (!$tokenData) return null;
    
    return $tokenData['access_token'] ?? $tokenData['id_token'] ?? null;
}

function getStringValue($fields, $key, $default = '') {
    if (!isset($fields[$key])) return $default;
    if (isset($fields[$key]['stringValue'])) return $fields[$key]['stringValue'];
    return $default;
}

function getIntValue($fields, $key, $default = 0) {
    if (!isset($fields[$key])) return $default;
    if (isset($fields[$key]['integerValue'])) return (int)$fields[$key]['integerValue'];
    return $default;
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
                    'url' => getStringValue($fields, 'url'),
                    'email' => getStringValue($fields, 'email'),
                    'statusKey' => getStringValue($fields, 'statusKey', 'NEW'),
                    'language' => getStringValue($fields, 'language', 'TR'),
                    'stage' => getIntValue($fields, 'stage', 0)
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
        if ($key === 'trafficStatus' && is_array($value)) {
            $mapFields = [];
            foreach ($value as $k => $v) {
                if (is_bool($v)) $mapFields[$k] = ['booleanValue' => $v];
                elseif (is_numeric($v)) $mapFields[$k] = ['doubleValue' => (float)$v];
                else $mapFields[$k] = ['stringValue' => (string)$v];
            }
            $fields[$key] = ['mapValue' => ['fields' => $mapFields]];
        } elseif (is_bool($value)) {
            $fields[$key] = ['booleanValue' => $value];
        } elseif (is_int($value)) {
            $fields[$key] = ['integerValue' => (string)$value];
        } else {
            $fields[$key] = ['stringValue' => (string)$value];
        }
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

// === MAIN ===
try {
    writeLog("Pipeline işlemi başladı", "INFO");

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
    writeLog("Firebase bağlantısı OK (Proje: $projectId)", "INFO");

    // Get all leads
    $allLeads = getAllLeads($accessToken, $projectId);
    writeLog("Toplam lead: " . count($allLeads), "INFO");

    // Filter: NEW status leads that need enrichment
    $candidates = array_filter($allLeads, function($lead) {
        return $lead['statusKey'] === 'NEW' && (empty($lead['email']) || strlen($lead['email']) < 5);
    });

    // Also include MAIL_ERROR leads (need new email)
    $mailErrorLeads = array_filter($allLeads, function($lead) {
        return $lead['statusKey'] === 'MAIL_ERROR';
    });

    $candidates = array_merge(array_values($candidates), array_values($mailErrorLeads));
    writeLog("Zenginleştirilecek lead: " . count($candidates), "INFO");

    if (count($candidates) === 0) {
        writeLog("Zenginleştirilecek lead bulunamadı", "INFO");
        echo "SUCCESS: Zenginleştirilecek lead yok\n";
        exit;
    }

    // Process each candidate
    $enrichedCount = 0;
    $readyToSendCount = 0;
    $failedCount = 0;

    // Limit to 50 per run to avoid timeout
    $candidates = array_slice($candidates, 0, 50);

    foreach ($candidates as $lead) {
        $domain = parse_url($lead['url'], PHP_URL_HOST);
        if (!$domain) $domain = $lead['url'];
        $domain = preg_replace('/^www\./', '', strtolower($domain));

        writeLog("İşleniyor: $domain (Status: {$lead['statusKey']})", "INFO");

        $updates = [];

        // 1. Traffic check (if not already done)
        $trafficUrl = SERVER_URL . "?type=traffic&domain=" . urlencode($domain);
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $trafficUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        $trafficResp = curl_exec($ch);
        curl_close($ch);

        $traffic = json_decode($trafficResp, true);
        if ($traffic && $traffic['success'] && isset($traffic['value'])) {
            $updates['trafficStatus'] = [
                'viable' => $traffic['value'] > 20000,
                'value' => (int)$traffic['value'],
                'label' => $traffic['label'] ?? 'Bilinmiyor'
            ];
            writeLog("  Trafik: " . ($traffic['label'] ?? '?'), "INFO");

            // If traffic is too low, mark as not viable
            if ($traffic['value'] < 20000) {
                $updates['statusKey'] = 'NOT_VIABLE';
                $updates['statusLabel'] = 'Not viable';
                writeLog("  Düşük trafik - NOT_VIABLE", "WARN");

                if (updateFirestoreLead($accessToken, $projectId, $lead['id'], $updates)) {
                    writeLog("  ✅ Güncellendi (NOT_VIABLE)", "SUCCESS");
                }
                usleep(500000);
                continue;
            }
        }

        // 2. Email discovery
        $emailUrl = SERVER_URL . "?type=email&domain=" . urlencode($domain);
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $emailUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        $emailResp = curl_exec($ch);
        curl_close($ch);

        $emailData = json_decode($emailResp, true);
        $foundEmail = '';

        if ($emailData && $emailData['success'] && !empty($emailData['emails'])) {
            $foundEmail = implode(', ', $emailData['emails']);
            $updates['email'] = $foundEmail;
            writeLog("  Email: $foundEmail", "SUCCESS");
        } else {
            writeLog("  Email bulunamadı, deep scan deneniyor...", "WARN");

            // Try deep scan
            $deepUrl = SERVER_URL . "?type=email_deep&domain=" . urlencode($domain);
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $deepUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 60);
            $deepResp = curl_exec($ch);
            curl_close($ch);

            $deepData = json_decode($deepResp, true);
            if ($deepData && $deepData['success'] && !empty($deepData['emails'])) {
                $foundEmail = implode(', ', $deepData['emails']);
                $updates['email'] = $foundEmail;
                writeLog("  Deep scan email: $foundEmail", "SUCCESS");
            }
        }

        // 3. Determine status
        if ($foundEmail) {
            $updates['statusKey'] = 'READY_TO_SEND';
            $updates['statusLabel'] = 'Ready to Send';
            $readyToSendCount++;
        } else {
            // Keep as NEW - will be retried next run
            // After 3 failed attempts, could be marked differently
            writeLog("  Email bulunamadı, NEW olarak kalıyor", "WARN");
            $failedCount++;
        }

        // 4. Update Firestore
        if (count($updates) > 0) {
            $success = updateFirestoreLead($accessToken, $projectId, $lead['id'], $updates);
            if ($success) {
                $enrichedCount++;
                writeLog("  ✅ Güncellendi", "SUCCESS");
            } else {
                writeLog("  ❌ Güncelleme hatası", "ERROR");
            }
        }

        // Rate limiting
        usleep(1000000); // 1 second between each lead
    }

    writeLog("Pipeline tamamlandı. Zenginleştirilen: $enrichedCount | Hazır: $readyToSendCount | Başarısız: $failedCount", "INFO");
    echo "\nSUCCESS: Pipeline tamamlandı. $readyToSendCount lead gönderime hazır.\n";

} catch (Exception $e) {
    writeLog("HATA: " . $e->getMessage(), "ERROR");
    echo "ERROR: " . $e->getMessage() . "\n";
}
