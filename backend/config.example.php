<?php
// Kopieren als config.php und Werte eintragen — niemals committen
return [
    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'name'    => 'buedchen',
        'user'    => 'buedchen',
        'pass'    => 'DEIN_PASSWORT',
        'charset' => 'utf8mb4',
    ],
    'review_queue' => [
        'user' => 'dominik',
        'pass' => 'SICHERES_PASSWORT_EINTRAGEN',
    ],
    'ors_api_key' => '',  // OpenRouteService API-Key (openrouteservice.org)
];
