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

function addLog($msg) {
    global $debugLog;
    if (is_array($msg) || is_object($msg)) $msg = print_r($msg, true);
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

    // --- SEARCH FUNCTIONALITY ---
    if ($type === 'search') {
        $query = isset($_GET['q']) ? $_GET['q'] : '';
        $gl = isset($_GET['gl']) ? $_GET['gl'] : 'TR';
        $targetDepth = isset($_GET['depth']) ? (int) $_GET['depth'] : 10;
        
        if ($targetDepth > 100) $targetDepth = 100; // Max limit

        if (empty($query)) throw new Exception("Arama sorgusu boş olamaz.");

        $allResults = [];
        addLog("Hedef: $targetDepth sonuç. Strateji: Israrcı Google Döngüsü.");

        // ---------------------------------------------------------
        // KAYNAK 1: GOOGLE (DÖNGÜSEL TARAMA)
        // ---------------------------------------------------------
        $page = 0;
        $maxGooglePages = 10; // Sonsuz döngüye girmesin diye güvenlik limiti
        $consecutiveEmptyPages = 0;

        while (count($allResults) < $targetDepth && $page < $maxGooglePages) {
            
            // İlk sayfada şansımızı deneyip 100 isteyelim. Sonraki sayfalarda standart 10'luk dilimlerle gidelim.
            // Google bazen start parametresi varken num parametresini sevmez.
            $numParam = ($page == 0) ? $targetDepth : 20; 
            $startParam = $page * 10; // Google indexi 0, 10, 20... diye gider

            $searchUrl = "https://www.google.com/search?q=" . urlencode($query) . "&gl=" . urlencode($gl) . "&num=" . $numParam . "&gbv=1&start=" . $startParam;
            
            addLog("Google Döngüsü #$page (Start: $startParam) taranıyor...");
            
            // Her istekte farklı User-Agent kullan (Ban riskini azaltır)
            $html = fetchUrl($searchUrl, 'google', true);

            if (!$html) {
                addLog("Google Sayfa $page yanıt vermedi, döngü kırılıyor.");
                break;
            }

            $pageResultsCount = 0;

            // Regex Parsing
            if (preg_match_all('/<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/si', $html, $matches, PREG_SET_ORDER)) {
                foreach ($matches as $m) {
                    // Hedefe ulaştıysak döngüyü işlemeyi bırak
                    if (count($allResults) >= $targetDepth) break;

                    $rawHref = $m[1];
                    $rawInnerHtml = $m[2];
                    $cleanUrl = '';

                    if (strpos($rawHref, '/url?q=') !== false) {
                        $parts = parse_url($rawHref);
                        $queryParts = [];
                        parse_str(isset($parts['query']) ? $parts['query'] : '', $queryParts);
                        if (isset($queryParts['q'])) $cleanUrl = $queryParts['q'];
                    } elseif (strpos($rawHref, 'http') === 0) {
                        $cleanUrl = $rawHref;
                    }

                    if (empty($cleanUrl) || strpos($cleanUrl, 'google.com') !== false || strpos($cleanUrl, 'googleusercontent') !== false) continue;

                    $title = strip_tags($rawInnerHtml);
                    $title = html_entity_decode($title);
                    $title = trim($title);

                    if (empty($title) || $title === $cleanUrl) {
                        if (preg_match('/<div[^>]*class="[^"]*BNeawe[^"]*"[^>]*>(.*?)<\/div>/si', $rawInnerHtml, $titleMatch)) {
                            $title = strip_tags($titleMatch[1]);
                        } else { continue; }
                    }

                    $isDuplicate = false;
                    foreach ($allResults as $r) { if ($r['url'] === $cleanUrl) $isDuplicate = true; }

                    if (!$isDuplicate) {
                        $allResults[] = ['url' => $cleanUrl, 'title' => $title, 'snippet' => 'Google'];
                        $pageResultsCount++;
                    }
                }
            }

            addLog("Bu sayfadan eklenen: $pageResultsCount. Toplam: " . count($allResults));

            // Eğer bu sayfadan hiç yeni sonuç çıkmadıysa, muhtemelen son sayfadayız veya Google kesti.
            if ($pageResultsCount === 0) {
                $consecutiveEmptyPages++;
                if ($consecutiveEmptyPages >= 2) {
                    addLog("Üst üste 2 boş sayfa, Google bitti.");
                    break;
                }
            } else {
                $consecutiveEmptyPages = 0;
            }

            // Hedefe ulaştıysak çık
            if (count($allResults) >= $targetDepth) break;

            $page++;
            // Sayfalar arası bekleme (IP engellenmemesi için kritik)
            usleep(800000); // 0.8 saniye
        }


        // ---------------------------------------------------------
        // KAYNAK 2: BING (Yedek - Hala eksik varsa)
        // ---------------------------------------------------------
        if (count($allResults) < $targetDepth) {
            $needed = $targetDepth - count($allResults);
            addLog("Hala eksik var ($needed). Bing devreye giriyor...");

            try {
                $bingUrl = "https://www.bing.com/search?q=" . urlencode($query) . "&format=rss&count=50"; // Bing'den de çok iste
                $rssContent = fetchUrl($bingUrl, 'bing');

                if ($rssContent) {
                    $xml = @simplexml_load_string($rssContent);
                    if ($xml && isset($xml->channel->item)) {
                        foreach ($xml->channel->item as $item) {
                            if (count($allResults) >= $targetDepth) break;

                            $cleanUrl = (string)$item->link;
                            $title = (string)$item->title;
                            
                            if (empty($cleanUrl)) continue;

                            $isDuplicate = false;
                            foreach ($allResults as $r) { if ($r['url'] === $cleanUrl) $isDuplicate = true; }

                            if (!$isDuplicate) {
                                $allResults[] = ['url' => $cleanUrl, 'title' => $title, 'snippet' => 'Bing'];
                            }
                        }
                    }
                }
            } catch (Exception $e) { addLog("Bing Hata: " . $e->getMessage()); }
        }


        // ---------------------------------------------------------
        // KAYNAK 3: DUCKDUCKGO (Son Çare)
        // ---------------------------------------------------------
        if (count($allResults) < $targetDepth) {
            $needed = $targetDepth - count($allResults);
            addLog("Hala eksik var. DDG devreye giriyor...");
            
            try {
                $ddgUrl = "https://html.duckduckgo.com/html/?q=" . urlencode($query);
                $htmlDDG = fetchUrl($ddgUrl, 'ddg');
                
                if ($htmlDDG) {
                    if (preg_match_all('/<a[^>]*class=["\'][^"\']*result__a[^"\']*["\'][^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/si', $htmlDDG, $matches, PREG_SET_ORDER)) {
                        foreach ($matches as $m) {
                            if (count($allResults) >= $targetDepth) break;

                            $href = $m[1];
                            $title = strip_tags($m[2]);
                            $cleanUrl = $href;

                            if (strpos($href, 'uddg=') !== false) {
                                $parts = parse_url($href);
                                $qParts = [];
                                parse_str(isset($parts['query']) ? $parts['query'] : '', $qParts);
                                if (!empty($qParts['uddg'])) $cleanUrl = urldecode($qParts['uddg']);
                            }
                            $cleanUrl = urldecode($cleanUrl);

                            if (empty($cleanUrl) || strpos($cleanUrl, 'duckduckgo.com') !== false) continue;
                            
                            $isDuplicate = false;
                            foreach ($allResults as $r) { if ($r['url'] === $cleanUrl) $isDuplicate = true; }
                            
                            if (!$isDuplicate) {
                                $allResults[] = ['url' => $cleanUrl, 'title' => $title, 'snippet' => 'DuckDuckGo'];
                            }
                        }
                    }
                }
            } catch (Exception $e) { addLog("DDG Hata: " . $e->getMessage()); }
        }

        $response = ['success' => true, 'results' => $allResults, 'count' => count($allResults)];
    }

    if ($type !== 'search') {
        if (!isset($_GET['domain'])) throw new Exception('Domain parametresi eksik.');
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
function cleanDomain($url) {
    $url = trim($url);
    $url = preg_replace('#^https?://#', '', $url);
    $url = preg_replace('#^www\.#', '', $url);
    return explode('/', $url)[0];
}

function fetchUrl($url, $mode = 'google', $rotateUA = false) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
    
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

function getTraffic($domain) {
    $targetUrl = "https://www.similarsites.com/site/" . urlencode($domain);
    $html = fetchUrl($targetUrl, 'other');
    if ($html) {
        if (preg_match('/"(MonthlyVisits|monthly_visits|TotalVisits)"\s*:\s*(\d+)/i', $html, $matches)) {
            $rawNum = (int) $matches[2];
            return ['success' => true, 'source' => 'similarsites-regex', 'value' => $rawNum, 'raw' => formatNumber($rawNum)];
        }
    }
    $hypeUrl = "https://hypestat.com/info/" . urlencode($domain);
    $htmlHype = fetchUrl($hypeUrl, 'other');
    if ($htmlHype) {
        if (preg_match('/([\d,]+)\s+visitors\s+per\s+day/i', $htmlHype, $matches)) {
            $monthly = (int) str_replace(',', '', $matches[1]) * 30;
            return ['success' => true, 'source' => 'hypestat', 'value' => $monthly, 'raw' => formatNumber($monthly)];
        }
    }
    return ['success' => false, 'error' => 'Veri bulunamadı.'];
}

function findEmails($domain) {
    $protocol = 'https://';
    $baseUrl = $protocol . $domain;
    $homeHtml = fetchUrl($baseUrl, 'other') ?: fetchUrl('http://' . $domain, 'other');
    $foundEmails = [];
    if ($homeHtml) {
        $foundEmails = array_merge($foundEmails, extractEmailsFromHtml($homeHtml, $domain));
        $contactLinks = findContactLinks($homeHtml, $baseUrl);
        foreach (array_slice($contactLinks, 0, 2) as $pageUrl) {
            if ($html = fetchUrl($pageUrl, 'other'))
                $foundEmails = array_merge($foundEmails, extractEmailsFromHtml($html, $domain));
        }
    }
    return array_slice(array_unique($foundEmails), 0, 5);
}

function extractEmailsFromHtml($html, $domain) {
    $emails = [];
    preg_match_all('/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/', $html, $matches);
    if (!empty($matches[0])) {
        foreach ($matches[0] as $email) {
            if (isValidEmail($email, $domain)) $emails[] = strtolower($email);
        }
    }
    return $emails;
}

function findContactLinks($html, $baseUrl) {
    $dom = new DOMDocument();
    @$dom->loadHTML($html);
    $links = $dom->getElementsByTagName('a');
    $candidates = [];
    $keywords = ['contact', 'iletisim', 'about', 'hakkimizda', 'impressum'];
    foreach ($links as $link) {
        $href = $link->getAttribute('href');
        foreach ($keywords as $kw) {
            if (stripos($href, $kw) !== false) {
                if (strpos($href, 'http') === false) $href = rtrim($baseUrl, '/') . '/' . ltrim($href, '/');
                $candidates[] = $href;
            }
        }
    }
    return array_unique($candidates);
}

function isValidEmail($email, $domain) {
    $junkTerms = ['example.com', '.png', '.jpg', '.js', '.css', 'sentry.io', 'noreply', 'domain.com', 'email.com'];
    foreach ($junkTerms as $term) if (strpos($email, $term) !== false) return false;
    return true;
}

function formatNumber($num) {
    if ($num > 1000000) return number_format($num / 1000000, 1) . 'M';
    if ($num > 1000) return number_format($num / 1000, 1) . 'K';
    return (string) $num;
}
?>
