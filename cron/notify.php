<?php
/**
 * Lead Hunter - Haftalık Bildirim ve Webhook Cron
 * cPanel: 0 9 * * 1 /usr/bin/php /home/[user]/public_html/cron/notify.php
 * Manuel: ?manual=1 | Anlık: ?event=reply&detail=domain.com
 */
define('SERVICE_ACCOUNT_FILE', __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json');
define('SECRET_KEY', 'LEADHUNTER_NOTIFY_2026');
define('LOG_FILE', __DIR__ . '/../logs/notify.log');
header('Content-Type: text/plain; charset=utf-8');

function writeLog($m, $t = 'INFO') { @file_put_contents(LOG_FILE, "[".date('Y-m-d H:i:s')."] [$t] $m\n", FILE_APPEND); echo "[$t] $m\n"; }
function base64url_encode($d) { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }

function getFirebaseAccessToken($f) {
    if (!file_exists($f)) return null;
    $sa = json_decode(file_get_contents($f), true);
    $h = base64url_encode(json_encode(['typ'=>'JWT','alg'=>'RS256']));
    $now = time();
    $p = base64url_encode(json_encode(['iss'=>$sa['client_email'],'sub'=>$sa['client_email'],'aud'=>'https://oauth2.googleapis.com/token','iat'=>$now,'exp'=>$now+3600,'scope'=>'https://www.googleapis.com/auth/firestore https://www.googleapis.com/auth/datastore']));
    $sig=''; openssl_sign("$h.$p",$sig,$sa['private_key'],OPENSSL_ALGO_SHA256);
    $sig = base64url_encode($sig);
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>"$h.$p.$sig"]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $r = curl_exec($ch); curl_close($ch);
    return json_decode($r, true)['access_token'] ?? null;
}

function sendWebhook($url, $msg) {
    if (empty($url)) return false;
    $isDiscord = strpos($url, 'discord') !== false;
    $payload = $isDiscord ? json_encode(['content'=>$msg]) : json_encode(['text'=>$msg]);
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return $code >= 200 && $code < 300;
}

$isManual = isset($_GET['manual']);
$secret = $_GET['secret'] ?? '';
$event = $_GET['event'] ?? '';

if ($secret !== SECRET_KEY && !$isManual && empty($event)) { http_response_code(403); exit("Unauthorized\n"); }

try {
    $sa = json_decode(file_get_contents(SERVICE_ACCOUNT_FILE), true);
    $projectId = $sa['project_id'];
    $token = getFirebaseAccessToken(SERVICE_ACCOUNT_FILE);
    if (!$token) { writeLog("Token alınamadı","ERROR"); exit; }

    $ch = curl_init("https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/system/config");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $token"]);
    $r = curl_exec($ch); curl_close($ch);
    $sf = json_decode($r, true)['fields'] ?? [];
    $webhookUrl = $sf['webhookUrl']['stringValue'] ?? '';

    if (empty($webhookUrl)) { writeLog("Webhook URL yok","WARN"); echo "SKIP\n"; exit; }

    // INSTANT EVENT
    if ($event) {
        $detail = $_GET['detail'] ?? '';
        $msgs = ['reply'=>"📩 *Yeni Cevap!* $detail",'bounce'=>"⚠️ *Mail Hatası* $detail",'deal_on'=>"🎉 *Deal Kapandı!* $detail",'deal_off'=>"❌ *Deal Kaybedildi* $detail"];
        $msg = $msgs[$event] ?? "📢 $event: $detail";
        sendWebhook($webhookUrl, $msg) ? writeLog("Bildirim gönderildi: $event","SUCCESS") : writeLog("Webhook hatası","ERROR");
        exit;
    }

    // WEEKLY SUMMARY
    writeLog("Haftalık özet hazırlanıyor");
    $ch = curl_init("https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/leads?pageSize=1000");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $token"]);
    $r = curl_exec($ch); curl_close($ch);
    $docs = json_decode($r, true)['documents'] ?? [];

    $total = count($docs); $weekAgo = date('c', strtotime('-7 days'));
    $new=0; $sent=0; $replies=0; $deals=0; $sc=[];
    foreach ($docs as $d) {
        $f = $d['fields'] ?? [];
        $s = $f['statusKey']['stringValue'] ?? 'NEW';
        $sc[$s] = ($sc[$s] ?? 0) + 1;
        $ad = $f['addedDate']['stringValue'] ?? '';
        $lc = $f['lastContactDate']['stringValue'] ?? '';
        if ($ad && $ad > $weekAgo) $new++;
        if ($lc && $lc > $weekAgo) $sent++;
        if ($s === 'DEAL_ON' && $lc && $lc > $weekAgo) $deals++;
        if (in_array($s, ['INTERESTED','ASKED_MORE']) && $lc && $lc > $weekAgo) $replies++;
    }

    $summary = "📊 *Lead Hunter - Haftalık Özet*\n━━━━━━━━━━━━━━━━━━\n";
    $summary .= "📈 Toplam: $total | 🆕 Yeni: $new | 📧 İletişim: $sent | 💬 Cevap: $replies | 🤝 Deal: $deals\n━━━━━━━━━━━━━━━━━━\n";
    $labels = ['NEW'=>'Yeni','READY_TO_SEND'=>'Hazır','NO_REPLY'=>'Cevap Yok','INTERESTED'=>'İlgili','ASKED_MORE'=>'Bilgi İstedi','IN_PROCESS'=>'Süreçte','DEAL_ON'=>'✅ Deal','DEAL_OFF'=>'❌ Off','DENIED'=>'Red','MAIL_ERROR'=>'Hata','NOT_VIABLE'=>'Uygun Değil','NEEDS_REVIEW'=>'İnceleme'];
    foreach ($sc as $k=>$v) { $l = $labels[$k] ?? $k; $summary .= "• $l: $v\n"; }

    sendWebhook($webhookUrl, $summary) ? writeLog("Özet gönderildi","SUCCESS") : writeLog("Webhook hatası","ERROR");
    echo "SUCCESS\n";
} catch (Exception $e) { writeLog("HATA: ".$e->getMessage(),"ERROR"); }
