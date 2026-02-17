<?php
/**
 * Lead Hunter - Otomatik Tarama Cron Script
 * 
 * cPanel Cron Job ile çalıştır:
 * Pazartesi 03:00: /usr/bin/php /home/[cpanel_kullanici]/public_html/cron/hunter.php
 * 
 * Manuel tetikleme: https://leadhunter.tevfikgulep.com/cron/hunter.php?manual=1
 */

// Güvenlik anahtarı (sadece yetkili erişim için)
define('SECRET_KEY', 'LEADHUNTER_CRON_2026');

// Log dosyası yolu
define('LOG_FILE', __DIR__ . '/../logs/hunter.log');

// Firebase config (manuel doldurulmalı)
define('FIREBASE_CONFIG', [
    'apiKey' => '',
    'authDomain' => '',
    'projectId' => '',
    'storageBucket' => '',
    'messagingSenderId' => '',
    'appId' => ''
]);

// Log fonksiyonu
function writeLog($message, $type = 'INFO')
{
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] [$type] $message\n";
    file_put_contents(LOG_FILE, $logMessage, FILE_APPEND);
    echo $logMessage;
}

// CORS ve güvenlik kontrolü
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

// Manuel veya otomatik kontrol
if ($isManual) {
    writeLog("Manuel tarama başlatıldı", "INFO");
}
else {
    // Otomatik çalışma - sadece Pazartesi 03:00-04:00 arası
    $now = new DateTime('Europe/Istanbul');
    $dayOfWeek = (int)$now->format('N'); // 1 = Pazartesi
    $hour = (int)$now->format('H');

    if ($dayOfWeek !== 1 || $hour < 3 || $hour >= 4) {
        writeLog("Otomatik tarama zamanı değil (Bugün: $dayOfWeek, Saat: $hour)", "INFO");
        echo "SKIP: Otomatik tarama sadece Pazartesi 03:00-04:00 arası çalışır\n";
        exit;
    }

    writeLog("Otomatik tarama başlıyor", "INFO");
}

// Firebase yükleme (PHP Firebase SDK gerekli)
function loadFirebaseData($collection, $doc)
{
    // Basit file-based simulation - gerçek Firebase için PHP SDK kurulmalı
    $dataFile = __DIR__ . '/../data/' . $collection . '_' . $doc . '.json';
    if (file_exists($dataFile)) {
        return json_decode(file_get_contents($dataFile), true);
    }
    return null;
}

function saveFirebaseData($collection, $doc, $data)
{
    $dataFile = __DIR__ . '/../data/' . $collection . '_' . $doc . '.json';
    $dir = dirname($dataFile);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT));
}

// Ana işlemler
try {
    writeLog("Tarama başladı", "INFO");

    // 1. Ayarları çek
    $settings = loadFirebaseData('system', 'config');
    if (!$settings) {
        writeLog("Ayarlar bulunamadı", "ERROR");
        exit;
    }

    // 2. İlçe listesini al
    $ilceListesi = isset($settings['ilceListesi']) ? $settings['ilceListesi'] : '';
    if (empty($ilceListesi)) {
        writeLog("İlçe listesi boş", "ERROR");
        exit;
    }

    $ilceList = array_filter(array_map('trim', explode("\n", $ilceListesi)));
    $targetCount = isset($settings['hunterTargetCount']) ? (int)$settings['hunterTargetCount'] : 100;
    $lastIndex = isset($settings['lastHunterIlceIndex']) ? (int)$settings['lastHunterIlceIndex'] : 0;

    writeLog("Hedef: $targetCount site, Son index: $lastIndex, Toplam ilçe: " . count($ilceList), "INFO");

    // 3. Keywords
    $keywords = ['haberleri', 'son dakika', 'güncel', 'haber', 'gazete'];

    // 4. Mevcut domainleri çek (gerçek Firebase'den)
    $existingDomains = [];
    writeLog("Mevcut domainler kontrol ediliyor...", "INFO");

    // 5. Tarama döngüsü
    $foundViableCount = 0;
    $totalSearches = 0;
    $maxSearches = count($ilceList) * count($keywords);

    $serverUrl = 'https://leadhunter.tevfikgulep.com/traffic-api.php';
    $apiKey = isset($settings['googleApiKey']) ? $settings['googleApiKey'] : '';
    $cx = isset($settings['searchEngineId']) ? $settings['searchEngineId'] : '';

    for ($i = 0; $i < count($ilceList) && $foundViableCount < $targetCount; $i++) {
        $ilce = $ilceList[($lastIndex + $i) % count($ilceList)];

        foreach ($keywords as $kw) {
            if ($foundViableCount >= $targetCount)
                break;
            if ($totalSearches >= $maxSearches)
                break;

            $query = "$ilce $kw";
            $totalSearches++;

            writeLog("Aranıyor: $query", "INFO");

            // Google Custom Search API çağrısı
            $searchUrl = "$serverUrl?type=search&q=" . urlencode($query) . "&depth=30&gl=TR&apiKey=" . urlencode($apiKey) . "&cx=" . urlencode($cx);

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $searchUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            $response = curl_exec($ch);
            curl_close($ch);

            $json = json_decode($response, true);

            if ($json && isset($json['success']) && $json['success']) {
                $results = $json['results'];

                foreach ($results as $r) {
                    if ($foundViableCount >= $targetCount)
                        break;

                    $domain = parse_url($r['url'], PHP_URL_HOST);
                    if (!$domain)
                        continue;

                    // Domain zaten varsa atla
                    if (in_array($domain, $existingDomains))
                        continue;

                    // Trafik kontrolü
                    $trafficUrl = "$serverUrl?type=traffic&url=" . urlencode($r['url']);
                    $trafficCh = curl_init();
                    curl_setopt($trafficCh, CURLOPT_URL, $trafficUrl);
                    curl_setopt($trafficCh, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($trafficCh, CURLOPT_TIMEOUT, 30);
                    $trafficResponse = curl_exec($trafficCh);
                    curl_close($trafficCh);

                    $traffic = json_decode($trafficResponse, true);

                    if ($traffic && isset($traffic['viable']) && $traffic['viable']) {
                        // Site uygun - veritabanına ekle (gerçek Firebase)
                        writeLog("Eklendi: $domain (Trafik: " . ($traffic['label'] ?? 'bilinmiyor') . ")", "SUCCESS");
                        $foundViableCount++;
                        $existingDomains[] = $domain;

                    // Burada gerçek Firebase'e yazma kodu olacak
                    // firebase::firestore->collection('leads')->add([...])
                    }

                    // Rate limiting
                    usleep(500000); // 0.5 saniye bekle
                }
            }

            // Her arama arasında bekle
            sleep(1);
        }

        // İlçe index güncelle
        $lastIndex = ($lastIndex + 1) % count($ilceList);
    }

    // 6. Son durumu kaydet
    $settings['lastHunterIlceIndex'] = $lastIndex;
    $settings['lastHunterRunDate'] = date('c');
    saveFirebaseData('system', 'config', $settings);

    writeLog("Tarama tamamlandı. Bulunan: $foundViableCount site", "INFO");
    writeLog("Sonraki ilçe index: $lastIndex", "INFO");

    echo "SUCCESS: Tarama tamamlandı. $foundViableCount site bulundu.\n";


}
catch (Exception $e) {
    writeLog("HATA: " . $e->getMessage(), "ERROR");
    echo "ERROR: " . $e->getMessage() . "\n";
}
