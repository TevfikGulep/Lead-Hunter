<?php
/**
 * Lead Hunter - Otomatik Takip (Follow-up) Cron Script
 * 
 * Her gÃ¼n saat 10:00'da Ã§alÄ±ÅŸÄ±r (sadece hafta iÃ§i)
 * 7 gÃ¼n Ã¶nce gÃ¶nderilen maillere cevap alÄ±namadÄ±ysa sÄ±radaki maili gÃ¶nderir
 * 
 * cPanel Cron Job:
 * 0 10 * * 1-5 /usr/local/bin/lsphp /home/tevfikgulep/leadhunter.tevfikgulep.com/cron/followup.php
 * 
 * Manuel tetikleme: https://leadhunter.tevfikgulep.com/cron/followup.php?manual=1
 */

// Service Account JSON dosyasÄ± yolu
define('SERVICE_ACCOUNT_FILE', __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json');

// GÃ¼venlik anahtarÄ±
define('SECRET_KEY', 'LEADHUNTER_FOLLOWUP_2026');

// Log dosyasÄ±
define('LOG_FILE', __DIR__ . '/../logs/followup.log');
define('LOCK_FILE', __DIR__ . '/../logs/followup.lock');
define('LAST_RUN_FILE', __DIR__ . '/../logs/followup-last-run.txt');
define('MIN_INTERVAL_SECONDS', 600);

// Log fonksiyonu
function writeLog($message, $type = 'INFO')
{
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] [$type] $message\n";
    @file_put_contents(LOG_FILE, $logMessage, FILE_APPEND);
    echo $logMessage;
}

function base64url_encode($data)
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function exchangeIdTokenForAccessToken($idToken)
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://sts.googleapis.com/v1/token');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:token-exchange',
        'subject_token_type' => 'urn:ietf:params:oauth:token-type:id_token',
        'requested_token_type' => 'urn:ietf:params:oauth:token-type:access_token',
        'subject_token' => $idToken,
        'scope' => 'https://www.googleapis.com/auth/datastore'
    ]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($response === false || !empty($curlErr)) {
        writeLog("STS cURL hatasÄ±: " . $curlErr, "ERROR");
        return null;
    }
    $data = json_decode($response, true);
    if (!is_array($data) || empty($data['access_token'])) {
        writeLog("STS access_token alÄ±namadÄ± (HTTP $httpCode)", "ERROR");
        writeLog("STS ham yanÄ±t (ilk 300): " . substr(trim($response), 0, 300), "ERROR");
        return null;
    }
    return $data['access_token'];
}

// CORS
if (php_sapi_name() !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}

$isManual = isset($_GET['manual']);
$secret = $_GET['secret'] ?? '';
$isCli = (php_sapi_name() === 'cli');

// GÃ¼venlik kontrolÃ¼: CLI'dan (cron) Ã§aÄŸrÄ±ysa bypass
if (!$isCli && $secret !== SECRET_KEY && !$isManual) {
    writeLog("Yetkisiz eriÅŸim denemesi (HTTP, secret yok)", "ERROR");
    http_response_code(403);
    echo "ERROR: Yetkisiz eriÅŸim\n";
    exit;
}

$now = new DateTime('now', new DateTimeZone('Europe/Istanbul'));
if ($isCli) {
    writeLog("=== Cron tetiklendi (CLI) @ " . $now->format('Y-m-d H:i:s') . " TRT ===", "INFO");
} elseif ($isManual) {
    writeLog("=== Manuel takip baÅŸlatÄ±ldÄ± @ " . $now->format('Y-m-d H:i:s') . " TRT ===", "INFO");
} else {
    writeLog("=== GÃ¼venli eriÅŸimle tarama @ " . $now->format('Y-m-d H:i:s') . " TRT ===", "INFO");
}

// Hafta sonu korumasÄ± (CLI'dan da uygulansÄ±n â€” yanlÄ±ÅŸlÄ±kla Cumartesi/Pazar Ã§alÄ±ÅŸmasÄ±n)
$dayOfWeek = (int) $now->format('N');
if (!$isManual && ($dayOfWeek < 1 || $dayOfWeek > 5)) {
    writeLog("Hafta sonu â€” atlandÄ± (GÃ¼n: $dayOfWeek)", "INFO");
    echo "SKIP: Hafta sonu\n";
    exit;
}

writeLog("Follow-up sÃ¼reci baÅŸlÄ±yor (GÃ¼n: $dayOfWeek, Saat TRT: " . $now->format('H:i') . ")", "INFO");

// TekrarlÃ„Â±/ÃƒÂ§akÃ„Â±Ã…Å¸an tetiklemeleri engelle
$lockHandle = @fopen(LOCK_FILE, 'c+');
if (!$lockHandle) {
    writeLog("Lock dosyasi acilamadi: " . LOCK_FILE, "ERROR");
    echo "ERROR: lock dosyasi acilamadi\n";
    exit;
}
if (!@flock($lockHandle, LOCK_EX | LOCK_NB)) {
    writeLog("Baska bir follow-up sureci zaten calisiyor. Bu tetikleme atlandi.", "WARN");
    echo "SKIP: already running\n";
    exit;
}
register_shutdown_function(function () use (&$lockHandle) {
    if (is_resource($lockHandle)) {
        @flock($lockHandle, LOCK_UN);
        @fclose($lockHandle);
    }
});

if (!$isManual) {
    $nowTs = time();
    $lastRunTs = 0;
    if (file_exists(LAST_RUN_FILE)) {
        $lastRunTs = (int) trim((string) @file_get_contents(LAST_RUN_FILE));
    }
    if ($lastRunTs > 0 && ($nowTs - $lastRunTs) < MIN_INTERVAL_SECONDS) {
        $elapsed = $nowTs - $lastRunTs;
        writeLog("Son calisma $elapsed sn once. Min aralik " . MIN_INTERVAL_SECONDS . " sn, bu tetikleme atlandi.", "WARN");
        echo "SKIP: too frequent\n";
        exit;
    }
    @file_put_contents(LAST_RUN_FILE, (string) $nowTs, LOCK_EX);
}

// Firebase access token alma
function getFirebaseAccessToken($serviceAccountFile)
{
    if (!file_exists($serviceAccountFile)) {
        writeLog("Service account dosyasÄ± bulunamadÄ±: " . $serviceAccountFile, "ERROR");
        return null;
    }

    $json = @file_get_contents($serviceAccountFile);
    if ($json === false) {
        writeLog("Service account dosyasÄ± okunamadÄ±", "ERROR");
        return null;
    }

    $serviceAccount = json_decode($json, true);
    if (!is_array($serviceAccount)) {
        writeLog("Service account JSON parse hatasÄ±", "ERROR");
        return null;
    }
    if (empty($serviceAccount['client_email']) || empty($serviceAccount['private_key'])) {
        writeLog("Service account iÃ§inde zorunlu alanlar eksik (client_email/private_key)", "ERROR");
        return null;
    }

    // JWT oluÅŸtur
    $header = base64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'RS256']));

    $now = time();
    $payload = base64url_encode(json_encode([
        'iss' => $serviceAccount['client_email'],
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
        'scope' => 'https://www.googleapis.com/auth/datastore'
    ]));

    $privateKey = $serviceAccount['private_key'];

    // OpenSSL ile imzala
    $signature = '';
    $signed = openssl_sign($header . '.' . $payload, $signature, $privateKey, OPENSSL_ALGO_SHA256);
    if (!$signed) {
        while ($err = openssl_error_string()) {
            writeLog("OpenSSL hata: " . $err, "ERROR");
        }
        writeLog("JWT imzalama baÅŸarÄ±sÄ±z", "ERROR");
        return null;
    }
    $signature = base64url_encode($signature);

    $jwt = $header . '.' . $payload . '.' . $signature;

    // Token al
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://oauth2.googleapis.com/token');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $jwt
    ]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($response === false || !empty($curlErr)) {
        writeLog("OAuth cURL hatasÄ±: " . $curlErr, "ERROR");
        return null;
    }

    $result = json_decode($response, true);
    if (!is_array($result)) {
        writeLog("OAuth yanÄ±tÄ± parse edilemedi (HTTP $httpCode)", "ERROR");
        return null;
    }
    if (empty($result['access_token']) && empty($result['id_token'])) {
        $err = $result['error'] ?? 'unknown_error';
        $desc = $result['error_description'] ?? '';
        writeLog("OAuth token alÄ±namadÄ± (HTTP $httpCode): $err $desc", "ERROR");
        writeLog("OAuth ham yanÄ±t (ilk 300): " . substr(trim($response), 0, 300), "ERROR");
        return null;
    }

    if (!empty($result['access_token'])) {
        return $result['access_token'];
    }
    if (!empty($result['id_token'])) {
        writeLog("OAuth id_token dÃ¶ndÃ¼; STS ile access_token exchange deneniyor", "WARN");
        return exchangeIdTokenForAccessToken($result['id_token']);
    }
    return null;
}

// Firestore'dan lead verilerini Ã§ek
function getFirestoreLeads($accessToken, $projectId)
{
    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents:runQuery";

    // Sorgu: Status NO_REPLY olan leadleri getir
    $query = [
        'structuredQuery' => [
            'from' => ['collectionId' => 'leads'],
            'where' => [
                'fieldFilter' => [
                    'field' => ['fieldPath' => 'statusKey'],
                    'op' => 'EQUAL',
                    'value' => ['stringValue' => 'NO_REPLY']
                ]
            ]
        ]
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($query));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        "Authorization: Bearer $accessToken"
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        return json_decode($response, true);
    }

    writeLog("Firestore sorgu hatasÄ±: HTTP $httpCode", "ERROR");
    return [];
}

// Firestore'dan tÃ¼m leadleri Ã§ek (basit)
function getAllFirestoreLeads($accessToken, $projectId)
{
    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/leads";

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $accessToken"
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        $data = json_decode($response, true);
        return $data['documents'] ?? [];
    }

    writeLog("Firestore okuma hatasÄ±: HTTP $httpCode", "ERROR");
    return [];
}

// Firestore'a veri yazma (updateMask ile sadece belirtilen alanlarÄ± gÃ¼nceller)
function updateFirestoreLead($accessToken, $projectId, $docId, $data)
{
    // updateMask parametreleri oluÅŸtur - sadece gÃ¶nderilen alanlarÄ± gÃ¼ncelle, diÄŸerlerine dokunma
    $maskParams = array_map(function ($key) {
        return 'updateMask.fieldPaths=' . urlencode($key);
    }, array_keys($data));
    $maskQuery = implode('&', $maskParams);

    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/leads/$docId?$maskQuery";

    // Firestore formatÄ±nda veri hazÄ±rla
    $fields = [];
    foreach ($data as $key => $value) {
        if (is_bool($value)) {
            $fields[$key] = ['booleanValue' => $value];
        } elseif (is_int($value)) {
            $fields[$key] = ['integerValue' => (string) $value];
        } elseif (is_null($value)) {
            $fields[$key] = ['nullValue' => null];
        } else {
            $fields[$key] = ['stringValue' => (string) $value];
        }
    }

    $body = json_encode(['fields' => $fields]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $accessToken",
        "Content-Type: application/json"
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return $httpCode === 200 || $httpCode === 201;
}

// Email gÃ¶nderme fonksiyonu (Google Apps Script Ã¼zerinden)
function sendEmail($to, $subject, $body, $googleScriptUrl, $existingThreadId = null)
{
    $htmlBody = nl2br(htmlspecialchars($body));
    $payload = [
        'action' => 'send_mail',
        'to' => $to,
        'subject' => $subject,
        'body' => $body,
        'htmlBody' => $htmlBody,
        'threadId' => $existingThreadId
    ];

    // 1) Proxy-first: traffic-api redirect/JSON davranisini daha stabil handle eder
    $proxyUrl = 'https://leadhunter.tevfikgulep.com/traffic-api.php?type=gscript_proxy';
    $proxyPostData = json_encode([
        'url' => $googleScriptUrl,
        'payload' => $payload
    ]);
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $proxyUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $proxyPostData);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);

    $proxyResponse = curl_exec($ch);
    $proxyHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $proxyCurlErr = curl_error($ch);
    curl_close($ch);

    $proxyResult = json_decode((string) $proxyResponse, true);
    if (
        $proxyHttpCode === 200 &&
        is_array($proxyResult) &&
        isset($proxyResult['status']) &&
        $proxyResult['status'] === 'success'
    ) {
        return [
            'success' => true,
            'threadId' => $proxyResult['threadId'] ?? null,
            'message' => $proxyResult['message'] ?? 'ok'
        ];
    }

    // 2) Fallback: direkt Apps Script
    $directPostData = json_encode($payload);
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $googleScriptUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $directPostData);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: text/plain;charset=utf-8'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    if (defined('CURLOPT_POSTREDIR')) {
        curl_setopt($ch, CURLOPT_POSTREDIR, 3);
    }

    $directResponse = curl_exec($ch);
    $directHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $directCurlErr = curl_error($ch);
    curl_close($ch);

    $directResult = json_decode((string) $directResponse, true);
    $directSuccess = (
        $directHttpCode === 200 &&
        is_array($directResult) &&
        isset($directResult['status']) &&
        $directResult['status'] === 'success'
    );
    if ($directSuccess) {
        return [
            'success' => true,
            'threadId' => $directResult['threadId'] ?? null,
            'message' => $directResult['message'] ?? 'ok'
        ];
    }

    $message = '';
    if (!empty($proxyCurlErr)) {
        $message .= "proxy_curl: " . $proxyCurlErr . " | ";
    }
    if (is_array($proxyResult) && !empty($proxyResult['message'])) {
        $message .= "proxy: " . $proxyResult['message'] . " | ";
    } elseif (!empty($proxyResponse)) {
        $message .= "proxy_raw: " . substr(trim((string) $proxyResponse), 0, 160) . " | ";
    }
    if (!empty($directCurlErr)) {
        $message .= "direct_curl: " . $directCurlErr . " | ";
    }
    if (is_array($directResult) && !empty($directResult['message'])) {
        $message .= "direct: " . $directResult['message'];
    } elseif (!empty($directResponse)) {
        $message .= "direct_raw: " . substr(trim((string) $directResponse), 0, 160);
    }
    if (trim($message) === '') {
        $message = "Proxy HTTP $proxyHttpCode, Direct HTTP $directHttpCode, bos yanit";
    }

    return [
        'success' => false,
        'threadId' => null,
        'message' => trim($message)
    ];
}
try {
    writeLog("Takip iÅŸlemi baÅŸladÄ±", "INFO");

    // Service account dosyasÄ± kontrolÃ¼
    if (!file_exists(SERVICE_ACCOUNT_FILE)) {
        writeLog("Service account dosyasÄ± bulunamadÄ±: " . SERVICE_ACCOUNT_FILE, "ERROR");
        echo "ERROR: Service account dosyasÄ± bulunamadÄ±\n";
        exit;
    }

    $serviceAccount = json_decode(file_get_contents(SERVICE_ACCOUNT_FILE), true);
    $projectId = $serviceAccount['project_id'];

    writeLog("Proje ID: $projectId", "INFO");

    // Firebase access token al
    $accessToken = getFirebaseAccessToken(SERVICE_ACCOUNT_FILE);

    if (!$accessToken) {
        writeLog("Firebase access token alÄ±namadÄ±", "ERROR");
        echo "ERROR: Firebase eriÅŸim saÄŸlanamadÄ±\n";
        exit;
    }

    writeLog("Firebase baÄŸlantÄ±sÄ± baÅŸarÄ±lÄ±", "INFO");

    // 1. Settings Ã§ek
    $settingsUrl = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/system/config";

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $settingsUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $accessToken"]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $settingsResponse = curl_exec($ch);
    $settingsHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $settingsCurlErr = curl_error($ch);
    curl_close($ch);

    if ($settingsResponse === false || !empty($settingsCurlErr)) {
        writeLog("Settings cURL hatasÄ±: " . $settingsCurlErr, "ERROR");
        echo "ERROR: Settings okunamadÄ± (cURL)\n";
        exit;
    }
    if ($settingsHttpCode !== 200) {
        writeLog("Settings okunamadÄ± (HTTP $settingsHttpCode)", "ERROR");
        writeLog("Settings yanÄ±tÄ± (ilk 400): " . substr(trim($settingsResponse), 0, 400), "ERROR");
        echo "ERROR: Settings okunamadÄ± (HTTP $settingsHttpCode)\n";
        exit;
    }

    $settingsData = json_decode($settingsResponse, true);
    if (!is_array($settingsData)) {
        writeLog("Settings JSON parse edilemedi", "ERROR");
        writeLog("Settings ham yanÄ±t (ilk 400): " . substr(trim($settingsResponse), 0, 400), "ERROR");
        echo "ERROR: Settings JSON parse edilemedi\n";
        exit;
    }
    $settingsFields = $settingsData['fields'] ?? [];

    // Helper function to get string value from Firestore fields
    $getStringValue = function ($fields, $key, $default = '') use (&$getStringValue) {
        if (!isset($fields[$key]))
            return $default;
        $field = $fields[$key];
        if (isset($field['stringValue']))
            return $field['stringValue'];
        if (isset($field['value']))
            return $field['value'];
        return $default;
    };

    // Helper function to get array from Firestore fields
    $getArrayValue = function ($fields, $key) use (&$getStringValue) {
        if (!isset($fields[$key]['arrayValue']['values']))
            return [];
        $result = [];
        foreach ($fields[$key]['arrayValue']['values'] as $item) {
            if (!isset($item['mapValue']['fields']))
                continue;
            $map = $item['mapValue']['fields'];
            $parsed = [];
            foreach ($map as $k => $v) {
                $parsed[$k] = $getStringValue($map, $k, '');
            }
            $result[] = $parsed;
        }
        return $result;
    };

    $googleScriptUrl = $getStringValue($settingsFields, 'googleScriptUrl');

    if (empty($googleScriptUrl)) {
        writeLog("Google Script URL bulunamadÄ±", "ERROR");
        echo "ERROR: Google Script URL ayarlanmamÄ±ÅŸ\n";
        exit;
    }

    writeLog("Google Script URL: " . substr($googleScriptUrl, 0, 50) . "...", "INFO");

    $workflowTR = $getArrayValue($settingsFields, 'workflowTR');
    $workflowEN = $getArrayValue($settingsFields, 'workflowEN');

    if (empty($workflowTR)) {
        $workflowTR = [
            ['label' => 'Ä°lk Temas', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Merhabalar...'],
            ['label' => 'Takip 1', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'GeÃ§en haftaki e-postamla ilgili...'],
            ['label' => 'Takip 2', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Siteniz gibi yÃ¼ksek trafiÄŸe sahip...'],
            ['label' => 'Takip 3', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'UmarÄ±m iyisinizdir...'],
            ['label' => 'Takip 4', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Vaktinizi almak istemem...'],
            ['label' => 'Takip 5', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Sizden bir geri dÃ¶nÃ¼ÅŸ alamayÄ±nca...']
        ];
    }
    if (empty($workflowEN)) {
        $workflowEN = [
            ['label' => 'First Contact', 'subject' => '{{Website}} Advertising Partnership', 'body' => 'Hello...'],
            ['label' => 'Follow up 1', 'subject' => '{{Website}} Advertising Partnership', 'body' => 'Regarding my previous email...'],
            ['label' => 'Follow up 2', 'subject' => '{{Website}} Advertising Partnership', 'body' => 'Because of your high traffic...'],
            ['label' => 'Follow up 3', 'subject' => '{{Website}} Advertising Partnership', 'body' => 'Hope you are doing well...'],
            ['label' => 'Follow up 4', 'subject' => '{{Website}} Advertising Partnership', 'body' => 'I don\'t want to take much of your time...'],
            ['label' => 'Follow up 5', 'subject' => '{{Website}} Advertising Partnership', 'body' => 'Since I haven\'t heard back...']
        ];
    }

    // 2. Leadleri Ã§ek
    $leads = getAllFirestoreLeads($accessToken, $projectId);

    if (empty($leads)) {
        writeLog("Lead verileri bulunamadÄ±", "WARN");
        echo "WARN: Lead bulunamadÄ±\n";
    }

    writeLog("Toplam lead sayÄ±sÄ±: " . count($leads), "INFO");

    // 3. Uygun leadleri filtrele
    $candidates = [];
    $now = new DateTime('Europe/Istanbul');

    foreach ($leads as $leadDoc) {
        $fields = $leadDoc['fields'] ?? [];
        $docId = $leadDoc['name'] ?? '';
        $docId = str_replace('projects/' . $projectId . '/databases/(default)/documents/leads/', '', $docId);

        // AlanlarÄ± Ã§ek
        $email = $getStringValue($fields, 'email');
        $statusKey = $getStringValue($fields, 'statusKey', 'New');
        $stage = isset($fields['stage']['integerValue']) ? (int) $fields['stage']['integerValue'] : 0;
        $url = $getStringValue($fields, 'url');
        $language = $getStringValue($fields, 'language', 'TR');
        $autoFollowupEnabled = isset($fields['autoFollowupEnabled']['booleanValue']) && $fields['autoFollowupEnabled']['booleanValue'] === true;
        $nextFollowupDateStr = $getStringValue($fields, 'nextFollowupDate');

        // Email yoksa atla
        if (empty($email) || strlen($email) < 5)
            continue;

        // Otomatik takip aÃ§Ä±k deÄŸilse atla
        if (!$autoFollowupEnabled)
            continue;

        // Status kontrolÃ¼ - SADECE NO_REPLY olanlara mail at (veya frontend gibi hariÃ§ tutulanlar dÄ±ÅŸÄ±ndakilere)
        $statusKey = strtoupper(trim($statusKey));
        if ($statusKey !== 'NO_REPLY')
            continue;

        // Tarihi gelmemiÅŸse atla
        if (empty($nextFollowupDateStr))
            continue;

        $nextFollowupDate = new DateTime($nextFollowupDateStr);
        if ($nextFollowupDate > $now)
            continue;

        $candidates[] = [
            'id' => $docId,
            'email' => $email,
            'url' => $url,
            'stage' => $stage,
            'statusKey' => $statusKey,
            'language' => $language,
            'followupCount' => isset($fields['followupCount']['integerValue']) ? (int) $fields['followupCount']['integerValue'] : 0,
            'threadId' => $getStringValue($fields, 'threadId')
        ];
    }

    writeLog("Bulunan uygun lead sayÄ±sÄ±: " . count($candidates), "INFO");

    if (count($candidates) === 0) {
        writeLog("Takip gÃ¶nderilecek lead bulunamadÄ±", "INFO");
        echo "SUCCESS: Takip gÃ¶nderilecek lead bulunamadÄ±\n";
        exit;
    }

    // 5. Her candidate iÃ§in takip maili gÃ¶nder
    $sentCount = 0;
    $failedCount = 0;

    foreach ($candidates as $lead) {
        $workflow = $lead['language'] === 'EN' ? $workflowEN : $workflowTR;
        $currentStage = $lead['stage'];
        $nextStage = $currentStage + 1;

        if ($nextStage >= count($workflow)) {
            writeLog("TÃ¼m aÅŸamalar tamamlandÄ±: {$lead['id']}", "INFO");
            continue;
        }

        $template = $workflow[$nextStage];
        $domain = parse_url($lead['url'], PHP_URL_HOST);
        if (!$domain)
            $domain = $lead['url'];

        // Domain'i template'e ekle
        $subject = str_replace('{{Website}}', $domain, $template['subject']);
        $body = str_replace('{{Website}}', $domain, $template['body']);

        writeLog("Email gÃ¶nderiliyor: {$lead['email']} (AÅŸama: $nextStage)", "INFO");

        // Email gÃ¶nder
        $existingThreadId = !empty($lead['threadId']) ? $lead['threadId'] : null;
        $result = sendEmail($lead['email'], $subject, $body, $googleScriptUrl, $existingThreadId);

        if ($result['success']) {
            writeLog("Email gÃ¶nderildi: {$lead['email']} (Thread: {$result['threadId']})", "SUCCESS");

            $nextFollowupDate = new DateTime();
            $nextFollowupDate->modify('+7 days');

            // Firestore'da lead'i gÃ¼ncelle
            $updateData = [
                'stage' => $nextStage,
                'statusKey' => 'NO_REPLY',
                'lastContactDate' => date('c'),
                'nextFollowupDate' => $nextFollowupDate->format('c'),
                'followupCount' => $lead['followupCount'] + 1,
                'threadId' => $result['threadId']
            ];

            $updateSuccess = updateFirestoreLead($accessToken, $projectId, $lead['id'], $updateData);

            if ($updateSuccess) {
                writeLog("Firestore gÃ¼ncellendi: {$lead['id']}", "SUCCESS");
            } else {
                writeLog("Firestore gÃ¼ncelleme hatasÄ±: {$lead['id']}", "ERROR");
            }

            $sentCount++;
        } else {
            writeLog("Email gÃ¶nderilemedi: {$lead['email']} - {$result['message']}", "ERROR");
            $failedCount++;
        }

        // Her email arasÄ±nda bekleme (rate limiting)
        sleep(2);
    }

    writeLog("Takip iÅŸlemi tamamlandÄ±. GÃ¶nderilen: $sentCount, BaÅŸarÄ±sÄ±z: $failedCount", "INFO");
    echo "SUCCESS: Takip tamamlandÄ±. GÃ¶nderilen: $sentCount, BaÅŸarÄ±sÄ±z: $failedCount\n";

} catch (Exception $e) {
    writeLog("HATA: " . $e->getMessage(), "ERROR");
    echo "ERROR: " . $e->getMessage() . "\n";
}


