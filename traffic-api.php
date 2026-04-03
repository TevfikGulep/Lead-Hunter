<?php
// traffic-api.php - Simple Version

ob_start();
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$debugLog = [];

function addLog($msg)
{
    global $debugLog;
    $debugLog[] = date('H:i:s') . " - " . $msg;
}

try {
    $type = isset($_GET['type']) ? $_GET['type'] : '';

    // === TRACKING ===
    if ($type === 'track') {
        ob_clean();
        $id = isset($_GET['id']) ? preg_replace('/[^a-zA-Z0-9]/', '', $_GET['id']) : null;
        if ($id) {
            $data = file_exists('tracking_data.json') ? json_decode(file_get_contents('tracking_data.json'), true) : [];
            $data[$id] = date('c');
            file_put_contents('tracking_data.json', json_encode($data));
        }
        header('Content-Type: image/gif');
        echo base64_decode('R0lGODlhAQABAJAAAP8AAAAAACH5BAUQAAAALAAAAAABAAEAAAICBAEAOw==');
        exit;
    }

    // === SYNC OPENS ===
    if ($type === 'sync_opens') {
        $data = file_exists('tracking_data.json') ? json_decode(file_get_contents('tracking_data.json'), true) : [];
        echo json_encode(['success' => true, 'data' => $data]);
        exit;
    }

    // === BING SEARCH ===
    if ($type === 'search_bing') {
        $query = isset($_GET['q']) ? $_GET['q'] : '';
        $depth = isset($_GET['depth']) ? (int) $_GET['depth'] : 30;

        if (empty($query))
            throw new Exception("Query required");

        addLog("Bing: $query");

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://www.bing.com/search?q=" . urlencode($query) . "&setlang=tr");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
        ]);

        $html = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        addLog("Bing HTTP: $httpCode, Error: $curlErr, Length: " . strlen($html));

        $results = [];
        $seen = [];

        if ($html && strlen($html) > 1000 && $httpCode == 200) {
            addLog("Bing: HTML alındı, regex deneniyor...");

            // Method 1: Standard link extraction
            if (preg_match_all('/href=["\']([^"\']+)["\']/si', $html, $matches)) {
                addLog("Bing: Method 1 matched " . count($matches[1]) . " links");
            }

            // Method 2: Look for result links specifically
            if (preg_match_all('/<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>.*?href=["\']([^"\']+)["\']/si', $html, $matches2)) {
                addLog("Bing: Method 2 matched " . count($matches2[1]) . " links");
                $matches[1] = array_merge($matches[1] ?? [], $matches2[1]);
            }

            // Method 3: Look for any https link that looks like a result
            if (preg_match_all('/href=["\'](https?:\/\/(?:www\.)?(?!bing|microsoft|facebook|twitter|linkedin)[^"\']+)["\']/si', $html, $matches3)) {
                addLog("Bing: Method 3 matched " . count($matches3[1]) . " links");
                $matches[1] = array_merge($matches[1] ?? [], $matches3[1]);
            }

            $count = 0;
            foreach ($matches[1] ?? [] as $url) {
                if ($count >= $depth)
                    break;

                $url = trim($url);

                // Skip empty URLs
                if (empty($url))
                    continue;

                // Handle relative URLs - convert to absolute if needed
                if (strpos($url, 'http') !== 0 && strpos($url, '/') === 0) {
                    // It's a relative path, skip for now
                    continue;
                }

                // Skip javascript and other non-http URLs
                if (strpos($url, 'javascript:') !== false)
                    continue;
                if (strpos($url, 'mailto:') !== false)
                    continue;
                if (strpos($url, 'tel:') !== false)
                    continue;

                // Ensure it starts with http
                if (strpos($url, 'http') !== 0) {
                    $url = 'https://' . $url;
                }

                // Skip Bing domains
                if (strpos($url, 'bing.com') !== false)
                    continue;
                if (strpos($url, 'microsoft.com') !== false)
                    continue;
                if (strpos($url, 'facebook.com') !== false)
                    continue;
                if (strpos($url, 'twitter.com') !== false)
                    continue;
                if (strpos($url, 'linkedin.com') !== false)
                    continue;
                if (strpos($url, 'youtube.com') !== false)
                    continue;
                if (strpos($url, 'instagram.com') !== false)
                    continue;

                $domain = @parse_url($url, PHP_URL_HOST);
                if (empty($domain) || isset($seen[$domain]))
                    continue;
                $seen[$domain] = true;

                // Use domain as title
                $title = $domain;

                $results[] = ['url' => $url, 'title' => $title, 'snippet' => 'Bing'];
                $count++;
                addLog("Bing found [$count]: $url (domain: $domain)");
            }
            addLog("Bing: Toplam $count sonuç");
        } else {
            addLog("Bing: Yetersiz veri veya hata. HTTP: $httpCode, Length: " . strlen($html));
        }

        $response = ['success' => true, 'results' => $results, 'count' => count($results)];
    }

    // === DUCKDUCKGO SEARCH ===
    elseif ($type === 'search_duckduckgo') {
        $query = isset($_GET['q']) ? $_GET['q'] : '';
        $depth = isset($_GET['depth']) ? (int) $_GET['depth'] : 30;

        if (empty($query))
            throw new Exception("Query required");

        addLog("DDG: $query");

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://html.duckduckgo.com/html/?q=" . urlencode($query) . "&b=1");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
        ]);

        $html = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        addLog("DDG HTTP: $httpCode, Error: $curlErr, Length: " . strlen($html));

        $results = [];
        $seen = [];

        if ($html && strlen($html) > 500 && in_array($httpCode, [200, 202])) {
            addLog("DDG: HTML alındı, regex deneniyor...");

            // Try multiple patterns
            $allMatches = [];

            // Pattern 1: Standard a href
            if (preg_match_all('/<a[^>]+href=["\']([^"\']+)["\'][^>]*>/si', $html, $m1)) {
                addLog("DDG: Method 1 matched " . count($m1[1]) . " links");
                $allMatches = array_merge($allMatches, $m1[1]);
            }

            // Pattern 2: Result links with data-url
            if (preg_match_all('/data-url=["\']([^"\']+)["\']/si', $html, $m2)) {
                addLog("DDG: Method 2 (data-url) matched " . count($m2[1]) . " links");
                $allMatches = array_merge($allMatches, $m2[1]);
            }

            // Pattern 3: href with uddg (DDG redirect)
            if (preg_match_all('/href=["\']([^"\']*uddg[^"\']*)["\']/si', $html, $m3)) {
                addLog("DDG: Method 3 (uddg) matched " . count($m3[1]) . " links");
                $allMatches = array_merge($allMatches, $m3[1]);
            }

            $count = 0;
            foreach ($allMatches as $url) {
                if ($count >= $depth)
                    break;

                $url = trim($url);

                // Decode DDG redirect if present
                $cleanUrl = $url;
                if (strpos($url, 'uddg=') !== false) {
                    // Extract the actual URL from the uddg parameter
                    if (preg_match('/uddg=([^&]+)/', $url, $uddgMatch)) {
                        $cleanUrl = urldecode($uddgMatch[1]);
                    }
                }

                // Also try direct URL decode
                $cleanUrl = urldecode($cleanUrl);

                // Skip DDG domains
                if (strpos($cleanUrl, 'duckduckgo.com') !== false)
                    continue;
                if (strpos($cleanUrl, 'html.duckduckgo.com') !== false)
                    continue;

                // Skip non-http URLs
                if (strpos($cleanUrl, 'http') !== 0)
                    continue;

                $domain = parse_url($cleanUrl, PHP_URL_HOST);
                if (!$domain || isset($seen[$domain]))
                    continue;
                $seen[$domain] = true;

                $results[] = ['url' => $cleanUrl, 'title' => $domain, 'snippet' => 'DDG'];
                $count++;
                addLog("DDG found: $cleanUrl");
            }
            addLog("DDG: Toplam $count sonuç");
        } else {
            addLog("DDG: Yetersiz veri veya hata. HTTP: $httpCode, Length: " . strlen($html));
        }

        $response = ['success' => true, 'results' => $results, 'count' => count($results)];
    }

    // === DATAFORSEO SEARCH ===
    elseif ($type === 'search_dataforseo') {
        $query = isset($_GET['q']) ? $_GET['q'] : '';
        $depth = isset($_GET['depth']) ? (int) $_GET['depth'] : 30;
        $gl = isset($_GET['gl']) ? strtoupper(trim($_GET['gl'])) : 'TR';
        $lang = isset($_GET['lang']) ? strtoupper(trim($_GET['lang'])) : '';

        if (empty($query))
            throw new Exception("Query required");

        addLog("DataForSEO: $query (gl=$gl)");

        $locationMap = [
            'TR' => 2792, 'US' => 2840, 'UK' => 2826, 'GB' => 2826,
            'DE' => 2276, 'FR' => 2250, 'IT' => 2380, 'ES' => 2724,
            'NL' => 2528, 'PL' => 2616, 'RO' => 2642, 'GR' => 2300, 'BG' => 2100
        ];

        $langMap = [
            'TR' => 'tr', 'US' => 'en', 'UK' => 'en', 'GB' => 'en',
            'DE' => 'de', 'FR' => 'fr', 'IT' => 'it', 'ES' => 'es',
            'NL' => 'nl', 'PL' => 'pl', 'RO' => 'ro', 'GR' => 'el', 'BG' => 'bg'
        ];

        $locationCode = isset($locationMap[$gl]) ? $locationMap[$gl] : 2792;
        $languageCode = '';
        if ($lang && isset($langMap[$lang])) {
            $languageCode = $langMap[$lang];
        } elseif (isset($langMap[$gl])) {
            $languageCode = $langMap[$gl];
        } else {
            $languageCode = 'tr';
        }

        $postData = json_encode([[
            "keyword" => $query,
            "location_code" => $locationCode,
            "language_code" => $languageCode,
            "device" => "desktop",
            "os" => "windows",
            "depth" => $depth
        ]]);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://api.dataforseo.com/v3/serp/google/organic/live");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Basic dGV2ZmlrZ3VsZXBAb3hpZ2VuLnRlYW06Njg5ODAzOTc2NTlkYWQ5Ng==',
            'Content-Type: application/json'
        ]);

        $jsonResp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        addLog("DataForSEO HTTP: $httpCode, Error: $curlErr, Length: " . strlen($jsonResp));

        $results = [];
        $data = json_decode($jsonResp, true);
        $dfRateLimited = false;

        // Rate limit / hata kodu kontrolü
        if ($data && isset($data['tasks'][0]['status_code'])) {
            $dfStatusCode = (int)$data['tasks'][0]['status_code'];
            if (in_array($dfStatusCode, [40202, 40301, 40302, 20100])) {
                $dfErrMsg = $data['tasks'][0]['status_message'] ?? 'Rate limit';
                addLog("DataForSEO RATE LIMIT: status=$dfStatusCode, msg=$dfErrMsg");
                $response = ['success' => false, 'results' => [], 'error' => 'rate_limited', 'rate_limited' => true, 'status_code' => $dfStatusCode];
                $dfRateLimited = true;
            }
        }

        if (!$dfRateLimited && $data && isset($data['tasks'][0]['result'][0]['items']) && is_array($data['tasks'][0]['result'][0]['items'])) {
            $items = $data['tasks'][0]['result'][0]['items'];
            addLog("DataForSEO: " . count($items) . " items returned");

            $seen = [];
            foreach ($items as $item) {
                if (count($results) >= $depth) break;
                if (!isset($item['type']) || $item['type'] !== 'organic') continue;

                $url = isset($item['url']) ? $item['url'] : '';
                $title = isset($item['title']) ? $item['title'] : '';
                $snippet = isset($item['description']) ? $item['description'] : '';
                $itemDomain = isset($item['domain']) ? $item['domain'] : '';

                if (empty($url)) continue;

                // Deduplicate by domain
                $domKey = $itemDomain ?: parse_url($url, PHP_URL_HOST);
                if ($domKey && isset($seen[$domKey])) continue;
                if ($domKey) $seen[$domKey] = true;

                $results[] = [
                    'url' => $url,
                    'title' => $title,
                    'snippet' => $snippet
                ];
                addLog("DataForSEO found: $url");
            }
        } elseif (!$dfRateLimited) {
            $errMsg = 'No results';
            if ($data && isset($data['tasks'][0]['status_message'])) {
                $errMsg = $data['tasks'][0]['status_message'];
            }
            addLog("DataForSEO error: $errMsg");
        }

        if (!$dfRateLimited) {
            $response = ['success' => count($results) > 0, 'results' => $results, 'count' => count($results), 'engine' => 'dataforseo'];
        }
    }

    // === GOOGLE SEARCH (API or Scraping) ===
    elseif ($type === 'search') {
        $query = isset($_GET['q']) ? $_GET['q'] : '';
        $depth = isset($_GET['depth']) ? (int) $_GET['depth'] : 30;
        $apiKey = isset($_GET['apiKey']) ? $_GET['apiKey'] : '';
        $cx = isset($_GET['cx']) ? $_GET['cx'] : '';

        if (empty($query))
            throw new Exception("Query required");

        addLog("Google: $query");

        $results = [];

        // Try API first
        if ($apiKey && $cx) {
            addLog("Using Google API");

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, "https://www.googleapis.com/customsearch/v1?key=" . urlencode($apiKey) . "&cx=" . urlencode($cx) . "&q=" . urlencode($query) . "&num=10");
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);

            $jsonResp = curl_exec($ch);
            curl_close($ch);

            $data = json_decode($jsonResp, true);

            if (isset($data['items'])) {
                foreach ($data['items'] as $item) {
                    if (count($results) >= $depth)
                        break;
                    if (strpos($item['link'], 'google.com') !== false)
                        continue;
                    $results[] = [
                        'url' => $item['link'],
                        'title' => $item['title'] ?? '',
                        'snippet' => $item['snippet'] ?? ''
                    ];
                }
                addLog("Google API: " . count($results) . " results");
            } else {
                addLog("Google API error: " . ($data['error']['message'] ?? 'No items'));
            }
        }

        // Fallback to DataForSEO if no API results
        if (count($results) == 0) {
            addLog("Google API returned 0 results, trying DataForSEO fallback...");

            $dfsGl = isset($_GET['gl']) ? strtoupper(trim($_GET['gl'])) : 'TR';
            $dfsLocationMap = [
                'TR' => 2792, 'US' => 2840, 'UK' => 2826, 'GB' => 2826,
                'DE' => 2276, 'FR' => 2250, 'IT' => 2380, 'ES' => 2724,
                'NL' => 2528, 'PL' => 2616, 'RO' => 2642, 'GR' => 2300, 'BG' => 2100
            ];
            $dfsLangMap = [
                'TR' => 'tr', 'US' => 'en', 'UK' => 'en', 'GB' => 'en',
                'DE' => 'de', 'FR' => 'fr', 'IT' => 'it', 'ES' => 'es',
                'NL' => 'nl', 'PL' => 'pl', 'RO' => 'ro', 'GR' => 'el', 'BG' => 'bg'
            ];

            $dfsLocCode = isset($dfsLocationMap[$dfsGl]) ? $dfsLocationMap[$dfsGl] : 2792;
            $dfsLangCode = isset($dfsLangMap[$dfsGl]) ? $dfsLangMap[$dfsGl] : 'tr';

            $dfsPostData = json_encode([[
                "keyword" => $query,
                "location_code" => $dfsLocCode,
                "language_code" => $dfsLangCode,
                "device" => "desktop",
                "os" => "windows",
                "depth" => $depth
            ]]);

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, "https://api.dataforseo.com/v3/serp/google/organic/live");
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $dfsPostData);
            curl_setopt($ch, CURLOPT_TIMEOUT, 60);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Authorization: Basic dGV2ZmlrZ3VsZXBAb3hpZ2VuLnRlYW06Njg5ODAzOTc2NTlkYWQ5Ng==',
                'Content-Type: application/json'
            ]);

            $dfsResp = curl_exec($ch);
            $dfsHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            addLog("DataForSEO fallback HTTP: $dfsHttpCode, Length: " . strlen($dfsResp));

            $dfsData = json_decode($dfsResp, true);
            if ($dfsData && isset($dfsData['tasks'][0]['result'][0]['items']) && is_array($dfsData['tasks'][0]['result'][0]['items'])) {
                $seen = [];
                foreach ($dfsData['tasks'][0]['result'][0]['items'] as $item) {
                    if (count($results) >= $depth) break;
                    if (!isset($item['type']) || $item['type'] !== 'organic') continue;
                    $dfsUrl = isset($item['url']) ? $item['url'] : '';
                    if (empty($dfsUrl)) continue;
                    $dfsDom = isset($item['domain']) ? $item['domain'] : parse_url($dfsUrl, PHP_URL_HOST);
                    if ($dfsDom && isset($seen[$dfsDom])) continue;
                    if ($dfsDom) $seen[$dfsDom] = true;

                    $results[] = [
                        'url' => $dfsUrl,
                        'title' => isset($item['title']) ? $item['title'] : '',
                        'snippet' => isset($item['description']) ? $item['description'] : ''
                    ];
                }
                addLog("DataForSEO fallback: " . count($results) . " results");
            }
        }

        // Fallback to scraping if still no results
        if (count($results) == 0) {
            addLog("Using Google Scraping");

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, "https://www.google.com/search?q=" . urlencode($query) . "&num=20");
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept: text/html',
                'Cookie: CONSENT=YES+'
            ]);

            $html = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            addLog("Google scrap HTTP: $httpCode, Length: " . strlen($html));

            if ($html && strlen($html) > 500) {
                if (preg_match_all('/<a[^>]+href=["\']([^"\']+)["\'][^>]*>/si', $html, $matches)) {
                    $seen = [];
                    foreach ($matches[1] as $href) {
                        if (count($results) >= $depth)
                            break;

                        $url = '';
                        if (strpos($href, '/url?q=') !== false) {
                            parse_str(parse_url($href, PHP_URL_QUERY), $qs);
                            $url = $qs['q'] ?? '';
                        } elseif (strpos($href, 'http') === 0) {
                            $url = $href;
                        }

                        if ($url && strpos($url, 'google') === false) {
                            $domain = parse_url($url, PHP_URL_HOST);
                            if ($domain && !isset($seen[$domain])) {
                                $seen[$domain] = true;
                                $results[] = ['url' => $url, 'title' => $domain, 'snippet' => 'Google'];
                            }
                        }
                    }
                    addLog("Google scrap: " . count($results) . " results");
                }
            }
        }

        $response = ['success' => true, 'results' => $results, 'count' => count($results)];
    }

    // === EMAIL DISCOVERY ===
    elseif ($type === 'email') {
        $domain = isset($_GET['domain']) ? $_GET['domain'] : (isset($_GET['url']) ? parse_url($_GET['url'], PHP_URL_HOST) : '');
        if (empty($domain))
            throw new Exception("Domain required");

        $domain = preg_replace('#^www\.#', '', strtolower($domain));
        $baseUrl = 'https://' . $domain;
        addLog("Email discovery started for: $domain");

        $emails = [];
        $scannedPages = [];

        // Known invalid prefixes and domains to skip
        $skipPrefixes = ['sentry', 'noreply', 'no-reply', 'donotreply', 'test', 'example', 'abuse', 'postmaster', 'mailer-daemon', 'mailer', 'notifications', 'feedback', 'admin', 'administrator', 'webmaster', 'support-bot', 'wix', 'wordpress', 'hello@domain.com', 'yourname@', 'email@', 'name@'];
        $skipDomains = ['example.com', 'domain.com', 'sentry.io', 'wixpress.com', 'wix.com', 'sentry.com', 'test.com'];

        // Cloudflare Email Decoder
        $decodeCF = function ($encoded) {
            if (!$encoded || strlen($encoded) < 4)
                return '';
            $k = hexdec(substr($encoded, 0, 2));
            $email = '';
            for ($i = 2, $len = strlen($encoded); $i < $len; $i += 2) {
                $email .= chr(hexdec(substr($encoded, $i, 2)) ^ $k);
            }
            return $email;
        };

        $isValidEmail = function ($email) use ($skipPrefixes, $skipDomains) {
            $e = strtolower(trim($email));
            if (!filter_var($e, FILTER_VALIDATE_EMAIL)) return false;
            
            // Skip common image/resource false positives that regex might catch
            if (preg_match('/\.(png|jpg|jpeg|gif|css|js|webp|svg|ico|php|html|woff|ttf|eot)$/i', $e)) return false;

            // Strict domain and prefix check
            foreach ($skipDomains as $sd) {
                if (strpos($e, '@' . $sd) !== false || str_ends_with($e, '.' . $sd)) return false;
            }
            foreach ($skipPrefixes as $sp) {
                if (str_starts_with($e, $sp . '@')) return false;
                if ($e === $sp) return false;
            }

            // Reject anything shorter than 6 characters or too long
            if (strlen($e) < 6 || strlen($e) > 80) return false;

            return true;
        };

        // Helper function for fetching and extracting
        $fetchAndExtract = function ($url) use (&$emails, &$scannedPages, $decodeCF, $isValidEmail) {
            // Normalize URL to avoid scanning same page multiple times with trailing slash / http vs https
            $normalizedUrl = rtrim(str_replace('http://', 'https://', $url), '/');
            if (in_array($normalizedUrl, $scannedPages))
                return '';
            
            $scannedPages[] = $normalizedUrl;

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
            ]);
            $html = curl_exec($ch);
            curl_close($ch);

            if ($html) {
                // 1. Cloudflare Data-CFEmail
                if (preg_match_all('/data-cfemail=["\']([0-9a-f]+)["\']/i', $html, $cfMatches)) {
                    foreach ($cfMatches[1] as $enc) {
                        $dec = $decodeCF($enc);
                        if ($dec && $isValidEmail($dec) && !in_array($dec, $emails)) {
                            $emails[] = $dec;
                        }
                    }
                }

                // 2. Cloudflare Email-Protection links
                if (preg_match_all('/email-protection#([0-9a-f]+)/i', $html, $cfMatches2)) {
                    foreach ($cfMatches2[1] as $enc) {
                        $dec = $decodeCF($enc);
                        if ($dec && $isValidEmail($dec) && !in_array($dec, $emails)) {
                            $emails[] = $dec;
                        }
                    }
                }

                // 3. Mailto links (More reliable than raw text)
                if (preg_match_all('/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10})/i', $html, $matchesMailto)) {
                    foreach ($matchesMailto[1] as $m) {
                        $m = strtolower(trim($m));
                        if ($isValidEmail($m) && !in_array($m, $emails)) {
                            $emails[] = $m;
                        }
                    }
                }

                // 4. Standard Regex for emails within text
                if (preg_match_all('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}/i', $html, $matches)) {
                    foreach ($matches[0] as $e) {
                        if ($isValidEmail($e) && !in_array($e, $emails)) {
                            $emails[] = strtolower(trim($e));
                        }
                    }
                }

                // 5. Obfuscated emails [at]
                if (preg_match_all('/[a-z0-9._%+-]+\s*[\[\(\{]\s*at\s*[\]\)\}]\s*[a-z0-9.-]+\.[a-z]{2,6}/i', $html, $matchesObf)) {
                    foreach ($matchesObf[0] as $obf) {
                        $e = preg_replace('/\s*[\[\(\{]\s*at\s*[\]\)\}]\s*/i', '@', strtolower($obf));
                        if ($isValidEmail($e) && !in_array($e, $emails)) {
                            $emails[] = strtolower(trim($e));
                        }
                    }
                }

                // 6. [dot] obfuscation: user[dot]name[at]domain[dot]com
                $htmlDotDecoded = preg_replace('/\s*[\[\(\{]\s*dot\s*[\]\)\}]\s*/i', '.', $html);
                if ($htmlDotDecoded !== $html) {
                    if (preg_match_all('/[a-z0-9._%+-]+\s*[\[\(\{]\s*at\s*[\]\)\}]\s*[a-z0-9.-]+\.[a-z]{2,6}/i', $htmlDotDecoded, $dotAtMatches)) {
                        foreach ($dotAtMatches[0] as $obf) {
                            $e = preg_replace('/\s*[\[\(\{]\s*at\s*[\]\)\}]\s*/i', '@', strtolower($obf));
                            if ($isValidEmail($e) && !in_array($e, $emails)) $emails[] = strtolower(trim($e));
                        }
                    }
                    if (preg_match_all('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}/i', $htmlDotDecoded, $dotEmailMatches)) {
                        foreach ($dotEmailMatches[0] as $e) {
                            if ($isValidEmail($e) && !in_array(strtolower($e), $emails)) $emails[] = strtolower(trim($e));
                        }
                    }
                }

                // 7. HTML entity encoded @ sign: user&#64;domain.com or user&#x40;domain.com
                $htmlEntityDecoded = preg_replace_callback('/&#(x[0-9a-f]+|\d+);/i', function($m) {
                    $c = $m[1];
                    return chr(strtolower($c[0]) === 'x' ? hexdec(substr($c, 1)) : (int)$c);
                }, $html);
                if ($htmlEntityDecoded !== $html && preg_match_all('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}/i', $htmlEntityDecoded, $entityMatches)) {
                    foreach ($entityMatches[0] as $e) {
                        $e = strtolower(trim($e));
                        if ($isValidEmail($e) && !in_array($e, $emails)) $emails[] = $e;
                    }
                }

                // 8. JSON-LD structured data: "email": "user@domain.com"
                if (preg_match_all('/<script[^>]+type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>/si', $html, $jsonLdBlocks)) {
                    foreach ($jsonLdBlocks[1] as $jsonBlock) {
                        if (preg_match_all('/"(?:email|contactEmail)"\s*:\s*"([^"@\s]+@[^"@\s]+)"/i', $jsonBlock, $ldEmailMatches)) {
                            foreach ($ldEmailMatches[1] as $ldEmail) {
                                $ldEmail = strtolower(trim($ldEmail));
                                if ($isValidEmail($ldEmail) && !in_array($ldEmail, $emails)) $emails[] = $ldEmail;
                            }
                        }
                    }
                }
            }
            return $html;
        };

        // 1. Scan Homepage
        $homeHtml = $fetchAndExtract($baseUrl);

        // 2. Scan Internal Pages (Priority to Contact/About)
        if ($homeHtml) {
            addLog("Scanning subpages to find more emails...");
            
            // Collect all internal links
            $internalLinks = [];
            
            if (preg_match_all('/href=["\']([^"\']+)["\']/i', $homeHtml, $allLinks)) {
                foreach ($allLinks[1] as $path) {
                    $path = trim($path);
                    
                    // Skip empty, anchors, JS, tel, mailto
                    if (empty($path) || strpos($path, '#') === 0 || strpos($path, 'javascript:') === 0 || strpos($path, 'mailto:') === 0 || strpos($path, 'tel:') === 0) {
                        continue;
                    }

                    // Build absolute URL
                    $fullUrl = $path;
                    if (strpos($path, 'http') !== 0 && strpos($path, '//') !== 0) {
                        $fullUrl = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');
                    } else if (strpos($path, '//') === 0) {
                        $fullUrl = 'https:' . $path;
                    }

                    // Ensure it belongs to the same core domain
                    $urlHost = parse_url($fullUrl, PHP_URL_HOST);
                    if ($urlHost && strpos($urlHost, str_replace('www.', '', $domain)) !== false) {
                        $cleanUrl = rtrim(explode('?', $fullUrl)[0], '/'); // strip queries & trailing slashes for deduplication
                        if (!in_array($cleanUrl, $internalLinks) && $cleanUrl !== rtrim($baseUrl, '/')) {
                            $internalLinks[] = $cleanUrl;
                        }
                    }
                }
            }

            // Score and sort links based on likelihood of having contact info
            $priorityLinks = [];
            $otherLinks = [];
            
            // Common contact page keywords across multiple languages
            $hotKeywords = '/(iletisim|contact|hakkimizda|about|bize-ulasin|destek|yardim|kurumsal|info|team|ekibimiz|ofis|location|kontakt|contatto|contacto|uber-uns|a-propos|impressum|o-nas|kapcsolat|epikoinonia)/i';

            foreach ($internalLinks as $link) {
                if (preg_match($hotKeywords, $link)) {
                    $priorityLinks[] = $link;
                } else {
                    $otherLinks[] = $link;
                }
            }

            // Combine arrays, putting high-priority pages first
            $urlsToScan = array_merge($priorityLinks, $otherLinks);

            // Scan Top 25 Subpages
            $scanLimit = 25;
            $scannedCount = 0;

            foreach ($urlsToScan as $url) {
                if ($scannedCount >= $scanLimit) break;
                
                // Avoid scanning massive files / extensions
                if (preg_match('/\.(pdf|zip|mp4|webm|jpg|jpeg|png|gif|svg)$/i', $url)) continue;

                addLog("Scanning subpage: $url");
                $fetchAndExtract($url);
                $scannedCount++;
                
                // Limit amount of emails found so it doesn't run forever or grab hundreds of garbage mails
                if (count($emails) >= 10) break;
            }
        }

        // Hunter.io API fallback
        $hunterApiKey = isset($_GET['hunterApiKey']) ? $_GET['hunterApiKey'] : '';
        if (count($emails) === 0 && $hunterApiKey) {
            addLog("Hunter.io API deneniyor...");
            $hunterUrl = "https://api.hunter.io/v2/domain-search?domain=" . urlencode($domain) . "&api_key=" . urlencode($hunterApiKey);

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $hunterUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            $hunterResponse = curl_exec($ch);
            curl_close($ch);

            $hunterData = json_decode($hunterResponse, true);
            if ($hunterData && isset($hunterData['data']['emails'])) {
                foreach ($hunterData['data']['emails'] as $hunterEmail) {
                    $e = strtolower(trim($hunterEmail['value'] ?? ''));
                    if ($e && $isValidEmail($e) && !in_array($e, $emails)) {
                        $emails[] = $e;
                        addLog("Hunter.io email bulundu: $e");
                    }
                    if (count($emails) >= 10) break;
                }
            }
            addLog("Hunter.io: " . count($emails) . " email");
        }

        // === WHOIS email extraction (tertiary source) ===
        if (count($emails) === 0) {
            addLog("No emails found, trying WHOIS lookup...");
            $whoisUrl = "https://www.whois.com/whois/" . urlencode($domain);

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $whoisUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept: text/html'
            ]);
            $whoisHtml = curl_exec($ch);
            $whoisHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            addLog("WHOIS HTTP: $whoisHttpCode, Length: " . strlen($whoisHtml));

            if ($whoisHtml && strlen($whoisHtml) > 200) {
                if (preg_match_all('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}/i', $whoisHtml, $whoisMatches)) {
                    foreach ($whoisMatches[0] as $we) {
                        $we = strtolower(trim($we));
                        if ($isValidEmail($we) && !in_array($we, $emails)) {
                            $emails[] = $we;
                            addLog("WHOIS found: $we");
                        }
                    }
                }
            }
        }

        // Score and sort emails - personal first, role second, generic last
        if (count($emails) > 1) {
            $scoreEmail = function($email) {
                $e = strtolower($email);
                $local = explode('@', $e)[0];

                // Generic emails (lowest priority)
                $genericPrefixes = ['info', 'contact', 'iletisim', 'destek', 'support', 'hello', 'hallo', 'merhaba', 'office', 'genel'];
                foreach ($genericPrefixes as $prefix) {
                    if ($local === $prefix) return 1;
                }

                // Role emails (medium priority)
                $rolePrefixes = ['editor', 'reklam', 'advertising', 'ilan', 'marketing', 'pazarlama', 'satis', 'sales', 'yonetim', 'management', 'muhasebe', 'finans', 'press', 'media', 'medya', 'ceo', 'founder', 'director'];
                foreach ($rolePrefixes as $prefix) {
                    if (strpos($local, $prefix) !== false) return 2;
                }

                // Personal emails with dots/underscores (highest priority)
                if (strpos($local, '.') !== false || strpos($local, '_') !== false) return 3;

                // Single name (likely personal)
                if (strlen($local) > 3 && strlen($local) < 20 && preg_match('/^[a-z]+$/', $local)) return 2;

                return 1; // Default to generic
            };

            usort($emails, function($a, $b) use ($scoreEmail) {
                return $scoreEmail($b) - $scoreEmail($a);
            });
        }

        $response = [
            'success' => true,
            'emails' => array_values($emails),
            'count' => count($emails),
            'scanned' => $scannedPages
        ];
    }

    // === EMAIL DEEP DISCOVERY ===
    elseif ($type === 'email_deep') {
        $domain = isset($_GET['domain']) ? $_GET['domain'] : (isset($_GET['url']) ? parse_url($_GET['url'], PHP_URL_HOST) : '');
        if (empty($domain))
            throw new Exception("Domain required");

        $domain = preg_replace('#^www\.#', '', strtolower($domain));
        $baseUrl = 'https://' . $domain;
        addLog("Email DEEP discovery started for: $domain");

        $emails = [];
        $scannedPages = [];

        // Known invalid prefixes and domains to skip
        $skipPrefixes = ['sentry', 'noreply', 'no-reply', 'donotreply', 'test', 'example', 'abuse', 'postmaster', 'mailer-daemon', 'mailer', 'notifications', 'feedback', 'admin', 'administrator', 'webmaster', 'support-bot', 'wix', 'wordpress', 'hello@domain.com', 'yourname@', 'email@', 'name@'];
        $skipDomains = ['example.com', 'domain.com', 'sentry.io', 'wixpress.com', 'wix.com', 'sentry.com', 'test.com'];

        // Cloudflare Email Decoder
        $decodeCF = function ($encoded) {
            if (!$encoded || strlen($encoded) < 4)
                return '';
            $k = hexdec(substr($encoded, 0, 2));
            $email = '';
            for ($i = 2, $len = strlen($encoded); $i < $len; $i += 2) {
                $email .= chr(hexdec(substr($encoded, $i, 2)) ^ $k);
            }
            return $email;
        };

        $isValidEmail = function ($email) use ($skipPrefixes, $skipDomains) {
            $e = strtolower(trim($email));
            if (!filter_var($e, FILTER_VALIDATE_EMAIL)) return false;
            if (preg_match('/\.(png|jpg|jpeg|gif|css|js|webp|svg|ico|php|html|woff|ttf|eot)$/i', $e)) return false;
            foreach ($skipDomains as $sd) {
                if (strpos($e, '@' . $sd) !== false || str_ends_with($e, '.' . $sd)) return false;
            }
            foreach ($skipPrefixes as $sp) {
                if (str_starts_with($e, $sp . '@')) return false;
                if ($e === $sp) return false;
            }
            if (strlen($e) < 6 || strlen($e) > 80) return false;
            return true;
        };

        // Helper function for fetching and extracting
        $fetchAndExtract = function ($url) use (&$emails, &$scannedPages, $decodeCF, $isValidEmail) {
            $normalizedUrl = rtrim(str_replace('http://', 'https://', $url), '/');
            if (in_array($normalizedUrl, $scannedPages))
                return '';
            $scannedPages[] = $normalizedUrl;

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
            ]);
            $html = curl_exec($ch);
            curl_close($ch);

            if ($html) {
                if (preg_match_all('/data-cfemail=["\']([0-9a-f]+)["\']/i', $html, $cfMatches)) {
                    foreach ($cfMatches[1] as $enc) {
                        $dec = $decodeCF($enc);
                        if ($dec && $isValidEmail($dec) && !in_array($dec, $emails)) {
                            $emails[] = $dec;
                        }
                    }
                }
                if (preg_match_all('/email-protection#([0-9a-f]+)/i', $html, $cfMatches2)) {
                    foreach ($cfMatches2[1] as $enc) {
                        $dec = $decodeCF($enc);
                        if ($dec && $isValidEmail($dec) && !in_array($dec, $emails)) {
                            $emails[] = $dec;
                        }
                    }
                }
                if (preg_match_all('/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10})/i', $html, $matchesMailto)) {
                    foreach ($matchesMailto[1] as $m) {
                        $m = strtolower(trim($m));
                        if ($isValidEmail($m) && !in_array($m, $emails)) {
                            $emails[] = $m;
                        }
                    }
                }
                if (preg_match_all('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}/i', $html, $matches)) {
                    foreach ($matches[0] as $e) {
                        if ($isValidEmail($e) && !in_array($e, $emails)) {
                            $emails[] = strtolower(trim($e));
                        }
                    }
                }
                if (preg_match_all('/[a-z0-9._%+-]+\s*[\[\(\{]\s*at\s*[\]\)\}]\s*[a-z0-9.-]+\.[a-z]{2,6}/i', $html, $matchesObf)) {
                    foreach ($matchesObf[0] as $obf) {
                        $e = preg_replace('/\s*[\[\(\{]\s*at\s*[\]\)\}]\s*/i', '@', strtolower($obf));
                        if ($isValidEmail($e) && !in_array($e, $emails)) {
                            $emails[] = strtolower(trim($e));
                        }
                    }
                }

                // 6. [dot] obfuscation: user[dot]name[at]domain[dot]com
                $htmlDotDecoded = preg_replace('/\s*[\[\(\{]\s*dot\s*[\]\)\}]\s*/i', '.', $html);
                if ($htmlDotDecoded !== $html) {
                    if (preg_match_all('/[a-z0-9._%+-]+\s*[\[\(\{]\s*at\s*[\]\)\}]\s*[a-z0-9.-]+\.[a-z]{2,6}/i', $htmlDotDecoded, $dotAtMatches)) {
                        foreach ($dotAtMatches[0] as $obf) {
                            $e = preg_replace('/\s*[\[\(\{]\s*at\s*[\]\)\}]\s*/i', '@', strtolower($obf));
                            if ($isValidEmail($e) && !in_array($e, $emails)) $emails[] = strtolower(trim($e));
                        }
                    }
                    if (preg_match_all('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}/i', $htmlDotDecoded, $dotEmailMatches)) {
                        foreach ($dotEmailMatches[0] as $e) {
                            if ($isValidEmail($e) && !in_array(strtolower($e), $emails)) $emails[] = strtolower(trim($e));
                        }
                    }
                }

                // 7. HTML entity encoded @ sign: user&#64;domain.com or user&#x40;domain.com
                $htmlEntityDecoded = preg_replace_callback('/&#(x[0-9a-f]+|\d+);/i', function($m) {
                    $c = $m[1];
                    return chr(strtolower($c[0]) === 'x' ? hexdec(substr($c, 1)) : (int)$c);
                }, $html);
                if ($htmlEntityDecoded !== $html && preg_match_all('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}/i', $htmlEntityDecoded, $entityMatches)) {
                    foreach ($entityMatches[0] as $e) {
                        $e = strtolower(trim($e));
                        if ($isValidEmail($e) && !in_array($e, $emails)) $emails[] = $e;
                    }
                }

                // 8. JSON-LD structured data: "email": "user@domain.com"
                if (preg_match_all('/<script[^>]+type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>/si', $html, $jsonLdBlocks)) {
                    foreach ($jsonLdBlocks[1] as $jsonBlock) {
                        if (preg_match_all('/"(?:email|contactEmail)"\s*:\s*"([^"@\s]+@[^"@\s]+)"/i', $jsonBlock, $ldEmailMatches)) {
                            foreach ($ldEmailMatches[1] as $ldEmail) {
                                $ldEmail = strtolower(trim($ldEmail));
                                if ($isValidEmail($ldEmail) && !in_array($ldEmail, $emails)) $emails[] = $ldEmail;
                            }
                        }
                    }
                }
            }
            return $html;
        };

        // 1. Scan Homepage
        $homeHtml = $fetchAndExtract($baseUrl);

        // 1b. www subdomain fallback if homepage returned nothing
        if (!$homeHtml && strpos($baseUrl, '://www.') === false) {
            $wwwUrl = 'https://www.' . $domain;
            addLog("Deep scan: trying www subdomain: $wwwUrl");
            $homeHtml = $fetchAndExtract($wwwUrl);
            if ($homeHtml) $baseUrl = $wwwUrl;
        }

        // 2. Collect internal links from homepage
        $internalLinks = [];
        if ($homeHtml) {
            if (preg_match_all('/href=["\']([^"\']+)["\']/i', $homeHtml, $allLinks)) {
                foreach ($allLinks[1] as $path) {
                    $path = trim($path);
                    if (empty($path) || strpos($path, '#') === 0 || strpos($path, 'javascript:') === 0 || strpos($path, 'mailto:') === 0 || strpos($path, 'tel:') === 0) {
                        continue;
                    }
                    $fullUrl = $path;
                    if (strpos($path, 'http') !== 0 && strpos($path, '//') !== 0) {
                        $fullUrl = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');
                    } else if (strpos($path, '//') === 0) {
                        $fullUrl = 'https:' . $path;
                    }
                    $urlHost = parse_url($fullUrl, PHP_URL_HOST);
                    if ($urlHost && strpos($urlHost, str_replace('www.', '', $domain)) !== false) {
                        $cleanUrl = rtrim(explode('?', $fullUrl)[0], '/');
                        if (!in_array($cleanUrl, $internalLinks) && $cleanUrl !== rtrim($baseUrl, '/')) {
                            $internalLinks[] = $cleanUrl;
                        }
                    }
                }
            }
        }

        // 3. Also check robots.txt and sitemap.xml for additional URLs
        addLog("Deep scan: checking robots.txt and sitemap.xml for extra URLs...");

        // Parse robots.txt for sitemap references
        $robotsUrl = rtrim($baseUrl, '/') . '/robots.txt';
        $chRobots = curl_init();
        curl_setopt($chRobots, CURLOPT_URL, $robotsUrl);
        curl_setopt($chRobots, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($chRobots, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($chRobots, CURLOPT_TIMEOUT, 10);
        curl_setopt($chRobots, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($chRobots, CURLOPT_HTTPHEADER, ['User-Agent: Mozilla/5.0']);
        $robotsTxt = curl_exec($chRobots);
        curl_close($chRobots);

        $sitemapUrls = [rtrim($baseUrl, '/') . '/sitemap.xml'];
        if ($robotsTxt) {
            if (preg_match_all('/Sitemap:\s*(.+)/i', $robotsTxt, $smMatches)) {
                foreach ($smMatches[1] as $smUrl) {
                    $smUrl = trim($smUrl);
                    if (!empty($smUrl) && !in_array($smUrl, $sitemapUrls)) {
                        $sitemapUrls[] = $smUrl;
                    }
                }
            }
            addLog("Found " . count($sitemapUrls) . " sitemap URL(s) from robots.txt");
        }

        // Parse sitemaps for page URLs (contact/about pages etc.)
        $hotKeywordsDeep = '/(iletisim|contact|hakkimizda|about|bize-ulasin|destek|yardim|kurumsal|info|team|ekibimiz|ofis|location|kontakt|contatto|contacto|uber-uns|a-propos|impressum|o-nas|kapcsolat|epikoinonia)/i';
        $sitemapPages = [];

        foreach ($sitemapUrls as $smUrl) {
            $chSm = curl_init();
            curl_setopt($chSm, CURLOPT_URL, $smUrl);
            curl_setopt($chSm, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($chSm, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($chSm, CURLOPT_TIMEOUT, 10);
            curl_setopt($chSm, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($chSm, CURLOPT_HTTPHEADER, ['User-Agent: Mozilla/5.0']);
            $smContent = curl_exec($chSm);
            curl_close($chSm);

            if ($smContent) {
                // Extract URLs from sitemap XML
                if (preg_match_all('/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/i', $smContent, $locMatches)) {
                    foreach ($locMatches[1] as $locUrl) {
                        $locUrl = trim($locUrl);
                        $locHost = parse_url($locUrl, PHP_URL_HOST);
                        if ($locHost && strpos($locHost, str_replace('www.', '', $domain)) !== false) {
                            // Prioritize contact-like pages from sitemap
                            if (preg_match($hotKeywordsDeep, $locUrl)) {
                                $cleanLoc = rtrim(explode('?', $locUrl)[0], '/');
                                if (!in_array($cleanLoc, $sitemapPages) && !in_array($cleanLoc, $internalLinks)) {
                                    $sitemapPages[] = $cleanLoc;
                                }
                            }
                        }
                    }
                    addLog("Sitemap $smUrl: found " . count($locMatches[1]) . " URLs, " . count($sitemapPages) . " contact-like pages");
                }
            }
        }

        // 4. Score and sort all collected links
        $priorityLinks = [];
        $otherLinks = [];

        foreach ($internalLinks as $link) {
            if (preg_match($hotKeywordsDeep, $link)) {
                $priorityLinks[] = $link;
            } else {
                $otherLinks[] = $link;
            }
        }

        // Sitemap contact pages go right after homepage-discovered priority links
        $urlsToScan = array_merge($priorityLinks, $sitemapPages, $otherLinks);
        // Deduplicate
        $urlsToScan = array_values(array_unique($urlsToScan));

        // Guess common contact page paths not found via crawling (prepend to front)
        $contactGuesses = ['/iletisim', '/contact', '/contact-us', '/hakkimizda', '/about', '/about-us', '/bize-ulasin', '/impressum', '/kontakt', '/contacto', '/ueber-uns', '/ekip', '/team'];
        $guessedUrls = [];
        foreach ($contactGuesses as $path) {
            $guessUrl = rtrim($baseUrl, '/') . $path;
            if (!in_array($guessUrl, $urlsToScan) && !in_array($guessUrl, $scannedPages)) {
                $guessedUrls[] = $guessUrl;
            }
        }
        if (!empty($guessedUrls)) {
            $urlsToScan = array_merge($guessedUrls, $urlsToScan);
            addLog("Deep scan: added " . count($guessedUrls) . " guessed contact page paths");
        }

        // Deep scan: up to 50 subpages
        $scanLimit = 50;
        $scannedCount = 0;

        addLog("Deep scan: " . count($urlsToScan) . " candidate URLs, limit=$scanLimit");

        foreach ($urlsToScan as $url) {
            if ($scannedCount >= $scanLimit) break;
            if (preg_match('/\.(pdf|zip|mp4|webm|jpg|jpeg|png|gif|svg)$/i', $url)) continue;

            addLog("Deep scanning: $url");
            $fetchAndExtract($url);
            $scannedCount++;

            if (count($emails) >= 20) break;
        }

        // 4. Hunter.io fallback
        $hunterApiKey = isset($_GET['hunterApiKey']) ? $_GET['hunterApiKey'] : '';
        if (count($emails) === 0 && $hunterApiKey) {
            addLog("Hunter.io API deneniyor (deep)...");
            $hunterUrl = "https://api.hunter.io/v2/domain-search?domain=" . urlencode($domain) . "&api_key=" . urlencode($hunterApiKey);
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $hunterUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            $hunterResponse = curl_exec($ch);
            curl_close($ch);
            $hunterData = json_decode($hunterResponse, true);
            if ($hunterData && isset($hunterData['data']['emails'])) {
                foreach ($hunterData['data']['emails'] as $he) {
                    $e = strtolower(trim($he['value'] ?? ''));
                    if ($e && $isValidEmail($e) && !in_array($e, $emails)) {
                        $emails[] = $e;
                        addLog("Hunter.io: $e");
                    }
                    if (count($emails) >= 15) break;
                }
            }
        }

        // === WHOIS email extraction (tertiary source) ===
        if (count($emails) === 0) {
            addLog("No emails found, trying WHOIS lookup...");
            $whoisUrl = "https://www.whois.com/whois/" . urlencode($domain);

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $whoisUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept: text/html'
            ]);
            $whoisHtml = curl_exec($ch);
            curl_close($ch);

            if ($whoisHtml && strlen($whoisHtml) > 200) {
                if (preg_match_all('/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,10}/i', $whoisHtml, $whoisMatches)) {
                    foreach ($whoisMatches[0] as $we) {
                        $we = strtolower(trim($we));
                        if ($isValidEmail($we) && !in_array($we, $emails)) {
                            $emails[] = $we;
                            addLog("WHOIS found: $we");
                        }
                    }
                }
            }
        }

        // Score and sort
        if (count($emails) > 1) {
            $scoreEmail = function($email) {
                $e = strtolower($email);
                $local = explode('@', $e)[0];
                $genericPrefixes = ['info', 'contact', 'iletisim', 'destek', 'support', 'hello', 'office', 'genel'];
                foreach ($genericPrefixes as $prefix) { if ($local === $prefix) return 1; }
                $rolePrefixes = ['editor', 'reklam', 'advertising', 'marketing', 'satis', 'sales', 'yonetim', 'ceo', 'founder'];
                foreach ($rolePrefixes as $prefix) { if (strpos($local, $prefix) !== false) return 2; }
                if (strpos($local, '.') !== false || strpos($local, '_') !== false) return 3;
                if (strlen($local) > 3 && strlen($local) < 20 && preg_match('/^[a-z]+$/', $local)) return 2;
                return 1;
            };
            usort($emails, function($a, $b) use ($scoreEmail) { return $scoreEmail($b) - $scoreEmail($a); });
        }

        $response = [
            'success' => true,
            'emails' => array_values($emails),
            'count' => count($emails),
            'scanned' => count($scannedPages),
            'mode' => 'deep'
        ];
    }

    // === TRAFFIC CHECK ===
    else {
        $domain = isset($_GET['domain']) ? $_GET['domain'] : (isset($_GET['url']) ? parse_url($_GET['url'], PHP_URL_HOST) : '');

        if (empty($domain))
            throw new Exception("Domain required");

        $domain = preg_replace('#^https?://#', '', $domain);
        $domain = preg_replace('#^www\.#', '', $domain);
        $domain = explode('/', $domain)[0];

        addLog("Traffic check: $domain");

        // Try SimilarSites
        $value = 0;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://www.similarsites.com/site/" . urlencode($domain));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['User-Agent: Mozilla/5.0']);

        $html = curl_exec($ch);
        curl_close($ch);

        if ($html && preg_match('/"MonthlyVisits"\s*:\s*(\d+)/i', $html, $m)) {
            $value = (int) $m[1];
            addLog("SimilarSites: $value");
        }

        // Try Hypestat if no result
        if ($value == 0) {
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, "https://hypestat.com/info/" . urlencode($domain));
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

            $html = curl_exec($ch);
            curl_close($ch);

            if ($html) {
                if (preg_match('/Monthly Visits<span>([^<]+)<\/span>/i', $html, $m)) {
                    $raw = strip_tags($m[1]);
                    $value = (int) str_replace(['K', 'M', 'k', 'm'], ['', '', '', ''], $raw) * (strpos($raw, 'M') !== false ? 1000000 : (strpos($raw, 'K') !== false ? 1000 : 1));
                    addLog("Hypestat: $value");
                }
            }
        }

        if ($value > 0) {
            $label = $value >= 1000000 ? number_format($value / 1000000, 1) . 'M' : ($value >= 1000 ? number_format($value / 1000, 1) . 'K' : $value);
            $response = ['success' => true, 'viable' => true, 'value' => $value, 'label' => $label];
        } else {
            $response = ['success' => false, 'error' => 'No data'];
        }
    }

    $response['debug'] = $debugLog;

} catch (Exception $e) {
    $response = ['success' => false, 'error' => $e->getMessage(), 'debug' => $debugLog];
}

echo json_encode($response, JSON_UNESCAPED_UNICODE);
?>