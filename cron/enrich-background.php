<?php
/**
 * Lead Hunter - Arka Plan Veri Zenginleştirme
 *
 * Frontend'den butona basıldığında çağrılır.
 * ignore_user_abort(true) ile tarayıcı kapansa bile çalışmaya devam eder.
 * Progress bilgisini enrich-progress.json dosyasına yazar.
 * cPanel shared hosting için kaynak dostu: her lead arasında 3 saniye bekler.
 *
 * Kullanım:
 *   POST: ?action=start&mode=BOTH|EMAIL|TRAFFIC  (işlemi başlat)
 *   GET:  ?action=status                          (durumu kontrol et)
 *   POST: ?action=stop                            (işlemi durdur)
 */

// Tarayıcı kapansa bile çalışmaya devam et
ignore_user_abort(true);
set_time_limit(0);

// CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

define('SERVICE_ACCOUNT_FILE', __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json');
define('SERVER_URL', 'https://leadhunter.tevfikgulep.com/traffic-api.php');
define('PROGRESS_FILE', __DIR__ . '/../logs/enrich-progress.json');
define('LOCK_FILE', __DIR__ . '/../logs/enrich.lock');
define('ENRICH_LOG_FILE', __DIR__ . '/../logs/enrich-background.log');
define('CANDIDATES_FILE', __DIR__ . '/../logs/enrich-candidates.json');

// Rate limit: cPanel hosting kaynakları için her lead arası bekleme (saniye)
define('DELAY_BETWEEN_LEADS', 3);
// Her batch arasında ekstra bekleme (saniye)
define('DELAY_BETWEEN_BATCHES', 5);
// Batch başına işlenecek lead sayısı
define('BATCH_SIZE', 10);

function writeLog($message, $type = 'INFO') {
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] [$type] $message\n";
    @file_put_contents(ENRICH_LOG_FILE, $logMessage, FILE_APPEND);
}

function writeProgress($data) {
    $data['updatedAt'] = date('c');
    @file_put_contents(PROGRESS_FILE, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

function readProgress() {
    if (!file_exists(PROGRESS_FILE)) return null;
    $content = @file_get_contents(PROGRESS_FILE);
    if (!$content) return null;
    return json_decode($content, true);
}

function addProgressLog($msg, $type = 'info') {
    $progress = readProgress();
    if (!$progress) return;

    $progress['logs'][] = [
        'time' => date('H:i:s'),
        'msg' => $msg,
        'type' => $type
    ];

    // Son 200 log'u tut (hafıza tasarrufu)
    if (count($progress['logs']) > 200) {
        $progress['logs'] = array_slice($progress['logs'], -200);
    }

    writeProgress($progress);
}

function isStopRequested() {
    $progress = readProgress();
    return $progress && isset($progress['stopRequested']) && $progress['stopRequested'] === true;
}

function acquireLock() {
    if (file_exists(LOCK_FILE)) {
        $lockTime = @file_get_contents(LOCK_FILE);
        $elapsed = time() - (int)$lockTime;
        // 2 saatten eski lock dosyası varsa sil (stuck process)
        if ($elapsed > 7200) {
            @unlink(LOCK_FILE);
            writeLog("Eski lock dosyası silindi ({$elapsed}s)", "WARN");
        } else {
            return false;
        }
    }
    file_put_contents(LOCK_FILE, (string)time());
    return true;
}

function releaseLock() {
    @unlink(LOCK_FILE);
}

// --- FIREBASE HELPERS ---
function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function getFirebaseAccessToken($serviceAccountFile) {
    if (!file_exists($serviceAccountFile)) {
        writeLog("Service account dosyası bulunamadı: $serviceAccountFile", "ERROR");
        return null;
    }

    $fileContent = file_get_contents($serviceAccountFile);
    if (!$fileContent) {
        writeLog("Service account dosyası okunamadı", "ERROR");
        return null;
    }

    $serviceAccount = json_decode($fileContent, true);
    if (!$serviceAccount || !isset($serviceAccount['client_email']) || !isset($serviceAccount['private_key'])) {
        writeLog("Service account JSON parse hatası veya eksik alan", "ERROR");
        return null;
    }

    writeLog("Service account OK: " . $serviceAccount['client_email'], "DEBUG");

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
    $signResult = openssl_sign($header . '.' . $payload, $signature, $serviceAccount['private_key'], OPENSSL_ALGO_SHA256);
    if (!$signResult) {
        $opensslError = openssl_error_string();
        writeLog("OpenSSL imzalama hatası: $opensslError", "ERROR");
        return null;
    }
    $signature = base64url_encode($signature);

    $jwt = $header . '.' . $payload . '.' . $signature;
    writeLog("JWT oluşturuldu, Google OAuth'a istek gönderiliyor...", "DEBUG");

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://oauth2.googleapis.com/token');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $jwt
    ]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($curlError) {
        writeLog("cURL hatası: $curlError", "ERROR");
        return null;
    }

    writeLog("Google OAuth yanıtı HTTP $httpCode, Length: " . strlen($response), "DEBUG");

    $tokenData = json_decode($response, true);
    if (!$tokenData) {
        writeLog("Token parse hatası. Yanıt: " . substr($response, 0, 500), "ERROR");
        return null;
    }

    $token = $tokenData['access_token'] ?? $tokenData['id_token'] ?? null;
    
    if (!$token) {
        writeLog("Token bulunamadı. Yanıt: " . substr($response, 0, 500), "ERROR");
        return null;
    }

    writeLog("Firebase token alındı ✓ (Tip: " . (isset($tokenData['access_token']) ? 'access' : 'id') . ")", "DEBUG");
    return $token;
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

function getMapValue($fields, $key) {
    if (!isset($fields[$key])) return null;
    if (isset($fields[$key]['mapValue']['fields'])) {
        $map = [];
        foreach ($fields[$key]['mapValue']['fields'] as $k => $v) {
            if (isset($v['stringValue'])) $map[$k] = $v['stringValue'];
            elseif (isset($v['integerValue'])) $map[$k] = (int)$v['integerValue'];
            elseif (isset($v['doubleValue'])) $map[$k] = (float)$v['doubleValue'];
            elseif (isset($v['booleanValue'])) $map[$k] = $v['booleanValue'];
        }
        return $map;
    }
    return null;
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
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $data = json_decode($response, true);
        
        if ($httpCode !== 200) {
            writeLog("Firestore getAllLeads Hatası HTTP $httpCode: " . substr($response, 0, 500), "ERROR");
        }

        if (isset($data['documents'])) {
            foreach ($data['documents'] as $doc) {
                $docName = $doc['name'] ?? '';
                $docId = basename($docName);
                $fields = $doc['fields'] ?? [];

                $trafficStatus = getMapValue($fields, 'trafficStatus');

                $leads[] = [
                    'id' => $docId,
                    'url' => getStringValue($fields, 'url'),
                    'email' => getStringValue($fields, 'email'),
                    'statusKey' => getStringValue($fields, 'statusKey', 'NEW'),
                    'language' => getStringValue($fields, 'language', 'TR'),
                    'stage' => getIntValue($fields, 'stage', 0),
                    'trafficStatus' => $trafficStatus
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

function cleanDomain($url) {
    $host = parse_url($url, PHP_URL_HOST);
    if (!$host) $host = $url;
    return preg_replace('/^www\./', '', strtolower($host));
}

// ==============================
// ROUTER: action parametresine göre yönlendir
// ==============================

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// --- STATUS: Progress durumunu döndür ---
if ($action === 'status') {
    $progress = readProgress();
    if (!$progress) {
        echo json_encode(['success' => true, 'status' => 'idle', 'message' => 'Aktif işlem yok']);
    } else {
        // Eğer işlem 'running' durumundaysa ancak 10 dakikadan (600s) uzun süredir güncellenmiyorsa
        // sunucu arka plan işlemini (zaman aşımı vs. sebebiyle) öldürmüş demektir.
        if (isset($progress['status']) && $progress['status'] === 'running' && isset($progress['updatedAt'])) {
            $updatedAt = strtotime($progress['updatedAt']);
            if (time() - $updatedAt > 600) {
                $progress['status'] = 'error';
                $progress['errorMessage'] = 'İşlem sunucu tarafından beklenmedik şekilde sonlandırıldı (zaman aşımı). Kaldığınız yerden tekrar başlatabilirsiniz.';
                @unlink(LOCK_FILE);
                writeLog("Stuck process tespit edildi, kilit açıldı ve durum hataya çekildi.", "WARN");
                writeProgress($progress);
            }
        }
        
        echo json_encode(['success' => true, 'status' => $progress['status'] ?? 'unknown', 'data' => $progress]);
    }
    exit;
}

// --- STOP: Durma isteği gönder ---
if ($action === 'stop') {
    $progress = readProgress();
    if ($progress && $progress['status'] === 'running') {
        $progress['stopRequested'] = true;
        writeProgress($progress);
        writeLog("Durdurma isteği alındı", "INFO");
        echo json_encode(['success' => true, 'message' => 'Durdurma isteği gönderildi']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Aktif işlem yok']);
    }
    exit;
}

// --- START: Zenginleştirme işlemini başlat ---
if ($action === 'start') {

    $mode = $_GET['mode'] ?? $_POST['mode'] ?? 'BOTH'; // BOTH, EMAIL, TRAFFIC
    $internalResume = isset($_GET['internal_resume']) || isset($_POST['internal_resume']);

    // Lock kontrolü — zaten çalışıyorsa başlatma
    if (!acquireLock()) {
        $progress = readProgress();
        echo json_encode([
            'success' => false,
            'message' => 'Bir zenginleştirme işlemi zaten çalışıyor',
            'status' => 'already_running',
            'data' => $progress
        ]);
        exit;
    }

    if ($internalResume) {
        $progress = readProgress() ?: [];
        $progress['status'] = 'starting';
        $progress['logs'][] = ['time' => date('H:i:s'), 'msg' => 'Sunucu limiti atlatıldı: Süreç kaldığı yerden devam ettiriliyor...', 'type' => 'info'];
        writeProgress($progress);
    } else {
        // Hemen cevap ver, sonra arka planda çalışmaya devam et
        writeProgress([
            'status' => 'starting',
            'mode' => $mode,
            'current' => 0,
            'total' => 0,
            'enrichedCount' => 0,
            'failedCount' => 0,
            'logs' => [['time' => date('H:i:s'), 'msg' => 'İşlem başlatılıyor...', 'type' => 'info']],
            'startedAt' => date('c'),
            'stopRequested' => false
        ]);
        if (file_exists(CANDIDATES_FILE)) {
            @unlink(CANDIDATES_FILE);
        }
    }

    // Yanıtı hemen gönder (bağlantı kapansa bile devam et)
    echo json_encode(['success' => true, 'message' => 'Zenginleştirme işlemi başlatıldı', 'status' => 'started', 'mode' => $mode]);

    // Output buffer'ı flush et
    if (ob_get_level()) ob_end_flush();
    flush();

    // Eğer fastcgi varsa bağlantıyı kapat
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    }

    // ============================
    // ARKA PLAN İŞLEMİ BURADAN BAŞLAR
    // ============================

    writeLog("Zenginleştirme başlıyor (Mode: $mode)", "INFO");

    try {
        // Firebase bağlantısı
        if (!file_exists(SERVICE_ACCOUNT_FILE)) {
            addProgressLog("Service account bulunamadı!", "error");
            writeProgress(['status' => 'error', 'message' => 'Service account bulunamadı', 'logs' => []]);
            releaseLock();
            exit;
        }

        $serviceAccount = json_decode(file_get_contents(SERVICE_ACCOUNT_FILE), true);
        $projectId = $serviceAccount['project_id'];

        $accessToken = getFirebaseAccessToken(SERVICE_ACCOUNT_FILE);
        if (!$accessToken) {
            addProgressLog("Firebase token alınamadı!", "error");
            writeProgress(['status' => 'error', 'message' => 'Firebase token alınamadı', 'logs' => []]);
            releaseLock();
            exit;
        }

        addProgressLog("Firebase bağlantısı başarılı", "success");
        writeLog("Firebase bağlantısı OK", "INFO");

        $scriptStartTime = time();
        $candidates = [];
        $totalCount = 0;
        $startingIndex = 0;
        $enrichedCount = 0;
        $failedCount = 0;

        if ($internalResume && file_exists(CANDIDATES_FILE)) {
            $candidates = json_decode(file_get_contents(CANDIDATES_FILE), true) ?: [];
            $totalCount = count($candidates);
            $p = readProgress();
            $startingIndex = isset($p['current']) ? $p['current'] : 0;
            $enrichedCount = isset($p['enrichedCount']) ? $p['enrichedCount'] : 0;
            $failedCount = isset($p['failedCount']) ? $p['failedCount'] : 0;
            
            writeLog("İçsel Devam (Resume) tetiklendi. Başlangıç indeksi: $startingIndex", "INFO");
            addProgressLog("Kaldığı yerden devam ediliyor...", "info");
        } else {
            // Tüm lead'leri çek
            addProgressLog("Lead'ler yükleniyor...", "info");
            $allLeads = getAllLeads($accessToken, $projectId);
            addProgressLog("Toplam " . count($allLeads) . " lead yüklendi", "info");
            writeLog("Toplam lead: " . count($allLeads), "INFO");
    
            // Filtreleme: Hangi lead'ler zenginleştirilecek?
            $negativeStatuses = ['NOT_VIABLE', 'DENIED', 'DEAL_OFF', 'NON_RESPONSIVE'];
    
            $candidates = array_filter($allLeads, function($lead) use ($negativeStatuses, $mode) {
                if (in_array($lead['statusKey'], $negativeStatuses)) return false;
    
                $missingEmail = empty($lead['email']) || strlen($lead['email']) < 5 || $lead['email'] === '-' || $lead['statusKey'] === 'MAIL_ERROR';
    
                $ts = $lead['trafficStatus'];
                $missingTraffic = !$ts || !isset($ts['label']) || in_array($ts['label'] ?? '', ['Bilinmiyor', 'Veri Yok', 'Hata', '-', 'API Ayarı Yok']) || !isset($ts['value']) || $ts['value'] < 100;
    
                if ($mode === 'EMAIL') return $missingEmail;
                if ($mode === 'TRAFFIC') return $missingTraffic;
                return $missingEmail || $missingTraffic;
            });
    
            $candidates = array_values($candidates);
            $totalCount = count($candidates);
            @file_put_contents(CANDIDATES_FILE, json_encode($candidates, JSON_UNESCAPED_UNICODE));
        }

        if ($totalCount === 0 || $startingIndex >= $totalCount) {
            addProgressLog("Zenginleştirilecek / Kalan lead bulunamadı", "success");
            $progress = readProgress();
            $progress['status'] = 'completed';
            $progress['total'] = 0;
            $progress['current'] = 0;
            writeProgress($progress);
            writeLog("Zenginleştirilecek lead yok", "INFO");
            releaseLock();
            exit;
        }

        addProgressLog("$totalCount lead zenginleştirilecek (Mod: $mode)", "info");
        writeLog("Zenginleştirilecek: $totalCount (Mode: $mode)", "INFO");

        // Progress güncelle
        $progress = readProgress();
        $progress['status'] = 'running';
        $progress['total'] = $totalCount;
        if (!$internalResume) {
            $progress['current'] = 0;
            $progress['enrichedCount'] = 0;
            $progress['failedCount'] = 0;
        }
        writeProgress($progress);

        $tokenRefreshTime = time();

        // Her BATCH_SIZE lead'de bir durum kontrolü ve token yenileme
        for ($i = $startingIndex; $i < $totalCount; $i++) {

            // Durdurma isteği kontrolü
            if (isStopRequested()) {
                addProgressLog("İşlem kullanıcı tarafından durduruldu", "warning");
                writeLog("İşlem durduruldu (kullanıcı isteği)", "WARN");
                break;
            }

            // Zaman limiti kontrolü (Sunucunun script'i öldürmemesi için 50 dakikada bir kendini resetler)
            if (time() - $scriptStartTime > 3000) {
                addProgressLog("Süre limiti doluyor. İşlem arka planda yeni bir süreçle devam ettirilecek...", "warning");
                writeLog("Süre limiti aşıldı, internal resume tetikleniyor...", "INFO");
                releaseLock(); // Kilidi aç ki yeni süreç alabilsin
                
                $baseUrl = 'https://' . $_SERVER['HTTP_HOST'] . strtok($_SERVER['REQUEST_URI'], '?');
                $url = $baseUrl . '?action=start&internal_resume=1&mode=' . urlencode($mode);
                
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT_MS, 1500); // çok kısa tutarak bağlantıyı asenkron çalışmaya bırak
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_exec($ch);
                curl_close($ch);
                
                exit; 
            }

            // Token yenileme (50 dakikada bir)
            if (time() - $tokenRefreshTime > 3000) {
                $newToken = getFirebaseAccessToken(SERVICE_ACCOUNT_FILE);
                if ($newToken) {
                    $accessToken = $newToken;
                    $tokenRefreshTime = time();
                    writeLog("Token yenilendi", "INFO");
                }
            }

            $lead = $candidates[$i];
            $domain = cleanDomain($lead['url']);
            $updates = [];

            // Progress güncelle
            $progress = readProgress();
            $progress['current'] = $i + 1;
            writeProgress($progress);

            addProgressLog("$domain analizi başlıyor... (" . ($i + 1) . "/$totalCount)", "info");

            $missingEmail = empty($lead['email']) || strlen($lead['email']) < 5 || $lead['statusKey'] === 'MAIL_ERROR';
            $ts = $lead['trafficStatus'];
            $missingTraffic = !$ts || !isset($ts['label']) || in_array($ts['label'] ?? '', ['Bilinmiyor', 'Veri Yok', 'Hata', '-', 'API Ayarı Yok']) || !isset($ts['value']) || $ts['value'] < 100;

            // === TRAFFIC CHECK ===
            if (($mode === 'TRAFFIC' || $mode === 'BOTH') && $missingTraffic) {
                addProgressLog("> Trafik aranıyor...", "warning");

                $trafficUrl = SERVER_URL . "?type=traffic&domain=" . urlencode($domain);
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $trafficUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 20);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                $trafficResp = curl_exec($ch);
                curl_close($ch);

                $traffic = json_decode($trafficResp, true);
                if ($traffic && $traffic['success'] && isset($traffic['value'])) {
                    $updates['trafficStatus'] = [
                        'viable' => $traffic['value'] > 20000,
                        'value' => (int)$traffic['value'],
                        'label' => $traffic['label'] ?? 'Bilinmiyor'
                    ];
                    addProgressLog("> Trafik bulundu: " . ($traffic['label'] ?? '?'), "success");
                } else {
                    addProgressLog("> Trafik verisi alınamadı", "error");
                }

                // Trafik istekleri arasında kısa bekleme
                usleep(500000);
            }

            // === EMAIL DISCOVERY ===
            if (($mode === 'EMAIL' || $mode === 'BOTH') && $missingEmail) {
                addProgressLog("> Email taranıyor...", "warning");

                $emailUrl = SERVER_URL . "?type=email&domain=" . urlencode($domain);
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $emailUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 30);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                $emailResp = curl_exec($ch);
                curl_close($ch);

                $emailData = json_decode($emailResp, true);
                $foundEmail = '';

                if ($emailData && $emailData['success'] && !empty($emailData['emails'])) {
                    $foundEmail = implode(', ', $emailData['emails']);
                    $updates['email'] = $foundEmail;
                    addProgressLog("> Email bulundu: $foundEmail", "success");
                } else {
                    addProgressLog("> Email bulunamadı, deep scan deneniyor...", "warning");

                    // Deep scan
                    $deepUrl = SERVER_URL . "?type=email_deep&domain=" . urlencode($domain);
                    $ch = curl_init();
                    curl_setopt($ch, CURLOPT_URL, $deepUrl);
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
                    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                    $deepResp = curl_exec($ch);
                    curl_close($ch);

                    $deepData = json_decode($deepResp, true);
                    if ($deepData && $deepData['success'] && !empty($deepData['emails'])) {
                        $foundEmail = implode(', ', $deepData['emails']);
                        $updates['email'] = $foundEmail;
                        addProgressLog("> Deep scan email: $foundEmail", "success");
                    } else {
                        addProgressLog("> Deep scan: email bulunamadı", "error");
                    }
                }

                // MAIL_ERROR durumundaysa ve email bulunduysa düzelt
                if ($foundEmail && $lead['statusKey'] === 'MAIL_ERROR') {
                    $updates['statusKey'] = 'New';
                    $updates['stage'] = 0;
                    addProgressLog("> Durum düzeltildi (New)", "success");
                }
            }

            // === FIRESTORE GÜNCELLE ===
            if (count($updates) > 0) {
                $success = updateFirestoreLead($accessToken, $projectId, $lead['id'], $updates);
                if ($success) {
                    $enrichedCount++;
                    addProgressLog("✓ Veritabanı güncellendi", "success");
                } else {
                    $failedCount++;
                    addProgressLog("✗ DB yazma hatası", "error");
                }
            } else {
                addProgressLog("- Güncelleme yapılmadı", "info");
            }

            // Progress güncelle
            $progress = readProgress();
            $progress['enrichedCount'] = $enrichedCount;
            $progress['failedCount'] = $failedCount;
            writeProgress($progress);

            // cPanel hosting kaynak dostu bekleme
            sleep(DELAY_BETWEEN_LEADS);

            // Her batch sonunda ekstra bekleme
            if (($i + 1) % BATCH_SIZE === 0 && ($i + 1) < $totalCount) {
                addProgressLog("Batch tamamlandı, " . DELAY_BETWEEN_BATCHES . "s bekleniyor...", "info");
                sleep(DELAY_BETWEEN_BATCHES);
            }
        }

        // SON DURUM
        addProgressLog("Tüm işlemler tamamlandı! Zenginleştirilen: $enrichedCount | Başarısız: $failedCount", "success");
        writeLog("Tamamlandı. Zenginleştirilen: $enrichedCount | Başarısız: $failedCount", "INFO");

        $progress = readProgress();
        $progress['status'] = 'completed';
        $progress['enrichedCount'] = $enrichedCount;
        $progress['failedCount'] = $failedCount;
        $progress['completedAt'] = date('c');
        writeProgress($progress);

    } catch (Exception $e) {
        writeLog("HATA: " . $e->getMessage(), "ERROR");
        addProgressLog("Kritik hata: " . $e->getMessage(), "error");
        $progress = readProgress();
        if ($progress) {
            $progress['status'] = 'error';
            $progress['errorMessage'] = $e->getMessage();
            writeProgress($progress);
        }
    }

    releaseLock();
    exit;
}

// Geçersiz action
echo json_encode(['success' => false, 'message' => 'Geçersiz action. Desteklenen: start, status, stop']);
