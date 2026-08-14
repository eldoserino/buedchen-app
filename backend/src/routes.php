<?php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

require_once __DIR__ . '/RouteGenerator.php';

// ORS-API-Key aus config.php (via include-Scope aus index.php)
$orsApiKey = $config['ors_api_key'] ?? '';

// ──────────────────────────────────────────────────────────────────
// GET /api/buedchen
// ──────────────────────────────────────────────────────────────────
$app->get('/api/buedchen', function (Request $request, Response $response) {
    $db     = $this->get('db');
    $params = $request->getQueryParams();

    $where  = ['1=1'];
    $bind   = [];

    // Freitext-Suche (Name + Veedel)
    if (!empty($params['q'])) {
        $where[] = '(name LIKE :q OR veedel LIKE :q)';
        $bind[':q'] = '%' . $params['q'] . '%';
    }

    // Veedel-Filter (multi: ?veedel[]=Nippes&veedel[]=Sülz)
    if (!empty($params['veedel'])) {
        $veedel = (array) $params['veedel'];
        $placeholders = implode(',', array_map(fn($i) => ":v$i", array_keys($veedel)));
        $where[] = "veedel IN ($placeholders)";
        foreach ($veedel as $i => $v) {
            $bind[":v$i"] = $v;
        }
    }

    if (!empty($params['seating'])) {
        $where[] = 'feature_seating = 1';
    }

    if (!empty($params['coffee'])) {
        $where[] = 'feature_coffee = 1';
    }

    $sql = 'SELECT id, name, address, veedel, postcode, lat, lng,
                   google_rating, google_review_count,
                   feature_seating, feature_coffee,
                   tags, editorial_badges, opening_hours
            FROM buedchen
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY JSON_LENGTH(editorial_badges) > 0 DESC, google_rating DESC
            LIMIT 1000';

    $stmt = $db->prepare($sql);
    $stmt->execute($bind);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        $row['tags']            = $row['tags']            ? json_decode($row['tags'])            : [];
        $row['editorial_badges'] = $row['editorial_badges'] ? json_decode($row['editorial_badges']) : [];
        $row['opening_hours']   = $row['opening_hours']   ? json_decode($row['opening_hours'])   : null;
        $row['lat']             = (float) $row['lat'];
        $row['lng']             = (float) $row['lng'];
        $row['google_rating']   = $row['google_rating'] !== null ? (float) $row['google_rating'] : null;
        $row['google_review_count'] = $row['google_review_count'] !== null ? (int) $row['google_review_count'] : null;
        $row['feature_seating'] = (bool) $row['feature_seating'];
        $row['feature_coffee']  = (bool) $row['feature_coffee'];
    }

    return jsonResponse($response, $rows);
});

// ──────────────────────────────────────────────────────────────────
// GET /api/buedchen/:id
// ──────────────────────────────────────────────────────────────────
$app->get('/api/buedchen/{id}', function (Request $request, Response $response, array $args) {
    $db   = $this->get('db');
    $stmt = $db->prepare('SELECT * FROM buedchen WHERE id = :id');
    $stmt->execute([':id' => $args['id']]);
    $row  = $stmt->fetch();

    if (!$row) {
        return jsonResponse($response, ['error' => 'not found'], 404);
    }

    $row['tags']               = $row['tags']               ? json_decode($row['tags'])               : [];
    $row['editorial_badges']   = $row['editorial_badges']   ? json_decode($row['editorial_badges'])   : [];
    $row['opening_hours']      = $row['opening_hours']      ? json_decode($row['opening_hours'])      : null;
    $row['character_tags']     = $row['character_tags']     ? json_decode($row['character_tags'])     : [];
    $row['poi_distances']      = $row['poi_distances']      ? json_decode($row['poi_distances'], true): null;
    $row['editorial_sources']  = $row['editorial_sources']  ? json_decode($row['editorial_sources'])  : [];
    $row['lat']                = (float) $row['lat'];
    $row['lng']                = (float) $row['lng'];
    $row['google_rating']      = $row['google_rating']      !== null ? (float) $row['google_rating']      : null;
    $row['google_review_count']= $row['google_review_count']!== null ? (int)   $row['google_review_count'] : null;
    $row['ai_confidence']      = $row['ai_confidence']      !== null ? (float) $row['ai_confidence']      : null;
    $row['feature_seating']    = (bool) $row['feature_seating'];
    $row['feature_coffee']     = (bool) $row['feature_coffee'];

    return jsonResponse($response, $row);
});

// ──────────────────────────────────────────────────────────────────
// GET /api/tours
// ──────────────────────────────────────────────────────────────────
$app->get('/api/tours', function (Request $request, Response $response) {
    $db   = $this->get('db');
    $stmt = $db->query('SELECT id, slug, title, description, estimated_time, sort_order
                        FROM tours ORDER BY sort_order ASC');
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        // Stopp-Anzahl berechnen
        $cnt = $db->prepare('SELECT COUNT(*) FROM tour_buedchen WHERE tour_id = :id');
        $cnt->execute([':id' => $row['id']]);
        $row['stop_count'] = (int) $cnt->fetchColumn();
    }

    return jsonResponse($response, $rows);
});

// ──────────────────────────────────────────────────────────────────
// GET /api/tours/:slug
// ──────────────────────────────────────────────────────────────────
$app->get('/api/tours/{slug}', function (Request $request, Response $response, array $args) {
    $db   = $this->get('db');
    $stmt = $db->prepare('SELECT * FROM tours WHERE slug = :slug');
    $stmt->execute([':slug' => $args['slug']]);
    $tour = $stmt->fetch();

    if (!$tour) {
        return jsonResponse($response, ['error' => 'not found'], 404);
    }

    $stops = $db->prepare('
        SELECT b.id, b.name, b.veedel, b.lat, b.lng, b.address,
               b.google_rating, b.feature_seating, b.feature_coffee,
               tb.sort_order
        FROM buedchen b
        JOIN tour_buedchen tb ON tb.buedchen_id = b.id
        WHERE tb.tour_id = :tour_id
        ORDER BY tb.sort_order ASC
    ');
    $stops->execute([':tour_id' => $tour['id']]);
    $buedchen = $stops->fetchAll();

    foreach ($buedchen as &$b) {
        $b['lat'] = (float) $b['lat'];
        $b['lng'] = (float) $b['lng'];
        $b['google_rating'] = $b['google_rating'] !== null ? (float) $b['google_rating'] : null;
        $b['feature_seating'] = (bool) $b['feature_seating'];
        $b['feature_coffee']  = (bool) $b['feature_coffee'];
    }

    $tour['buedchen'] = $buedchen;

    return jsonResponse($response, $tour);
});

// ──────────────────────────────────────────────────────────────────
// GET /api/pois
// ──────────────────────────────────────────────────────────────────
$app->get('/api/pois', function (Request $request, Response $response) {
    $db     = $this->get('db');
    $params = $request->getQueryParams();

    $where  = ['is_active = 1'];
    $bind   = [];

    if (!empty($params['category'])) {
        $cats = array_filter(array_map('trim', explode(',', $params['category'])));
        if ($cats) {
            $placeholders = implode(',', array_map(fn($i) => ":cat$i", array_keys($cats)));
            $where[] = "category IN ($placeholders)";
            foreach ($cats as $i => $c) {
                $bind[":cat$i"] = $c;
            }
        }
    }

    $sql = 'SELECT id, name, description, category, lat, lng,
                   address, veedel, photo_path, osm_id, tags
            FROM tour_pois
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY name ASC';

    $stmt = $db->prepare($sql);
    $stmt->execute($bind);
    $rows = $stmt->fetchAll();

    $lat = isset($params['lat']) ? (float) $params['lat'] : null;
    $lng = isset($params['lng']) ? (float) $params['lng'] : null;
    $radius = isset($params['radius']) ? (int) $params['radius'] : null;

    foreach ($rows as &$row) {
        $row['lat']  = (float) $row['lat'];
        $row['lng']  = (float) $row['lng'];
        $row['tags'] = $row['tags'] ? json_decode($row['tags']) : (object)[];

        if ($lat !== null && $lng !== null) {
            $dlat = deg2rad($row['lat'] - $lat);
            $dlng = deg2rad($row['lng'] - $lng);
            $a = sin($dlat / 2) ** 2
               + cos(deg2rad($lat)) * cos(deg2rad($row['lat'])) * sin($dlng / 2) ** 2;
            $row['distance_m'] = (int) round(6371000 * 2 * atan2(sqrt($a), sqrt(1 - $a)));
        }
    }

    if ($lat !== null && $lng !== null) {
        usort($rows, fn($a, $b) => $a['distance_m'] <=> $b['distance_m']);
        if ($radius !== null) {
            $rows = array_values(array_filter($rows, fn($r) => $r['distance_m'] <= $radius));
        }
    }

    return jsonResponse($response, $rows);
});

// ──────────────────────────────────────────────────────────────────
// GET /api/review-queue  (geschützt via Cloudflare Zero Trust)
// ──────────────────────────────────────────────────────────────────
$app->get('/api/review-queue', function (Request $request, Response $response) {
    $db   = $this->get('db');
    // Nur neuester Eintrag pro Büdchen (Duplikate aus mehreren Enrichment-Runs)
    $stmt = $db->query(
        'SELECT q.*, b.name AS buedchen_name, b.veedel, b.address
         FROM enrichment_queue q
         JOIN buedchen b ON b.id = q.buedchen_id
         WHERE q.resolved = 0
           AND q.id = (
             SELECT MAX(q2.id) FROM enrichment_queue q2
             WHERE q2.buedchen_id = q.buedchen_id AND q2.resolved = 0
           )
         ORDER BY q.created_at DESC
         LIMIT 200'
    );
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        $row['ai_output'] = $row['ai_output'] ? json_decode($row['ai_output'], true) : null;
        $row['resolved']  = (bool) $row['resolved'];
    }

    return jsonResponse($response, $rows);
});

// ──────────────────────────────────────────────────────────────────
// POST /api/review-queue/:id/resolve  (geschützt via Cloudflare Zero Trust)
// ──────────────────────────────────────────────────────────────────
$app->post('/api/review-queue/{id}/resolve', function (Request $request, Response $response, array $args) {
    $db   = $this->get('db');
    $id   = (int) $args['id'];
    $body = json_decode((string) $request->getBody(), true) ?? [];

    $stmt = $db->prepare('SELECT * FROM enrichment_queue WHERE id = ?');
    $stmt->execute([$id]);
    $entry = $stmt->fetch();

    if (!$entry) {
        return jsonResponse($response, ['error' => 'not found'], 404);
    }

    $accepted  = !empty($body['accepted']);
    $overrides = $body['overrides'] ?? [];

    if ($accepted) {
        $aiOutput = $entry['ai_output'] ? json_decode($entry['ai_output'], true) : [];
        $tags     = isset($overrides['tags'])    ? $overrides['tags']    : ($aiOutput['tags']    ?? null);
        $summary  = isset($overrides['summary']) ? $overrides['summary'] : ($aiOutput['summary'] ?? null);

        $sets = ['enriched_at = NOW()'];
        $vals = [];

        if ($tags !== null)    { $sets[] = 'character_tags = ?'; $vals[] = json_encode($tags); }
        if ($summary !== null) { $sets[] = 'ai_summary = ?';     $vals[] = substr((string)$summary, 0, 200); }

        $vals[] = $entry['buedchen_id'];
        $db->prepare('UPDATE buedchen SET ' . implode(', ', $sets) . ' WHERE id = ?')
           ->execute($vals);
    }

    // Alle Duplikate dieses Büdchens mitauflösen
    $db->prepare('UPDATE enrichment_queue SET resolved = 1 WHERE buedchen_id = ? AND resolved = 0')
       ->execute([$entry['buedchen_id']]);

    return jsonResponse($response, ['ok' => true]);
});

// ──────────────────────────────────────────────────────────────────
// POST /api/route/generate
// ──────────────────────────────────────────────────────────────────
$app->post('/api/route/generate', function (Request $request, Response $response) use ($orsApiKey) {
    $db   = $this->get('db');
    $body = json_decode((string) $request->getBody(), true) ?? [];

    $lat    = isset($body['start_lat']) ? (float) $body['start_lat'] : null;
    $lng    = isset($body['start_lng']) ? (float) $body['start_lng'] : null;
    $radius = isset($body['radius_m'])  ? (int)   $body['radius_m']  : null;
    $themes = isset($body['themes'])    ? (array) $body['themes']    : [];

    if ($lat === null || $lng === null || $radius === null) {
        return jsonResponse($response, ['error' => 'invalid_input', 'message' => 'start_lat, start_lng und radius_m sind erforderlich.'], 400);
    }

    // Kölner Bounding Box
    if ($lat < 50.83 || $lat > 51.08 || $lng < 6.77 || $lng > 7.16) {
        return jsonResponse($response, ['error' => 'invalid_input', 'message' => 'Startpunkt liegt außerhalb von Köln.'], 400);
    }

    if ($radius < 500 || $radius > 3000) {
        return jsonResponse($response, ['error' => 'invalid_input', 'message' => 'radius_m muss zwischen 500 und 3000 liegen.'], 400);
    }

    $validThemes = ['entdecken', 'veedel', 'abhängen', 'klassiker'];
    $themes      = array_values(array_filter($themes, fn($t) => in_array($t, $validThemes)));
    if (count($themes) < 1 || count($themes) > 2) {
        return jsonResponse($response, ['error' => 'invalid_input', 'message' => 'Bitte 1–2 Themen auswählen.'], 400);
    }

    $body['themes']   = $themes;
    $body['start_lat'] = $lat;
    $body['start_lng'] = $lng;
    $body['radius_m']  = $radius;

    $gen    = new RouteGenerator($db, $orsApiKey);
    $result = $gen->generate($body);

    if (isset($result['error']) && $result['error'] === 'no_results') {
        return jsonResponse($response, $result, 404);
    }

    return jsonResponse($response, $result);
});

// ──────────────────────────────────────────────────────────────────
// GET /api/stats
// ──────────────────────────────────────────────────────────────────
$app->get('/api/stats', function (Request $request, Response $response) {
    $db    = $this->get('db');
    $total = (int) $db->query('SELECT COUNT(*) FROM buedchen')->fetchColumn();

    // "Offen" = hat Öffnungszeiten und die aktuelle Uhrzeit liegt im Fenster
    // Vereinfachte Logik für Phase 1: alle mit opening_hours != NULL als potenziell offen
    $open  = (int) $db->query('SELECT COUNT(*) FROM buedchen WHERE opening_hours IS NOT NULL')->fetchColumn();

    return jsonResponse($response, ['total' => $total, 'openNow' => $open]);
});
