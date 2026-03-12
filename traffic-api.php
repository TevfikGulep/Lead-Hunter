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

        // Fallback to scraping if no API results
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
            $hotKeywords = '/(iletisim|contact|hakkimizda|about|bize-ulasin|destek|yardim|kurumsal|info|team|ekibimiz|ofis|location)/i';

            foreach ($internalLinks as $link) {
                if (preg_match($hotKeywords, $link)) {
                    $priorityLinks[] = $link;
                } else {
                    $otherLinks[] = $link;
                }
            }

            // Combine arrays, putting high-priority pages first
            $urlsToScan = array_merge($priorityLinks, $otherLinks);

            // Scan Top 15 Subpages
            $scanLimit = 15;
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

        $response = [
            'success' => true,
            'emails' => array_values($emails),
            'count' => count($emails),
            'scanned' => $scannedPages
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