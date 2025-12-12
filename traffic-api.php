<?php
// traffic-api.php
// Versiyon: 7.0 (Bulldozer Mode: Persistent Pagination + UA Rotation)
// Hedef: Google num parametresini yoksayarsa, zorla sayfalama yaparak hedefe ulaşır.

ob_start();

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

$debugLog = [];
$trackingFile = 'tracking_data.json';

function addLog($msg)
{
    global $debugLog;
    if (is_array($msg) || is_object($msg))
        $msg = print_r($msg, true);
    $debugLog[] = date('H:i:s') . " - " . $msg;
}

try {
    $type = isset($_GET['type']) ? $_GET['type'] : '';

    // --- MAIL TRACKING ---
    if ($type === 'track') {
        ob_clean();
        $leadId = isset($_GET['id']) ? preg_replace('/[^a-zA-Z0-9]/', '', $_GET['id']) : null;
        if ($leadId) {
            $currentData = [];
            if (file_exists($trackingFile)) {
                $content = file_get_contents($trackingFile);
                $currentData = json_decode($content, true) ?: [];
            }
            $currentData[$leadId] = date('c');
            file_put_contents($trackingFile, json_encode($currentData));
        }
        header('Content-Type: image/gif');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        echo base64_decode('R0lGODlhAQABAJAAAP8AAAAAACH5BAUQAAAALAAAAAABAAEAAAICBAEAOw==');
        exit;
    }

    // --- SYNC OPENS ---
    if ($type === 'sync_opens') {
        if (file_exists($trackingFile)) {
            $data = json_decode(file_get_contents($trackingFile), true);
            echo json_encode(['success' => true, 'data' => $data]);
        } else {
            echo json_encode(['success' => true, 'data' => []]);
        }
        exit;
    }

    // --- DEBUG HTML FUNCTIONALITY ---
    if ($type === 'debug_html') {
        if (!isset($_GET['url']))
            throw new Exception("URL eksik.");
        $url = $_GET['url'];

        $debugLog[] = "Debug URL: $url";

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_ENCODING, ""); // Handle gzip

        // Browser Headers
        $headers = [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control: no-cache',
            'Connection: keep-alive'
        ];
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_HEADER, true); // Headerları da al

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        $header = substr($response, 0, $headerSize);
        $body = substr($response, $headerSize);

        // Find snippets around '@'
        $atSnippets = [];
        $offset = 0;
        while (($pos = strpos($body, '@', $offset)) !== false) {
            $start = max(0, $pos - 20);
            $length = 50; // 20 chars before, @, 29 chars after
            $snippet = substr($body, $start, $length);
            $atSnippets[] = htmlspecialchars($snippet); // Escape for safe JSON viewing
            $offset = $pos + 1;
            if (count($atSnippets) >= 10)
                break; // Limit to 10 snippets
        }

        // Test Extraction
        $extractedRaw = [];
        preg_match_all('/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/', $body, $extractedRaw);

        $response = [
            'success' => true,
            'http_code' => $httpCode,
            'headers_length' => strlen($header),
            'body_length' => strlen($body),
            'preview_body' => substr(strip_tags($body), 0, 500),
            'at_snippets' => $atSnippets, // <--- CRITICAL: Show what's around the @
            'extracted_by_regex' => $extractedRaw[0] ?? [],
            'contains_at_symbol' => strpos($body, '@') !== false,
            'contains_gmail' => stripos($body, 'gmail') !== false,
            'contains_yenimarmara' => stripos($body, 'yenimarmara16') !== false
        ];
        echo json_encode($response);
        exit;
    }

    // --- SEARCH FUNCTIONALITY ---
    if ($type === 'search') {
        $query = isset($_GET['q']) ? $_GET['q'] : '';
        $gl = isset($_GET['gl']) ? $_GET['gl'] : 'TR';
        $targetDepth = isset($_GET['depth']) ? (int) $_GET['depth'] : 10;

        $apiKey = isset($_GET['apiKey']) ? $_GET['apiKey'] : '';
        $cx = isset($_GET['cx']) ? $_GET['cx'] : '';

        if ($targetDepth > 100)
            $targetDepth = 100; // Max limit

        if (empty($query))
            throw new Exception("Arama sorgusu boş olamaz.");

        $allResults = [];
        addLog("Hedef: $targetDepth sonuç.");

        // ---------------------------------------------------------
        // MOD 1: GOOGLE OFFICIAL API (Eğer Key & CX varsa)
        // ---------------------------------------------------------
        if (!empty($apiKey) && !empty($cx)) {
            addLog("API Modu Aktif (Google Custom Search).");

            // Loop until we reach targetDepth or API limits
            while (count($allResults) < $targetDepth) {
                // start parameter is 1-based (1, 11, 21...)
                $start = count($allResults) + 1;

                // Google Custom Search API typically limits 'start' to around 100 results per query
                if ($start > 91) {
                    addLog("API sayfalama limiti (Max 100 sonuç).");
                    break;
                }

                addLog("API İsteği: Start=$start");

                $apiUrl = "https://www.googleapis.com/customsearch/v1?key=" . urlencode($apiKey) . "&cx=" . urlencode($cx) . "&q=" . urlencode($query) . "&gl=" . urlencode($gl) . "&start=" . $start;

                // Use fetchUrl with 'api' mode which doesn't need complex headers
                $jsonResponse = fetchUrl($apiUrl, 'other');

                if (!$jsonResponse) {
                    addLog("API yanıt vermedi.");
                    break;
                }

                $data = json_decode($jsonResponse, true);

                if (isset($data['error'])) {
                    addLog("API Hatası: " . json_encode($data['error']));
                    break;
                }

                if (empty($data['items'])) {
                    addLog("Bu sayfada sonuç yok.");
                    break;
                }

                $pageResultsCount = 0;
                foreach ($data['items'] as $item) {
                    if (count($allResults) >= $targetDepth)
                        break;

                    $cleanUrl = isset($item['link']) ? $item['link'] : '';
                    $title = isset($item['title']) ? $item['title'] : '';
                    $snippet = isset($item['snippet']) ? $item['snippet'] : '';

                    // Basic filtering
                    if (empty($cleanUrl) || strpos($cleanUrl, 'google.com') !== false)
                        continue;

                    $isDuplicate = false;
                    foreach ($allResults as $r) {
                        if ($r['url'] === $cleanUrl)
                            $isDuplicate = true;
                    }

                    if (!$isDuplicate) {
                        $allResults[] = ['url' => $cleanUrl, 'title' => $title, 'snippet' => $snippet, 'source' => 'API'];
                        $pageResultsCount++;
                    }
                }

                addLog("API sayfasından eklenen: $pageResultsCount. Toplam: " . count($allResults));

                if ($pageResultsCount === 0)
                    break; // If no valid results added from this page, stop.

                // Small delay to be nice
                usleep(200000);
            }

        } else {
            // ---------------------------------------------------------
            // MOD 2: SCRAPING (Eski Yöntem - Fallback)
            // ---------------------------------------------------------
            addLog("API anahtarı yok, Scraping Modu (Fallback) devreye giriyor.");
            addLog("Hedef: $targetDepth sonuç (Scraping).");

            $page = 0;
            $maxGooglePages = 10;
            $consecutiveEmptyPages = 0;

            while (count($allResults) < $targetDepth && $page < $maxGooglePages) {

                $numParam = ($page == 0) ? $targetDepth : 20;
                $startParam = $page * 10;

                $searchUrl = "https://www.google.com/search?q=" . urlencode($query) . "&gl=" . urlencode($gl) . "&num=" . $numParam . "&gbv=1&start=" . $startParam;

                addLog("Google Döngüsü #$page (Start: $startParam) taranıyor...");

                $html = fetchUrl($searchUrl, 'google', true);

                if (!$html) {
                    addLog("Google Sayfa $page yanıt vermedi, döngü kırılıyor.");
                    break;
                }

                $pageResultsCount = 0;

                if (preg_match_all('/<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/si', $html, $matches, PREG_SET_ORDER)) {
                    foreach ($matches as $m) {
                        if (count($allResults) >= $targetDepth)
                            break;

                        $rawHref = $m[1];
                        $rawInnerHtml = $m[2];
                        $cleanUrl = '';

                        if (strpos($rawHref, '/url?q=') !== false) {
                            $parts = parse_url($rawHref);
                            $queryParts = [];
                            parse_str(isset($parts['query']) ? $parts['query'] : '', $queryParts);
                            if (isset($queryParts['q']))
                                $cleanUrl = $queryParts['q'];
                        } elseif (strpos($rawHref, 'http') === 0) {
                            $cleanUrl = $rawHref;
                        }

                        if (empty($cleanUrl) || strpos($cleanUrl, 'google.com') !== false || strpos($cleanUrl, 'googleusercontent') !== false)
                            continue;

                        $title = strip_tags($rawInnerHtml);
                        $title = html_entity_decode($title);
                        $title = trim($title);

                        if (empty($title) || $title === $cleanUrl) {
                            if (preg_match('/<div[^>]*class="[^"]*BNeawe[^"]*"[^>]*>(.*?)<\/div>/si', $rawInnerHtml, $titleMatch)) {
                                $title = strip_tags($titleMatch[1]);
                            } else {
                                continue;
                            }
                        }

                        $isDuplicate = false;
                        foreach ($allResults as $r) {
                            if ($r['url'] === $cleanUrl)
                                $isDuplicate = true;
                        }

                        if (!$isDuplicate) {
                            $allResults[] = ['url' => $cleanUrl, 'title' => $title, 'snippet' => 'Google'];
                            $pageResultsCount++;
                        }
                    }
                }

                addLog("Bu sayfadan eklenen: $pageResultsCount. Toplam: " . count($allResults));

                if ($pageResultsCount === 0) {
                    $consecutiveEmptyPages++;
                    if ($consecutiveEmptyPages >= 2) {
                        addLog("Üst üste 2 boş sayfa, Google bitti.");
                        break;
                    }
                } else {
                    $consecutiveEmptyPages = 0;
                }

                if (count($allResults) >= $targetDepth)
                    break;

                $page++;
                usleep(800000);
            }

            // KAYNAK 2: BING
            if (count($allResults) < $targetDepth) {
                $needed = $targetDepth - count($allResults);
                addLog("Hala eksik var ($needed). Bing devreye giriyor...");
                try {
                    $bingUrl = "https://www.bing.com/search?q=" . urlencode($query) . "&format=rss&count=50";
                    $rssContent = fetchUrl($bingUrl, 'bing');
                    if ($rssContent) {
                        $xml = @simplexml_load_string($rssContent);
                        if ($xml && isset($xml->channel->item)) {
                            foreach ($xml->channel->item as $item) {
                                if (count($allResults) >= $targetDepth)
                                    break;
                                $cleanUrl = (string) $item->link;
                                $title = (string) $item->title;
                                if (empty($cleanUrl))
                                    continue;
                                $isDuplicate = false;
                                foreach ($allResults as $r) {
                                    if ($r['url'] === $cleanUrl)
                                        $isDuplicate = true;
                                }
                                if (!$isDuplicate)
                                    $allResults[] = ['url' => $cleanUrl, 'title' => $title, 'snippet' => 'Bing'];
                            }
                        }
                    }
                } catch (Exception $e) {
                    addLog("Bing Hata: " . $e->getMessage());
                }
            }

            // KAYNAK 3: DDG
            if (count($allResults) < $targetDepth) {
                $needed = $targetDepth - count($allResults);
                addLog("Hala eksik var. DDG devreye giriyor...");
                try {
                    $ddgUrl = "https://html.duckduckgo.com/html/?q=" . urlencode($query);
                    $htmlDDG = fetchUrl($ddgUrl, 'ddg');
                    if ($htmlDDG) {
                        if (preg_match_all('/<a[^>]*class=["\'][^"\']*result__a[^"\']*["\'][^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/si', $htmlDDG, $matches, PREG_SET_ORDER)) {
                            foreach ($matches as $m) {
                                if (count($allResults) >= $targetDepth)
                                    break;
                                $href = $m[1];
                                $title = strip_tags($m[2]);
                                $cleanUrl = $href;
                                if (strpos($href, 'uddg=') !== false) {
                                    $parts = parse_url($href);
                                    $qParts = [];
                                    parse_str(isset($parts['query']) ? $parts['query'] : '', $qParts);
                                    if (!empty($qParts['uddg']))
                                        $cleanUrl = urldecode($qParts['uddg']);
                                }
                                $cleanUrl = urldecode($cleanUrl);
                                if (empty($cleanUrl) || strpos($cleanUrl, 'duckduckgo.com') !== false)
                                    continue;
                                $isDuplicate = false;
                                foreach ($allResults as $r) {
                                    if ($r['url'] === $cleanUrl)
                                        $isDuplicate = true;
                                }
                                if (!$isDuplicate)
                                    $allResults[] = ['url' => $cleanUrl, 'title' => $title, 'snippet' => 'DuckDuckGo'];
                            }
                        }
                    }
                } catch (Exception $e) {
                    addLog("DDG Hata: " . $e->getMessage());
                }
            }
        }

        $formatted = [];
        foreach ($allResults as $r) {
            $formatted[] = [
                'url' => $r['url'],
                'title' => $r['title'],
                'snippet' => isset($r['snippet']) ? $r['snippet'] : ''
            ];
        }

        $response = ['success' => true, 'results' => $formatted, 'count' => count($formatted)];
    }

    if ($type !== 'search') {
        if (!isset($_GET['domain']))
            throw new Exception('Domain parametresi eksik.');
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
    $response = ['success' => false, 'error' => $e->getMessage(), 'debug' => $debugLog];
}

$buffer = ob_get_clean();
echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// --- YARDIMCI FONKSİYONLAR ---
function cleanDomain($url)
{
    $url = trim($url);
    $url = preg_replace('#^https?://#', '', $url);
    $url = preg_replace('#^www\.#', '', $url);
    return explode('/', $url)[0];
}

function fetchUrl($url, $mode = 'google', $rotateUA = false)
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
    curl_setopt($ch, CURLOPT_ENCODING, ""); // Handle gzip/deflate automatically

    // User Agent Havuzu (Rotasyon için)
    $userAgents = [
        'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 11; Redmi Note 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36'
    ];

    $ua = $rotateUA ? $userAgents[array_rand($userAgents)] : $userAgents[0];

    $headers = [
        "User-Agent: $ua",
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Upgrade-Insecure-Requests: 1'
    ];

    if ($mode === 'google') {
        $headers[] = 'Cookie: CONSENT=YES+; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg;';
        $headers[] = 'Referer: https://www.google.com/';
    } elseif ($mode === 'ddg') {
        $headers[] = 'Referer: https://html.duckduckgo.com/';
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $content = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode == 429) {
        global $debugLog;
        $debugLog[] = "HATA: $mode 429 (Çok Fazla İstek).";
    }
    return ($content === false || $httpCode >= 400) ? false : $content;
}

function getTraffic($domain)
{
    global $debugLog;
    addLog("Trafik Analizi Başlıyor: $domain");

    // 1. SimilarSites Kontrolü
    $ssValue = 0;
    $ssResult = ['success' => false];

    $targetUrl = "https://www.similarsites.com/site/" . urlencode($domain);
    $html = fetchUrl($targetUrl, 'other');
    if ($html) {
        if (preg_match('/"(MonthlyVisits|monthly_visits|TotalVisits)"\s*:\s*(\d+)/i', $html, $matches)) {
            $ssValue = (int) $matches[2];
            $ssResult = ['success' => true, 'source' => 'similarsites', 'value' => $ssValue, 'raw' => formatNumber($ssValue)];
            addLog("SimilarSites Buldu: $ssValue");
        }
    }

    // 2. Hypestat Kontrolü
    $hsValue = 0;
    $hsResult = ['success' => false];

    $hypeUrl = "https://hypestat.com/info/" . urlencode($domain);
    $htmlHype = fetchUrl($hypeUrl, 'other');

    if ($htmlHype) {
        // Debug: HTML'in başını logla ki ne geldiğini görelim
        addLog("Hypestat HTML Başlangıcı: " . substr(strip_tags($htmlHype), 0, 200) . "...");

        // Regex 1: "<div>Monthly Visits<span>82.1K</span></div>" (Esnek yapı)
        // <span>'dan sonra hemen </div> gelmeyebilir, aradaki etiketi yoksayalım.
        if (preg_match('/<div>Monthly Visits<span>(.*?)<\/span>/si', $htmlHype, $matches)) {
            $rawVal = strip_tags($matches[1]);
            $hsValue = parseNumberStr($rawVal);
            addLog("Hypestat (Specific Regex) Buldu: $hsValue (Ham: $rawVal)");
        }
        // Regex 2: "1,234 visitors per day" -> Monthly = Daily * 30
        elseif (preg_match('/([\d,]+)\s+visitors\s+per\s+day/i', $htmlHype, $matches)) {
            $hsValue = (int) str_replace(',', '', $matches[1]) * 30;
            addLog("Hypestat (Regex 2) Buldu: $hsValue");
        }
        // Regex 3: "Daily Unique Visitors: 1,234" -> Monthly = Daily * 30
        elseif (preg_match('/Daily Unique Visitors:\s*([\d,]+)/i', $htmlHype, $matches)) {
            $hsValue = (int) str_replace(',', '', $matches[1]) * 30;
            addLog("Hypestat (Regex 3) Buldu: $hsValue");
        }
        // Regex 4: "Unique Visits to this site" bloğu
        elseif (preg_match('/Unique Visits to this site.*?([\d,]+)/is', $htmlHype, $matches)) {
            $hsValue = (int) str_replace(',', '', $matches[1]) * 30;
            addLog("Hypestat (Regex 4) Buldu: $hsValue");
        }

        if ($hsValue > 0) {
            $hsResult = ['success' => true, 'source' => 'hypestat', 'value' => $hsValue, 'raw' => formatNumber($hsValue)];
        }
    } else {
        addLog("Hypestat yanıt vermedi (HTML boş).");
    }

    // 3. Karşılaştırma ve Sonuç
    if ($ssValue == 0 && $hsValue == 0) {
        addLog("Trafik verisi bulunamadı.");
        return ['success' => false, 'error' => 'Veri bulunamadı.'];
    }

    if ($ssValue >= $hsValue) {
        addLog("Kazanan: SimilarSites ($ssValue)");
        return $ssResult;
    } else {
        addLog("Kazanan: Hypestat ($hsValue)");
        return $hsResult;
    }
}

function findEmails($domain)
{
    global $debugLog;
    addLog("Email Tarama Başlıyor: $domain");

    $protocol = 'https://';
    $baseUrl = $protocol . $domain;

    // 1. Anasayfa Kontrolü
    $homeHtml = fetchUrl($baseUrl, 'other') ?: fetchUrl('http://' . $domain, 'other');
    $foundEmails = [];

    if ($homeHtml) {
        addLog("Anasayfa tarandı.");
        $foundEmails = array_merge($foundEmails, extractEmailsFromHtml($homeHtml, $domain));

        $contactLinks = findContactLinks($homeHtml, $baseUrl);
        $uniqueLinks = array_unique($contactLinks);

        // Limit 2'den 5'e çıkarıldı
        $linksToScan = array_slice($uniqueLinks, 0, 5);

        foreach ($linksToScan as $pageUrl) {
            addLog("Alt sayfa taranıyor: $pageUrl");
            if ($html = fetchUrl($pageUrl, 'other')) {
                $foundEmails = array_merge($foundEmails, extractEmailsFromHtml($html, $domain));
            }
        }
    } else {
        addLog("Anasayfaya ulaşılamadı.");
    }

    $result = array_slice(array_unique($foundEmails), 0, 5);
    addLog("Bulunan Email Sayısı: " . count($result));
    return $result;
}

function extractEmailsFromHtml($html, $domain)
{
    global $debugLog;
    $emails = [];

    // 1. Standart Regex (Plain Text)
    // "mailto:" linklerinde bazen %40 veya URL encoding olabilir, onu decode edelim
    $decodedHtml = urldecode($html);
    preg_match_all('/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/', $decodedHtml, $matches);

    if (!empty($matches[0])) {
        foreach ($matches[0] as $email) {
            if (isValidEmail($email, $domain))
                $emails[] = strtolower($email);
        }
    }

    // 2. Cloudflare Email Obfuscation Decoding
    // CF, email'i data-cfemail="..." içinde hex string olarak saklar.
    if (preg_match_all('/data-cfemail=["\']([a-f0-9]+)["\']/i', $html, $cfMatches)) {
        addLog("Cloudflare korumalı email bulundu: " . count($cfMatches[1]) . " adet.");
        foreach ($cfMatches[1] as $hex) {
            $decodedEmail = decodeCfEmail($hex);
            if (isValidEmail($decodedEmail, $domain)) {
                $emails[] = strtolower($decodedEmail);
                addLog("CF Decoded: $decodedEmail");
            }
        }
    }

    return $emails;
}

function decodeCfEmail($hex)
{
    if (strlen($hex) < 2)
        return '';
    $k = hexdec(substr($hex, 0, 2));
    $email = '';
    for ($i = 2; $i < strlen($hex); $i += 2) {
        $email .= chr(hexdec(substr($hex, $i, 2)) ^ $k);
    }
    return $email;
}

function findContactLinks($html, $baseUrl)
{
    $dom = new DOMDocument();
    @$dom->loadHTML($html);
    $links = $dom->getElementsByTagName('a');
    $candidates = [];
    // Genişletilmiş anahtar kelimeler
    $keywords = ['contact', 'iletisim', 'about', 'hakkimizda', 'impressum', 'kunye', 'künye', 'ulasim', 'ulaşım'];

    foreach ($links as $link) {
        $href = $link->getAttribute('href');
        foreach ($keywords as $kw) {
            if (stripos($href, $kw) !== false) {
                if (strpos($href, 'http') === false) {
                    $href = rtrim($baseUrl, '/') . '/' . ltrim($href, '/');
                }
                $candidates[] = $href;
            }
        }
    }
    return array_unique($candidates);
}

function isValidEmail($email, $domain)
{
    $junkTerms = ['example.com', '.png', '.jpg', '.js', '.css', 'sentry.io', 'noreply', 'domain.com', 'email.com'];
    foreach ($junkTerms as $term)
        if (strpos($email, $term) !== false)
            return false;
    return true;
}

function formatNumber($num)
{
    if ($num > 1000000)
        return number_format($num / 1000000, 1) . 'M';
    if ($num > 1000)
        return number_format($num / 1000, 1) . 'K';
    return (string) $num;
}

function parseNumberStr($str)
{
    if (!$str)
        return 0;

    $s = trim(strtolower($str));
    // Remove invisible characters
    $s = preg_replace('/[\x00-\x1F\x7F]/u', '', $s);

    $multiplier = 1;

    if (strpos($s, 'b') !== false)
        $multiplier = 1000000000;
    elseif (strpos($s, 'm') !== false)
        $multiplier = 1000000;
    elseif (strpos($s, 'k') !== false)
        $multiplier = 1000;

    // Remove non-numeric chars except dot
    $numPart = preg_replace('/[^0-9.]/', '', $s);
    $num = (float) $numPart;

    return (int) ($num * $multiplier);
}
?>