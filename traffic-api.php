<?php
// traffic-api.php
// Versiyon: 4.0 (Mail Tracking Eklendi)

ob_start();

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

set_time_limit(60);
ini_set('display_errors', 0);
error_reporting(E_ALL);

$debugLog = [];
$trackingFile = 'tracking_data.json'; // Okunma verilerinin tutulacağı dosya

function addLog($msg)
{
    global $debugLog;
    if (is_array($msg) || is_object($msg))
        $msg = print_r($msg, true);
    $debugLog[] = date('H:i:s') . " - " . $msg;
}

try {
    $type = isset($_GET['type']) ? $_GET['type'] : '';

    // --- MAIL TRACKING (GÖRÜNMEZ PİKSEL) ---
    if ($type === 'track') {
        // JSON çıktısını temizle, resim göndereceğiz
        ob_clean();

        $leadId = isset($_GET['id']) ? preg_replace('/[^a-zA-Z0-9]/', '', $_GET['id']) : null;

        if ($leadId) {
            // Veriyi kaydet
            $currentData = [];
            if (file_exists($trackingFile)) {
                $content = file_get_contents($trackingFile);
                $currentData = json_decode($content, true) ?: [];
            }

            // Eğer daha önce açılmadıysa veya son açılma tarihini güncellemek istersen
            $currentData[$leadId] = date('c'); // ISO 8601 formatında tarih

            file_put_contents($trackingFile, json_encode($currentData));
        }

        // 1x1 Şeffaf GIF Headerları
        header('Content-Type: image/gif');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');

        // 1x1 Transparent GIF Binary
        echo base64_decode('R0lGODlhAQABAJAAAP8AAAAAACH5BAUQAAAALAAAAAABAAEAAAICBAEAOw==');
        exit;
    }

    // --- OKUNMA VERİLERİNİ ÇEKME (SYNC) ---
    if ($type === 'sync_opens') {
        if (file_exists($trackingFile)) {
            $data = json_decode(file_get_contents($trackingFile), true);
            echo json_encode(['success' => true, 'data' => $data]);
        } else {
            echo json_encode(['success' => true, 'data' => []]);
        }
        exit;
    }

    // --- SEARCH FUNCTIONALITY ---
    if ($type === 'search') {
        $query = isset($_GET['q']) ? $_GET['q'] : '';
        $gl = isset($_GET['gl']) ? $_GET['gl'] : 'TR';
        $depth = isset($_GET['depth']) ? (int) $_GET['depth'] : 10;

        if (empty($query))
            throw new Exception("Arama sorgusu boş olamaz.");

        // FORCE GOOGLE BASIC VERSION (gbv=1)
        // This is much easier to scrape and less prone to blocking/consent screens
        $searchUrl = "https://www.google.com/search?q=" . urlencode($query) . "&gl=" . urlencode($gl) . "&num=" . $depth . "&gbv=1&sei=0";
        addLog("Searching (Basic Mode): $searchUrl");

        $html = fetchUrl($searchUrl);
        if (!$html)
            throw new Exception("Google verisi alınamadı (Boş Yanıt).");
        addLog("HTML Length: " . strlen($html));

        $dom = new DOMDocument();
        @$dom->loadHTML($html);
        $xpath = new DOMXPath($dom);

        $results = [];

        // Strategy for GBV=1 (Class 'BNeawe' is common for titles in basic mobile/legacy view)
        // But simply searching for all 'a' tags with /url?q= is the most robust method for this version.

        $anchors = $xpath->query("//a[contains(@href, '/url?q=')]");
        addLog("Found anchors with /url?q=: " . $anchors->length);

        foreach ($anchors as $anchor) {
            $href = $anchor->getAttribute('href');

            // Extract real URL
            // Href looks like: /url?q=https://example.com/&sa=U&ved=...
            $parts = parse_url($href);
            parse_str($parts['query'], $queryParts);
            $cleanUrl = isset($queryParts['q']) ? $queryParts['q'] : '';

            if (empty($cleanUrl) || strpos($cleanUrl, 'google.com') !== false)
                continue;

            // Find Title
            // Inside the anchor, there is usually a div or h3 with the text.
            // Or just the text string inside the anchor.
            $title = trim($anchor->nodeValue);

            // Sometimes the title is inside a child div with class 'vvjwJb' or 'BNeawe'
            // Let's try to be specific if generic text is empty
            if (empty($title)) {
                $childDiv = $xpath->query(".//div[contains(@class, 'vvjwJb')]", $anchor)->item(0);
                if ($childDiv)
                    $title = trim($childDiv->nodeValue);
            }

            if (empty($title))
                continue;

            // Find Snippet
            // In GBV=1, the snippet is often in a div appearing *after* the anchor's container.
            // This is tricky to get with simple relation, so we will leave snippet empty for now 
            // OR try to grab the parent's next sibling.
            $snippet = "";

            // Basic deduplication
            $isDuplicate = false;
            foreach ($results as $r) {
                if ($r['url'] === $cleanUrl)
                    $isDuplicate = true;
            }
            if ($isDuplicate)
                continue;

            $results[] = [
                'url' => $cleanUrl,
                'title' => $title,
                'snippet' => $snippet
            ];

            if (count($results) >= $depth)
                break;
        }

        // Just in case GBV fails and we get standard structure, keeping the Fallback regex is decent
        if (empty($results)) {
            addLog("GBV DOM parsing yielded 0 results. Checking fallback regex...");
            if (preg_match_all('/<a\s[^>]*href="\/url\?q=([^"&]+)[^"]*"[^>]*>(.*?)<\/a>/si', $html, $matches, PREG_SET_ORDER)) {
                addLog("Regex found " . count($matches) . " raw matches.");
                foreach ($matches as $m) {
                    $u = urldecode($m[1]);
                    if (strpos($u, 'google') !== false)
                        continue;
                    $t = strip_tags($m[2]);
                    $results[] = ['url' => $u, 'title' => html_entity_decode($t), 'snippet' => ''];
                    if (count($results) >= $depth)
                        break;
                }
            }
        }

        $response = ['success' => true, 'results' => $results, 'count' => count($results)];
        // Fallthrough will add debug log
    }

    if ($type !== 'search') {
        if (!isset($_GET['domain'])) {
            throw new Exception('Domain parametresi eksik.');
        }

        $domain = cleanDomain($_GET['domain']);
        $response = [];

        if ($type === 'email') {
            $emails = findEmails($domain);
            $response = !empty($emails) ? ['success' => true, 'emails' => $emails] : ['success' => false, 'error' => 'Email bulunamadı.'];
        } else {
            $response = getTraffic($domain);
        }
    }

    $response['debug'] = $debugLog;

} catch (Exception $e) {
    $response = [
        'success' => false,
        'error' => $e->getMessage(),
        'debug' => $debugLog
    ];
}

$buffer = ob_get_clean();
echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// --- YARDIMCI FONKSİYONLAR (AYNEN KORUNDU) ---
function cleanDomain($url)
{
    $url = trim($url);
    $url = preg_replace('#^https?://#', '', $url);
    $url = preg_replace('#^www\.#', '', $url);
    return explode('/', $url)[0];
}

function fetchUrl($url, $useProxy = false)
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);
    curl_setopt($ch, CURLOPT_ENCODING, '');
    $headers = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Upgrade-Insecure-Requests: 1'
    ];
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $cookieFile = sys_get_temp_dir() . '/cookie.txt';
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);
    $content = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($content === false || $httpCode >= 400) ? false : $content;
}

function getTraffic($domain)
{
    $targetUrl = "https://www.similarsites.com/site/" . urlencode($domain);
    $html = fetchUrl($targetUrl);
    if ($html) {
        if (preg_match('/"(MonthlyVisits|monthly_visits|TotalVisits)"\s*:\s*(\d+)/i', $html, $matches)) {
            $rawNum = (int) $matches[2];
            return ['success' => true, 'source' => 'similarsites-regex', 'value' => $rawNum, 'raw' => formatNumber($rawNum)];
        }
        $dom = new DOMDocument();
        libxml_use_internal_errors(true);
        @$dom->loadHTML($html);
        $xpath = new DOMXPath($dom);
        $nodes = $xpath->query("//*[@data-testid='siteheader_monthlyvisits']");
        if ($nodes->length > 0) {
            $val = trim($nodes->item(0)->nodeValue);
            return ['success' => true, 'source' => 'similarsites', 'value' => parseTrafficString($val), 'raw' => strtoupper($val)];
        }
    }

    $hypeUrl = "https://hypestat.com/info/" . urlencode($domain);
    $htmlHype = fetchUrl($hypeUrl);
    if ($htmlHype) {
        if (preg_match('/([\d,]+)\s+visitors\s+per\s+day/i', $htmlHype, $matches)) {
            $monthly = (int) str_replace(',', '', $matches[1]) * 30;
            return ['success' => true, 'source' => 'hypestat', 'value' => $monthly, 'raw' => formatNumber($monthly)];
        }
    }
    return ['success' => false, 'error' => 'Veri bulunamadı.'];
}

function findEmails($domain)
{
    $protocol = 'https://';
    $baseUrl = $protocol . $domain;
    $homeHtml = fetchUrl($baseUrl) ?: fetchUrl('http://' . $domain);
    $foundEmails = [];
    if ($homeHtml) {
        $foundEmails = array_merge($foundEmails, extractEmailsFromHtml($homeHtml, $domain));
        $contactLinks = findContactLinks($homeHtml, $baseUrl);
        foreach (array_slice($contactLinks, 0, 3) as $pageUrl) {
            if ($html = fetchUrl($pageUrl))
                $foundEmails = array_merge($foundEmails, extractEmailsFromHtml($html, $domain));
        }
    }
    $foundEmails = array_unique($foundEmails);
    return array_slice($foundEmails, 0, 5);
}

function extractEmailsFromHtml($html, $domain)
{
    $emails = [];
    preg_match_all('/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/', $html, $matches);
    if (!empty($matches[0])) {
        foreach ($matches[0] as $email) {
            if (isValidEmail($email, $domain))
                $emails[] = strtolower($email);
        }
    }
    return $emails;
}

function findContactLinks($html, $baseUrl)
{
    $dom = new DOMDocument();
    @$dom->loadHTML($html);
    $links = $dom->getElementsByTagName('a');
    $candidates = [];
    $keywords = ['contact', 'iletisim', 'about', 'hakkimizda'];
    foreach ($links as $link) {
        $href = $link->getAttribute('href');
        foreach ($keywords as $kw) {
            if (strpos($href, $kw) !== false) {
                if (strpos($href, 'http') === false)
                    $href = rtrim($baseUrl, '/') . '/' . ltrim($href, '/');
                $candidates[] = $href;
            }
        }
    }
    return array_unique($candidates);
}

function isValidEmail($email, $domain)
{
    $junkTerms = ['example.com', '.png', '.jpg', '.js', '.css', 'sentry.io', 'noreply'];
    foreach ($junkTerms as $term)
        if (strpos($email, $term) !== false)
            return false;
    return true;
}

function parseTrafficString($str)
{
    $str = strtolower($str);
    $clean = preg_replace('/[^0-9.kmb]/', '', $str);
    $m = 1;
    if (strpos($clean, 'm'))
        $m = 1000000;
    elseif (strpos($clean, 'k'))
        $m = 1000;
    return (float) $clean * $m;
}

function formatNumber($num)
{
    if ($num > 1000000)
        return number_format($num / 1000000, 1) . 'M';
    if ($num > 1000)
        return number_format($num / 1000, 1) . 'K';
    return (string) $num;
}
?>