<?php
/**
 * Lead Hunter - Lead Score Güncelleme Cron
 * Haftalık Pazar 02:00 - tüm leadlerin skorlarını hesaplar
 * cPanel: 0 2 * * 0 /usr/bin/php /home/[user]/public_html/cron/score-update.php
 * Manuel: ?manual=1
 */
define('SERVICE_ACCOUNT_FILE', __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json');
define('LOG_FILE', __DIR__ . '/../logs/score-update.log');
header('Content-Type: text/plain; charset=utf-8');

function writeLog($m,$t='INFO'){@file_put_contents(LOG_FILE,"[".date('Y-m-d H:i:s')."] [$t] $m\n",FILE_APPEND);echo "[$t] $m\n";}
function base64url_encode($d){return rtrim(strtr(base64_encode($d),'+/','-_'),'=');}

function getFirebaseAccessToken($f){
    if(!file_exists($f))return null;
    $sa=json_decode(file_get_contents($f),true);
    $h=base64url_encode(json_encode(['typ'=>'JWT','alg'=>'RS256']));
    $now=time();
    $p=base64url_encode(json_encode(['iss'=>$sa['client_email'],'sub'=>$sa['client_email'],'aud'=>'https://oauth2.googleapis.com/token','iat'=>$now,'exp'=>$now+3600,'scope'=>'https://www.googleapis.com/auth/firestore https://www.googleapis.com/auth/datastore']));
    $sig='';openssl_sign("$h.$p",$sig,$sa['private_key'],OPENSSL_ALGO_SHA256);
    $sig=base64url_encode($sig);
    $ch=curl_init('https://oauth2.googleapis.com/token');
    curl_setopt($ch,CURLOPT_POST,true);
    curl_setopt($ch,CURLOPT_POSTFIELDS,http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>"$h.$p.$sig"]));
    curl_setopt($ch,CURLOPT_RETURNTRANSFER,true);
    $r=curl_exec($ch);curl_close($ch);
    return json_decode($r,true)['access_token']??null;
}

function calculateScore($fields) {
    $score = 0;

    // Traffic (0-40)
    $trafficFields = $fields['trafficStatus']['mapValue']['fields'] ?? [];
    $trafficValue = 0;
    if (isset($trafficFields['value'])) {
        $trafficValue = (float)($trafficFields['value']['doubleValue'] ?? $trafficFields['value']['integerValue'] ?? $trafficFields['value']['stringValue'] ?? 0);
    }
    if ($trafficValue >= 500000) $score += 40;
    elseif ($trafficValue >= 100000) $score += 30;
    elseif ($trafficValue >= 50000) $score += 20;
    elseif ($trafficValue >= 20000) $score += 10;

    // Email quality (0-20)
    $email = strtolower($fields['email']['stringValue'] ?? '');
    if ($email) {
        $local = explode('@', $email)[0];
        $generic = ['info','contact','iletisim','destek','support','hello','office','genel'];
        $role = ['editor','reklam','advertising','marketing','satis','sales','yonetim','ceo','founder'];
        if (strpos($local, '.') !== false || strpos($local, '_') !== false) $score += 20;
        else {
            $isRole = false; $isGeneric = false;
            foreach ($role as $r) { if (strpos($local, $r) !== false) { $isRole = true; break; } }
            foreach ($generic as $g) { if ($local === $g) { $isGeneric = true; break; } }
            if ($isRole) $score += 15;
            elseif ($isGeneric) $score += 10;
            else $score += 12;
        }
    }

    // Engagement (0-20)
    $status = $fields['statusKey']['stringValue'] ?? 'NEW';
    if (in_array($status, ['INTERESTED','ASKED_MORE','IN_PROCESS','DEAL_ON'])) $score += 20;
    elseif (isset($fields['mailOpenedAt'])) $score += 10;
    elseif (isset($fields['stage']) && (int)($fields['stage']['integerValue'] ?? 0) > 0) $score += 5;
    if ($status === 'MAIL_ERROR') $score -= 20;

    // Freshness (0-20)
    $lastContact = $fields['lastContactDate']['stringValue'] ?? ($fields['addedDate']['stringValue'] ?? '');
    if ($lastContact) {
        $days = (time() - strtotime($lastContact)) / 86400;
        if ($days <= 7) $score += 20;
        elseif ($days <= 14) $score += 15;
        elseif ($days <= 30) $score += 10;
        elseif ($days <= 60) $score += 5;
    }

    return max(0, min(100, $score));
}

$isManual = isset($_GET['manual']);
if (!$isManual) {
    $now = new DateTime('now', new DateTimeZone('Europe/Istanbul'));
    if ((int)$now->format('N') !== 7 || (int)$now->format('H') < 1 || (int)$now->format('H') > 3) {
        echo "SKIP\n"; exit;
    }
}

try {
    writeLog("Score güncelleme başladı");
    $sa = json_decode(file_get_contents(SERVICE_ACCOUNT_FILE), true);
    $pid = $sa['project_id'];
    $token = getFirebaseAccessToken(SERVICE_ACCOUNT_FILE);
    if (!$token) { writeLog("Token hatası","ERROR"); exit; }

    // Get all leads
    $url = "https://firestore.googleapis.com/v1/projects/$pid/databases/(default)/documents/leads?pageSize=500";
    $leads = []; $nextPage = null;
    do {
        $fetchUrl = $nextPage ? "$url&pageToken=".urlencode($nextPage) : $url;
        $ch = curl_init($fetchUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $token"]);
        $r = curl_exec($ch); curl_close($ch);
        $data = json_decode($r, true);
        if (isset($data['documents'])) $leads = array_merge($leads, $data['documents']);
        $nextPage = $data['nextPageToken'] ?? null;
    } while ($nextPage);

    writeLog("Toplam lead: " . count($leads));
    $updated = 0;

    foreach ($leads as $doc) {
        $docName = $doc['name'] ?? '';
        $docId = basename($docName);
        $fields = $doc['fields'] ?? [];

        $newScore = calculateScore($fields);
        $oldScore = (int)($fields['leadScore']['integerValue'] ?? 0);

        if ($newScore !== $oldScore) {
            $patchUrl = "https://firestore.googleapis.com/v1/projects/$pid/databases/(default)/documents/leads/$docId?updateMask.fieldPaths=leadScore";
            $body = json_encode(['fields' => ['leadScore' => ['integerValue' => (string)$newScore]]]);
            $ch = curl_init($patchUrl);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $token","Content-Type: application/json"]);
            curl_exec($ch); curl_close($ch);
            $updated++;
        }
    }

    writeLog("Tamamlandı. $updated lead güncellendi","SUCCESS");
    echo "SUCCESS: $updated lead skoru güncellendi\n";
} catch (Exception $e) { writeLog("HATA: ".$e->getMessage(),"ERROR"); }
