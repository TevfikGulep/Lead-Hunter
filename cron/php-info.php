<?php
header('Content-Type: text/plain; charset=utf-8');

echo "php_sapi_name: " . php_sapi_name() . PHP_EOL;
echo "PHP_BINARY: " . (defined('PHP_BINARY') ? PHP_BINARY : 'N/A') . PHP_EOL;
echo "PHP_VERSION: " . PHP_VERSION . PHP_EOL;
echo "Loaded php.ini: " . (php_ini_loaded_file() ?: 'N/A') . PHP_EOL;
echo "curl extension: " . (extension_loaded('curl') ? 'loaded' : 'missing') . PHP_EOL;
echo "openssl extension: " . (extension_loaded('openssl') ? 'loaded' : 'missing') . PHP_EOL;
echo "cwd: " . getcwd() . PHP_EOL;
echo "__FILE__: " . __FILE__ . PHP_EOL;
