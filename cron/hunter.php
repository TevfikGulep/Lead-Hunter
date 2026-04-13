<?php
/**
 * Lead Hunter - Otomatik Tarama Cron Script (v2 - Firebase REST API)
 *
 * cPanel Cron Job:
 * Pazartesi 03:00: /usr/bin/php /home/[cpanel_kullanici]/public_html/cron/hunter.php
 * Manuel: ?manual=1 veya ?secret=LEADHUNTER_CRON_2026
 */

define('SERVICE_ACCOUNT_FILE', __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json');
define('SECRET_KEY', 'LEADHUNTER_CRON_2026');
define('LOG_FILE', __DIR__ . '/../logs/hunter.log');
define('SERVER_URL', 'https://leadhunter.tevfikgulep.com/traffic-api.php');

header('Content-Type: text/plain; charset=utf-8');

function writeLog($message, $type = 'INFO') {
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] [$type] $message\n";
    @file_put_contents(LOG_FILE, $logMessage, FILE_APPEND);
    echo $logMessage;
}

// --- AUTH & ACCESS CONTROL ---
$isManual = isset($_GET['manual']);
$secret = $_GET['secret'] ?? '';

if ($secret === SECRET_KEY) {
    writeLog("Güvenli erişimle tarama başlatıldı", "INFO");
} elseif ($isManual) {
    writeLog("Manuel tarama başlatıldı", "INFO");
} else {
    // CLI'dan çağrı (cron) - zaman kontrolünü cron'a bırak, burada guard yok
    // Haftalık tekrar koruması: son çalışma 6 gündür geçmediyse atla
    $now = new DateTime('now', new DateTimeZone('Europe/Istanbul'));
    writeLog("Cron tetiklendi (CLI) - " . $now->format('Y-m-d H:i:s') . " TRT", "INFO");
}

// --- FIREBASE AUTH (copy exact pattern from followup.php) ---
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

    $privateKey = $serviceAccount['private_key'];
    $signature = '';
    openssl_sign($header . '.' . $payload, $signature, $privateKey, OPENSSL_ALGO_SHA256);
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

    $result = json_decode($response, true);
    return $result['access_token'] ?? null;
}

function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

// --- FIRESTORE HELPERS ---
function getFirestoreSettings($accessToken, $projectId) {
    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/system/config";
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $accessToken"]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) return null;
    $data = json_decode($response, true);
    return $data['fields'] ?? null;
}

function getStringValue($fields, $key, $default = '') {
    if (!isset($fields[$key])) return $default;
    $field = $fields[$key];
    if (isset($field['stringValue'])) return $field['stringValue'];
    if (isset($field['integerValue'])) return (string)$field['integerValue'];
    return $default;
}

function getIntValue($fields, $key, $default = 0) {
    if (!isset($fields[$key])) return $default;
    $field = $fields[$key];
    if (isset($field['integerValue'])) return (int)$field['integerValue'];
    if (isset($field['stringValue'])) return (int)$field['stringValue'];
    return $default;
}

function getBoolValue($fields, $key, $default = false) {
    if (!isset($fields[$key])) return $default;
    return isset($fields[$key]['booleanValue']) ? $fields[$key]['booleanValue'] : $default;
}

function getExistingDomains($accessToken, $projectId) {
    $domains = [];
    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/leads?pageSize=1000";
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
                $fields = $doc['fields'] ?? [];
                $docUrl = getStringValue($fields, 'url');
                if ($docUrl) {
                    $parsed = parse_url($docUrl, PHP_URL_HOST);
                    if ($parsed) $domains[] = strtolower(preg_replace('/^www\./', '', $parsed));
                }
            }
        }
        $nextPageToken = $data['nextPageToken'] ?? null;
    } while ($nextPageToken);

    return $domains;
}

function addFirestoreLead($accessToken, $projectId, $leadData) {
    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/leads";

    $fields = [];
    foreach ($leadData as $key => $value) {
        if ($key === 'trafficStatus' && is_array($value)) {
            // Map type for trafficStatus
            $mapFields = [];
            foreach ($value as $k => $v) {
                if (is_bool($v)) {
                    $mapFields[$k] = ['booleanValue' => $v];
                } elseif (is_int($v) || is_float($v)) {
                    $mapFields[$k] = ['doubleValue' => $v];
                } else {
                    $mapFields[$k] = ['stringValue' => (string)$v];
                }
            }
            $fields[$key] = ['mapValue' => ['fields' => $mapFields]];
        } elseif ($key === 'activityLog' && is_array($value)) {
            // Array type for activityLog
            $arrayValues = [];
            foreach ($value as $entry) {
                $entryFields = [];
                foreach ($entry as $k => $v) {
                    $entryFields[$k] = ['stringValue' => (string)$v];
                }
                $arrayValues[] = ['mapValue' => ['fields' => $entryFields]];
            }
            $fields[$key] = ['arrayValue' => ['values' => $arrayValues]];
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
    curl_setopt($ch, CURLOPT_POST, true);
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

function updateFirestoreSettings($accessToken, $projectId, $updates) {
    $maskParams = array_map(function($key) {
        return 'updateMask.fieldPaths=' . urlencode($key);
    }, array_keys($updates));
    $maskQuery = implode('&', $maskParams);

    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/system/config?$maskQuery";

    $fields = [];
    foreach ($updates as $key => $value) {
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

    return $httpCode === 200;
}

// === MAIN EXECUTION ===
try {
    writeLog("Tarama başladı", "INFO");

    // 1. Firebase Auth
    if (!file_exists(SERVICE_ACCOUNT_FILE)) {
        writeLog("Service account dosyası bulunamadı", "ERROR");
        exit;
    }

    $serviceAccount = json_decode(file_get_contents(SERVICE_ACCOUNT_FILE), true);
    $projectId = $serviceAccount['project_id'];

    $accessToken = getFirebaseAccessToken(SERVICE_ACCOUNT_FILE);
    if (!$accessToken) {
        writeLog("Firebase access token alınamadı", "ERROR");
        exit;
    }
    writeLog("Firebase bağlantısı başarılı (Proje: $projectId)", "INFO");

    // 2. Settings
    $settingsFields = getFirestoreSettings($accessToken, $projectId);
    if (!$settingsFields) {
        writeLog("Ayarlar bulunamadı", "ERROR");
        exit;
    }

    $ilceListesi = getStringValue($settingsFields, 'ilceListesi');
    $hunterTargetCount = getIntValue($settingsFields, 'hunterTargetCount', 100);
    $lastIlceIndex = getIntValue($settingsFields, 'lastHunterIlceIndex', 0);
    $autoHunterEnabled = getBoolValue($settingsFields, 'autoHunterEnabled', false);
    $googleApiKey = getStringValue($settingsFields, 'googleApiKey');
    $searchEngineId = getStringValue($settingsFields, 'searchEngineId');

    if (empty($ilceListesi)) {
        writeLog("İlçe listesi boş", "ERROR");
        exit;
    }

    $ilceList = array_filter(array_map('trim', explode("\n", $ilceListesi)));
    writeLog("Hedef: $hunterTargetCount site | Son index: $lastIlceIndex | İlçe: " . count($ilceList), "INFO");

    // 3. Get existing domains
    writeLog("Mevcut domainler kontrol ediliyor...", "INFO");
    $existingDomains = getExistingDomains($accessToken, $projectId);
    writeLog("Mevcut domain sayısı: " . count($existingDomains), "INFO");

    // 4. Keywords
    $keywords = ['haberleri', 'son dakika', 'güncel', 'haber', 'gazete'];

    // 5. Search loop
    $foundViableCount = 0;
    $totalSearches = 0;
    $addedCount = 0;

    for ($i = 0; $i < count($ilceList) && $foundViableCount < $hunterTargetCount; $i++) {
        $ilce = $ilceList[($lastIlceIndex + $i) % count($ilceList)];

        foreach ($keywords as $kw) {
            if ($foundViableCount >= $hunterTargetCount) break;

            $query = "$ilce $kw";
            $totalSearches++;
            writeLog("[$totalSearches] Aranıyor: $query", "INFO");

            // Fallback chain: Google CSE → Brave → Bing → DuckDuckGo → DataForSEO
            $tryUrl = function($url) {
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 45);
                $r = curl_exec($ch);
                curl_close($ch);
                return json_decode($r, true);
            };

            // 1. PRIMARY: Google Custom Search API
            $json = $tryUrl(SERVER_URL . "?type=search&q=" . urlencode($query) . "&depth=30&gl=TR&apiKey=" . urlencode($googleApiKey) . "&cx=" . urlencode($searchEngineId));

            // 2. FALLBACK: Brave Search API
            if (!$json || !$json['success'] || empty($json['results'])) {
                writeLog("Google CSE başarısız, Brave deneniyor...", "WARN");
                $json = $tryUrl(SERVER_URL . "?type=search_brave&q=" . urlencode($query) . "&depth=20&gl=tr");
            }

            // 3. FALLBACK: Bing scraping
            if (!$json || !$json['success'] || empty($json['results'])) {
                writeLog("Brave başarısız, Bing deneniyor...", "WARN");
                $json = $tryUrl(SERVER_URL . "?type=search_bing&q=" . urlencode($query) . "&depth=30&gl=TR");
            }

            // 4. FALLBACK: DuckDuckGo scraping
            if (!$json || !$json['success'] || empty($json['results'])) {
                writeLog("Bing başarısız, DuckDuckGo deneniyor...", "WARN");
                $json = $tryUrl(SERVER_URL . "?type=search_duckduckgo&q=" . urlencode($query) . "&depth=30&gl=TR");
            }

            // 5. SON ÇARE: DataForSEO
            if (!$json || !$json['success'] || empty($json['results'])) {
                writeLog("DDG başarısız, DataForSEO (son çare) deneniyor...", "WARN");
                $json = $tryUrl(SERVER_URL . "?type=search_dataforseo&q=" . urlencode($query) . "&depth=10&gl=TR");
            }

            if ($json && isset($json['success']) && $json['success'] && !empty($json['results'])) {
                writeLog("Sonuç: " . count($json['results']) . " site bulundu", "INFO");

                foreach ($json['results'] as $r) {
                    if ($foundViableCount >= $hunterTargetCount) break;

                    $domain = parse_url($r['url'], PHP_URL_HOST);
                    if (!$domain) continue;
                    $domain = strtolower(preg_replace('/^www\./', '', $domain));

                    // Skip duplicates
                    if (in_array($domain, $existingDomains)) continue;

                    // Traffic check
                    $trafficUrl = SERVER_URL . "?type=traffic&domain=" . urlencode($domain);
                    $ch = curl_init();
                    curl_setopt($ch, CURLOPT_URL, $trafficUrl);
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
                    $trafficResponse = curl_exec($ch);
                    curl_close($ch);

                    $traffic = json_decode($trafficResponse, true);

                    if ($traffic && isset($traffic['success']) && $traffic['success'] && isset($traffic['value']) && $traffic['value'] > 20000) {
                        // Email discovery
                        $emailUrl = SERVER_URL . "?type=email&domain=" . urlencode($domain);
                        $ch = curl_init();
                        curl_setopt($ch, CURLOPT_URL, $emailUrl);
                        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
                        $emailResponse = curl_exec($ch);
                        curl_close($ch);

                        $emailData = json_decode($emailResponse, true);
                        $foundEmail = '';
                        if ($emailData && $emailData['success'] && !empty($emailData['emails'])) {
                            $foundEmail = implode(', ', $emailData['emails']);
                        }

                        // Determine initial status
                        $statusKey = $foundEmail ? 'READY_TO_SEND' : 'NEW';
                        $statusLabel = $foundEmail ? 'Ready to Send' : 'New';

                        // Add to Firestore
                        $newLead = [
                            'url' => 'https://' . $domain,
                            'email' => $foundEmail,
                            'statusKey' => $statusKey,
                            'statusLabel' => $statusLabel,
                            'stage' => 0,
                            'language' => 'TR',
                            'trafficStatus' => [
                                'viable' => true,
                                'value' => (int)($traffic['value'] ?? 0),
                                'label' => $traffic['label'] ?? 'Bilinmiyor'
                            ],
                            'addedDate' => date('c'),
                            'addedBy' => 'auto-hunter',
                            'autoFollowupEnabled' => false,
                            'activityLog' => [[
                                'date' => date('c'),
                                'type' => 'SYSTEM',
                                'content' => 'Otomatik Hunter tarafından eklendi (Trafik: ' . ($traffic['label'] ?? '?') . ')'
                            ]]
                        ];

                        $addResult = addFirestoreLead($accessToken, $projectId, $newLead);

                        if ($addResult) {
                            $foundViableCount++;
                            $addedCount++;
                            $existingDomains[] = $domain;
                            $emailNote = $foundEmail ? " | Email: $foundEmail" : " | Email: Bulunamadı";
                            writeLog("✅ Eklendi [$addedCount]: $domain (Trafik: " . ($traffic['label'] ?? '?') . "$emailNote)", "SUCCESS");
                        } else {
                            writeLog("❌ Firebase yazma hatası: $domain", "ERROR");
                        }
                    }

                    usleep(500000); // 0.5s rate limit
                }
            } else {
                writeLog("Sonuç bulunamadı: $query", "WARN");
            }

            sleep(1); // Between searches
        }

        // Update index
        $lastIlceIndex = ($lastIlceIndex + 1) % count($ilceList);
    }

    // 6. Save state
    updateFirestoreSettings($accessToken, $projectId, [
        'lastHunterIlceIndex' => $lastIlceIndex,
        'lastHunterRunDate' => date('c')
    ]);

    writeLog("Tarama tamamlandı. Bulunan: $foundViableCount | Eklenen: $addedCount | Toplam Arama: $totalSearches", "INFO");
    echo "\nSUCCESS: Tarama tamamlandı. $addedCount site eklendi.\n";

} catch (Exception $e) {
    writeLog("HATA: " . $e->getMessage(), "ERROR");
    echo "ERROR: " . $e->getMessage() . "\n";
}
