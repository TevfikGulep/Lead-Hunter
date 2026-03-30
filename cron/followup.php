<?php
/**
 * Lead Hunter - Otomatik Takip (Follow-up) Cron Script
 * 
 * Her gün saat 10:00'da çalışır (sadece hafta içi)
 * 7 gün önce gönderilen maillere cevap alınamadıysa sıradaki maili gönderir
 * 
 * cPanel Cron Job:
 * 0 10 * * 1-5 /usr/bin/php /home/[cpanel_kullanici]/public_html/cron/followup.php
 * 
 * Manuel tetikleme: https://leadhunter.tevfikgulep.com/cron/followup.php?manual=1
 */

// Service Account JSON dosyası yolu
define('SERVICE_ACCOUNT_FILE', __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json');

// Güvenlik anahtarı
define('SECRET_KEY', 'LEADHUNTER_FOLLOWUP_2026');

// Log dosyası
define('LOG_FILE', __DIR__ . '/../logs/followup.log');

// Log fonksiyonu
function writeLog($message, $type = 'INFO')
{
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] [$type] $message\n";
    @file_put_contents(LOG_FILE, $logMessage, FILE_APPEND);
    echo $logMessage;
}

// CORS
header('Content-Type: text/plain; charset=utf-8');

$isManual = isset($_GET['manual']);
$secret = $_GET['secret'] ?? '';

// Güvenlik kontrolü
if ($secret !== SECRET_KEY && !$isManual) {
    writeLog("Yetkisiz erişim denemesi", "ERROR");
    http_response_code(403);
    echo "ERROR: Yetkisiz erişim\n";
    exit;
}

// Zaman kontrolü - sadece hafta içi ve saat 10:00
if (!$isManual) {
    $now = new DateTime('Europe/Istanbul');
    $dayOfWeek = (int) $now->format('N'); // 1 = Pazartesi, 5 = Cuma
    $hour = (int) $now->format('H');

    // Hafta içi (1-5) ve saat 10:00
    if ($dayOfWeek < 1 || $dayOfWeek > 5) {
        writeLog("Hafta sonu çalışmaz (Bugün: $dayOfWeek)", "INFO");
        echo "SKIP: Hafta sonu çalışmaz\n";
        exit;
    }

    // Sadece 10:00'da çalışsın (9:55-10:05 arası tolerans)
    if ($hour < 9 || $hour > 10) {
        writeLog("Çalışma saati değil (Saat: $hour)", "INFO");
        echo "SKIP: Çalışma saati değil\n";
        exit;
    }

    writeLog("Otomatik takip başlıyor (Gün: $dayOfWeek, Saat: $hour)", "INFO");
} else {
    writeLog("Manuel takip başlatıldı", "INFO");
}

// Firebase access token alma
function getFirebaseAccessToken($serviceAccountFile)
{
    if (!file_exists($serviceAccountFile)) {
        return null;
    }

    $serviceAccount = json_decode(file_get_contents($serviceAccountFile), true);

    // JWT oluştur
    $header = base64_encode(json_encode(['typ' => 'JWT', 'alg' => 'RS256']));

    $now = time();
    $payload = base64_encode(json_encode([
        'iss' => $serviceAccount['client_email'],
        'sub' => $serviceAccount['client_email'],
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
        'scope' => 'https://www.googleapis.com/auth/firestore https://www.googleapis.com/auth/datastore'
    ]));

    // Private key ile imzala (basit mock - gerçek uygulamada Firebase SDK kullanılmalı)
    $privateKey = $serviceAccount['private_key'];

    // OpenSSL ile imzala
    $signature = '';
    openssl_sign($header . '.' . $payload, $signature, $privateKey, OPENSSL_ALGO_SHA256);
    $signature = base64_encode($signature);

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

    $response = curl_exec($ch);
    curl_close($ch);

    $result = json_decode($response, true);

    return $result['access_token'] ?? null;
}

// Firestore'dan lead verilerini çek
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

    writeLog("Firestore sorgu hatası: HTTP $httpCode", "ERROR");
    return [];
}

// Firestore'dan tüm leadleri çek (basit)
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

    writeLog("Firestore okuma hatası: HTTP $httpCode", "ERROR");
    return [];
}

// Firestore'a veri yazma (updateMask ile sadece belirtilen alanları günceller)
function updateFirestoreLead($accessToken, $projectId, $docId, $data)
{
    // updateMask parametreleri oluştur - sadece gönderilen alanları güncelle, diğerlerine dokunma
    $maskParams = array_map(function ($key) {
        return 'updateMask.fieldPaths=' . urlencode($key);
    }, array_keys($data));
    $maskQuery = implode('&', $maskParams);

    $url = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/leads/$docId?$maskQuery";

    // Firestore formatında veri hazırla
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

// Email gönderme fonksiyonu (Google Apps Script üzerinden)
function sendEmail($to, $subject, $body, $googleScriptUrl, $existingThreadId = null)
{
    $htmlBody = nl2br(htmlspecialchars($body));

    $postData = json_encode([
        'action' => 'send_mail',
        'to' => $to,
        'subject' => $subject,
        'body' => $body,
        'htmlBody' => $htmlBody,
        'threadId' => $existingThreadId
    ]);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $googleScriptUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: text/plain;charset=utf-8'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $result = json_decode($response, true);

    return [
        'success' => ($httpCode === 200 && isset($result['status']) && $result['status'] === 'success'),
        'threadId' => $result['threadId'] ?? null,
        'message' => $result['message'] ?? ''
    ];
}

// Ana işlemler
try {
    writeLog("Takip işlemi başladı", "INFO");

    // Service account dosyası kontrolü
    if (!file_exists(SERVICE_ACCOUNT_FILE)) {
        writeLog("Service account dosyası bulunamadı: " . SERVICE_ACCOUNT_FILE, "ERROR");
        echo "ERROR: Service account dosyası bulunamadı\n";
        exit;
    }

    $serviceAccount = json_decode(file_get_contents(SERVICE_ACCOUNT_FILE), true);
    $projectId = $serviceAccount['project_id'];

    writeLog("Proje ID: $projectId", "INFO");

    // Firebase access token al
    $accessToken = getFirebaseAccessToken(SERVICE_ACCOUNT_FILE);

    if (!$accessToken) {
        writeLog("Firebase access token alınamadı", "ERROR");
        echo "ERROR: Firebase erişim sağlanamadı\n";
        exit;
    }

    writeLog("Firebase bağlantısı başarılı", "INFO");

    // 1. Settings çek
    $settingsUrl = "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/system/config";

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $settingsUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $accessToken"]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $settingsResponse = curl_exec($ch);
    curl_close($ch);

    $settingsData = json_decode($settingsResponse, true);
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
        writeLog("Google Script URL bulunamadı", "ERROR");
        echo "ERROR: Google Script URL ayarlanmamış\n";
        exit;
    }

    writeLog("Google Script URL: " . substr($googleScriptUrl, 0, 50) . "...", "INFO");

    $workflowTR = $getArrayValue($settingsFields, 'workflowTR');
    $workflowEN = $getArrayValue($settingsFields, 'workflowEN');

    if (empty($workflowTR)) {
        $workflowTR = [
            ['label' => 'İlk Temas', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Merhabalar...'],
            ['label' => 'Takip 1', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Geçen haftaki e-postamla ilgili...'],
            ['label' => 'Takip 2', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Siteniz gibi yüksek trafiğe sahip...'],
            ['label' => 'Takip 3', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Umarım iyisinizdir...'],
            ['label' => 'Takip 4', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Vaktinizi almak istemem...'],
            ['label' => 'Takip 5', 'subject' => '{{Website}} Reklam Partnerlik Hk.', 'body' => 'Sizden bir geri dönüş alamayınca...']
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

    // 2. Leadleri çek
    $leads = getAllFirestoreLeads($accessToken, $projectId);

    if (empty($leads)) {
        writeLog("Lead verileri bulunamadı", "WARN");
        echo "WARN: Lead bulunamadı\n";
    }

    writeLog("Toplam lead sayısı: " . count($leads), "INFO");

    // 3. Uygun leadleri filtrele
    $candidates = [];
    $now = new DateTime('Europe/Istanbul');

    foreach ($leads as $leadDoc) {
        $fields = $leadDoc['fields'] ?? [];
        $docId = $leadDoc['name'] ?? '';
        $docId = str_replace('projects/' . $projectId . '/databases/(default)/documents/leads/', '', $docId);

        // Alanları çek
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

        // Otomatik takip açık değilse atla
        if (!$autoFollowupEnabled)
            continue;

        // Status kontrolü - SADECE NO_REPLY olanlara mail at (veya frontend gibi hariç tutulanlar dışındakilere)
        $statusKey = strtoupper(trim($statusKey));
        if ($statusKey !== 'NO_REPLY')
            continue;

        // Tarihi gelmemişse atla
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

    writeLog("Bulunan uygun lead sayısı: " . count($candidates), "INFO");

    if (count($candidates) === 0) {
        writeLog("Takip gönderilecek lead bulunamadı", "INFO");
        echo "SUCCESS: Takip gönderilecek lead bulunamadı\n";
        exit;
    }

    // 5. Her candidate için takip maili gönder
    $sentCount = 0;
    $failedCount = 0;

    foreach ($candidates as $lead) {
        $workflow = $lead['language'] === 'EN' ? $workflowEN : $workflowTR;
        $currentStage = $lead['stage'];
        $nextStage = $currentStage + 1;

        if ($nextStage >= count($workflow)) {
            writeLog("Tüm aşamalar tamamlandı: {$lead['id']}", "INFO");
            continue;
        }

        $template = $workflow[$nextStage];
        $domain = parse_url($lead['url'], PHP_URL_HOST);
        if (!$domain)
            $domain = $lead['url'];

        // Domain'i template'e ekle
        $subject = str_replace('{{Website}}', $domain, $template['subject']);
        $body = str_replace('{{Website}}', $domain, $template['body']);

        writeLog("Email gönderiliyor: {$lead['email']} (Aşama: $nextStage)", "INFO");

        // Email gönder
        $existingThreadId = !empty($lead['threadId']) ? $lead['threadId'] : null;
        $result = sendEmail($lead['email'], $subject, $body, $googleScriptUrl, $existingThreadId);

        if ($result['success']) {
            writeLog("Email gönderildi: {$lead['email']} (Thread: {$result['threadId']})", "SUCCESS");

            $nextFollowupDate = new DateTime();
            $nextFollowupDate->modify('+7 days');

            // Firestore'da lead'i güncelle
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
                writeLog("Firestore güncellendi: {$lead['id']}", "SUCCESS");
            } else {
                writeLog("Firestore güncelleme hatası: {$lead['id']}", "ERROR");
            }

            $sentCount++;
        } else {
            writeLog("Email gönderilemedi: {$lead['email']} - {$result['message']}", "ERROR");
            $failedCount++;
        }

        // Her email arasında bekleme (rate limiting)
        sleep(2);
    }

    writeLog("Takip işlemi tamamlandı. Gönderilen: $sentCount, Başarısız: $failedCount", "INFO");
    echo "SUCCESS: Takip tamamlandı. Gönderilen: $sentCount, Başarısız: $failedCount\n";

} catch (Exception $e) {
    writeLog("HATA: " . $e->getMessage(), "ERROR");
    echo "ERROR: " . $e->getMessage() . "\n";
}
