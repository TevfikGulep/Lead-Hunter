<?php
// traffic-api.php
// Versiyon: 3.3 (Hypestat XPath Desteği Eklendi)

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

// Uzun süreli işlemler için limit artırımı
set_time_limit(60);
ini_set('display_errors', 0); // Hataları ekrana basıp JSON'u bozmasın

if (!isset($_GET['domain'])) {
    echo json_encode(['success' => false, 'error' => 'Domain parametresi eksik.']);
    exit;
}

$type = isset($_GET['type']) ? $_GET['type'] : 'traffic';
$domain = cleanDomain($_GET['domain']);

if ($type === 'email') {
    // *** EMAIL BULMA MODU ***
    $emails = findEmails($domain);
    if (!empty($emails)) {
        echo json_encode(['success' => true, 'emails' => $emails]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Email bulunamadı.']);
    }
    exit;
} else {
    // *** TRAFİK BULMA MODU ***
    $trafficData = getTraffic($domain);
    echo json_encode($trafficData);
    exit;
}

// ---------------------------------------------------
// --- FONKSİYONLAR ---
// ---------------------------------------------------

function cleanDomain($url) {
    $url = trim($url);
    $url = preg_replace('#^https?://#', '', $url);
    $url = preg_replace('#^www\.#', '', $url);
    return explode('/', $url)[0];
}

function fetchUrl($url, $useProxy = false) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    
    // Çok Daha Gerçekçi Tarayıcı Başlıkları
    $headers = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9,tr;q=0.8',
        'Upgrade-Insecure-Requests: 1',
        'Cache-Control: max-age=0',
        'Referer: https://www.google.com/',
        'Sec-Fetch-Dest: document',
        'Sec-Fetch-Mode: navigate',
        'Sec-Fetch-Site: cross-site',
        'Sec-Fetch-User: ?1'
    ];
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    // Cookie yönetimi
    $cookieFile = sys_get_temp_dir() . '/cookie.txt';
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);

    $content = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    // Hata kontrolü
    if ($content === false || $httpCode >= 400) {
        curl_close($ch);
        return false;
    }
    
    curl_close($ch);
    return $content;
}

function getTraffic($domain) {
    // -----------------------------------------------------------
    // 1. ADIM: SimilarSites (Birincil Kaynak)
    // -----------------------------------------------------------
    $targetUrl = "https://www.similarsites.com/site/" . urlencode($domain);
    $html = fetchUrl($targetUrl);

    if ($html) {
        $dom = new DOMDocument();
        libxml_use_internal_errors(true);
        @$dom->loadHTML($html);
        libxml_clear_errors();
        $xpath = new DOMXPath($dom);
        
        $queries = [
            "//*[@data-testid='siteheader_monthlyvisits']",
            "//p[contains(@class, 'total-visits-value')]",
            "//div[contains(@class, 'visits-container__value')]",
            "//dt[contains(., 'Total Visits')]/following-sibling::dd[1]"
        ];

        foreach ($queries as $query) {
            $nodes = $xpath->query($query);
            if ($nodes && $nodes->length > 0) {
                $val = trim($nodes->item(0)->nodeValue);
                if (!empty($val) && $val !== '-') {
                    return ['success' => true, 'source' => 'similarsites', 'value' => parseTrafficString($val), 'raw' => strtoupper($val)];
                }
            }
        }
        
        // Regex Fallback
        if (preg_match('/"(MonthlyVisits|monthly_visits|TotalVisits)"\s*:\s*(\d+)/i', $html, $matches)) {
             $rawNum = (int)$matches[2];
             return ['success' => true, 'source' => 'similarsites-regex', 'value' => $rawNum, 'raw' => formatNumber($rawNum)];
        }
    }

    // -----------------------------------------------------------
    // 2. ADIM: Hypestat (Yedek Kaynak - Güçlendirilmiş)
    // -----------------------------------------------------------
    
    $hypeUrl = "https://hypestat.com/info/" . urlencode($domain);
    $htmlHype = fetchUrl($hypeUrl);

    if ($htmlHype) {
        // YÖNTEM A: XPath ile Doğrudan Erişim (Sizin Belirttiğiniz Yol)
        // Yol: //*[@id="info"]/div[4]/div[3]/strong[2]
        
        $dom = new DOMDocument();
        libxml_use_internal_errors(true); // HTML hatalarını bastır
        @$dom->loadHTML($htmlHype);
        libxml_clear_errors();
        $xpath = new DOMXPath($dom);
        
        $nodes = $xpath->query('//*[@id="info"]/div[4]/div[3]/strong[2]');
        
        if ($nodes && $nodes->length > 0) {
            $rawVal = trim($nodes->item(0)->nodeValue);
            // Sadece sayıları al (virgülleri temizle)
            $cleanVal = preg_replace('/[^0-9]/', '', $rawVal);
            $daily = (int)$cleanVal;
            
            if ($daily > 0) {
                $monthly = $daily * 30;
                return [
                    'success' => true, 
                    'source' => 'hypestat-xpath', 
                    'value' => $monthly, 
                    'raw' => formatNumber($monthly)
                ];
            }
        }

        // YÖNTEM B: Regex ile "Page Impressions"
        if (preg_match('/([\d,]+)\s+page\s+impressions/i', $htmlHype, $matches)) {
            $dailyImpressions = (int)str_replace(',', '', $matches[1]);
            $monthlyEstimated = $dailyImpressions * 30;
            return [
                'success' => true, 
                'source' => 'hypestat-impressions', 
                'value' => $monthlyEstimated, 
                'raw' => formatNumber($monthlyEstimated)
            ];
        }

        // YÖNTEM C: Regex ile "Daily Unique Visitors"
        if (preg_match('/Daily Unique Visitors\s*[:\n]+\s*([\d,]+)/i', $htmlHype, $matches)) {
            $daily = (int)str_replace(',', '', $matches[1]);
            $monthly = $daily * 30;
            return [
                'success' => true, 
                'source' => 'hypestat-visitors', 
                'value' => $monthly, 
                'raw' => formatNumber($monthly)
            ];
        }

        // YÖNTEM D: Geniş Kapsamlı Sayı Arama
        if (preg_match('/([\d,]+)\s+visitors\s+per\s+day/i', $htmlHype, $matches)) {
             $daily = (int)str_replace(',', '', $matches[1]);
             $monthly = $daily * 30;
             return ['success' => true, 'source' => 'hypestat-general', 'value' => $monthly, 'raw' => formatNumber($monthly)];
        }
    }

    return ['success' => false, 'error' => 'Veri bulunamadı.'];
}

// --- Yardımcı Fonksiyonlar --- (Aynen korundu)

function findEmails($domain) {
    $protocol = 'https://';
    $baseUrl = $protocol . $domain;
    $foundEmails = [];
    $homeHtml = fetchUrl($baseUrl);
    if (!$homeHtml) {
        $baseUrl = 'http://' . $domain;
        $homeHtml = fetchUrl($baseUrl);
    }
    if ($homeHtml) {
        $foundEmails = array_merge($foundEmails, extractEmailsFromHtml($homeHtml, $domain));
        $contactLinks = findContactLinks($homeHtml, $baseUrl);
        $pagesToCrawl = array_slice($contactLinks, 0, 3);
        foreach ($pagesToCrawl as $pageUrl) {
            $pageHtml = fetchUrl($pageUrl);
            if ($pageHtml) $foundEmails = array_merge($foundEmails, extractEmailsFromHtml($pageHtml, $domain));
            usleep(100000);
        }
    }
    if (empty($foundEmails)) {
        $fallbackPaths = ['/iletisim', '/contact', '/contact-us'];
        foreach($fallbackPaths as $path) {
            $fallbackHtml = fetchUrl(rtrim($baseUrl, '/') . $path);
            if ($fallbackHtml) $foundEmails = array_merge($foundEmails, extractEmailsFromHtml($fallbackHtml, $domain));
        }
    }
    $foundEmails = array_unique($foundEmails);
    usort($foundEmails, function($a, $b) use ($domain) {
        return getEmailScore($b, $domain) - getEmailScore($a, $domain);
    });
    return array_slice($foundEmails, 0, 5);
}

function extractEmailsFromHtml($html, $domain) {
    $emails = [];
    preg_match_all('/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/', $html, $matches);
    if (!empty($matches[0])) {
        foreach ($matches[0] as $email) {
            $clean = strtolower(trim($email));
            if (preg_match('/\.pbz$|\.arg$|\.bet$/', $clean)) $clean = str_rot13($clean);
            if (isValidEmail($clean, $domain)) $emails[] = $clean;
        }
    }
    if (preg_match_all('/data-cfemail="([a-f0-9]+)"/i', $html, $cfMatches)) {
        foreach ($cfMatches[1] as $hex) {
            $decodedEmail = decodeCloudflareEmail($hex);
            if (isValidEmail($decodedEmail, $domain)) $emails[] = $decodedEmail;
        }
    }
    return $emails;
}

function decodeCloudflareEmail($hex) {
    $email = "";
    $k = hexdec(substr($hex, 0, 2));
    for ($i = 2; $i < strlen($hex); $i += 2) {
        $email .= chr(hexdec(substr($hex, $i, 2)) ^ $k);
    }
    return strtolower($email);
}

function findContactLinks($html, $baseUrl) {
    $dom = new DOMDocument();
    @$dom->loadHTML($html);
    $links = $dom->getElementsByTagName('a');
    $candidates = [];
    $keywords = ['contact', 'iletisim', 'iletişim', 'about', 'hakkimizda', 'hakkımızda', 'bize-ulasin', 'ulasim', 'imprint', 'kunye', 'künye'];
    foreach ($links as $link) {
        $href = $link->getAttribute('href');
        $text = strtolower($link->nodeValue);
        foreach ($keywords as $kw) {
            if (strpos($href, $kw) !== false || strpos($text, $kw) !== false) {
                if (strpos($href, 'http') === false) $href = rtrim($baseUrl, '/') . '/' . ltrim($href, '/');
                if (strpos($href, cleanDomain($baseUrl)) !== false) $candidates[] = $href;
                break; 
            }
        }
    }
    return array_unique($candidates);
}

function getEmailScore($email, $domain) {
    $score = 0;
    $userPart = explode('@', $email)[0];
    $domainPart = explode('@', $email)[1];
    $cleanDomain = str_replace('www.', '', $domain);
    if (strpos($domainPart, $cleanDomain) !== false) $score += 10;
    $priorityWords = ['info', 'contact', 'sales', 'support', 'iletisim', 'bilgi', 'merhaba', 'reklam', 'hello', 'editor', 'haber', 'yonetim'];
    if (in_array($userPart, $priorityWords)) $score += 5;
    return $score;
}

function isValidEmail($email, $domain) {
    $junkTerms = ['w3.org', 'sentry.io', 'example.com', 'yourdomain.com', 'email@', 'name@', 'user@', 'domain.com', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.js', '.css', '.woff', '.ttf', '2x.png', '@2x', 'bootstrap', 'jquery', 'cloudflare', 'react', 'google', 'wordpress', 'noreply', 'no-reply', 'donotreply', 'server@', 'cpanel@', 'plesk@', 'nginx@'];
    foreach ($junkTerms as $term) { if (strpos($email, $term) !== false) return false; }
    $parts = explode('.', $email);
    $tld = end($parts);
    if (is_numeric($tld)) return false;
    $userPart = explode('@', $email)[0];
    if (strlen($userPart) > 35 || strlen($userPart) < 2) return false;
    return true;
}

function parseTrafficString($str) {
    $str = strtolower($str);
    $clean = preg_replace('/[^0-9.kmb]/', '', $str);
    $multiplier = 1;
    if (strpos($clean, 'm') !== false) { $multiplier = 1000000; $clean = str_replace('m', '', $clean); }
    elseif (strpos($clean, 'k') !== false) { $multiplier = 1000; $clean = str_replace('k', '', $clean); }
    elseif (strpos($clean, 'b') !== false) { $multiplier = 1000000000; $clean = str_replace('b', '', $clean); }
    return (float)$clean * $multiplier;
}

function formatNumber($num) {
    if ($num > 1000000) return number_format($num / 1000000, 1) . 'M';
    if ($num > 1000) return number_format($num / 1000, 1) . 'K';
    return (string)$num;
}
?>
