<?php
header('Content-Type: text/plain; charset=utf-8');

$serviceAccountFile = __DIR__ . '/../lead-hunter-1500-firebase-admin-service-account.json';
$sa = json_decode(file_get_contents($serviceAccountFile), true);

function b64u($d) { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }

function requestToken($sa, $payload) {
    $header = b64u(json_encode(['typ' => 'JWT', 'alg' => 'RS256']));
    $body = b64u(json_encode($payload));
    $sig = '';
    openssl_sign($header . '.' . $body, $sig, $sa['private_key'], OPENSSL_ALGO_SHA256);
    $jwt = $header . '.' . $body . '.' . b64u($sig);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $sa['token_uri']);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $jwt
    ]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$code, $err, $resp];
}

$now = time();
$base = [
    'iss' => $sa['client_email'],
    'aud' => $sa['token_uri'],
    'iat' => $now,
    'exp' => $now + 3600,
];

$cases = [
    'A_firestor_datastore_with_sub' => $base + [
        'sub' => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firestore https://www.googleapis.com/auth/datastore'
    ],
    'B_cloudplatform_no_sub' => $base + [
        'scope' => 'https://www.googleapis.com/auth/cloud-platform'
    ],
    'C_datastore_no_sub' => $base + [
        'scope' => 'https://www.googleapis.com/auth/datastore'
    ],
    'D_firestore_no_sub' => $base + [
        'scope' => 'https://www.googleapis.com/auth/firestore'
    ],
];

foreach ($cases as $name => $payload) {
    [$code, $err, $resp] = requestToken($sa, $payload);
    echo "=== $name ===\n";
    echo "HTTP: $code\n";
    echo "cURL: " . ($err ?: '-') . "\n";
    echo "RESP: " . substr(trim($resp), 0, 600) . "\n\n";
}
