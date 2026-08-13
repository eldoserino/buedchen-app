<?php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

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
            ORDER BY editorial_badges IS NOT NULL DESC, google_rating DESC
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

    $row['tags']            = $row['tags']            ? json_decode($row['tags'])            : [];
    $row['editorial_badges'] = $row['editorial_badges'] ? json_decode($row['editorial_badges']) : [];
    $row['opening_hours']   = $row['opening_hours']   ? json_decode($row['opening_hours'])   : null;
    $row['lat']             = (float) $row['lat'];
    $row['lng']             = (float) $row['lng'];
    $row['google_rating']   = $row['google_rating'] !== null ? (float) $row['google_rating'] : null;
    $row['google_review_count'] = $row['google_review_count'] !== null ? (int) $row['google_review_count'] : null;
    $row['feature_seating'] = (bool) $row['feature_seating'];
    $row['feature_coffee']  = (bool) $row['feature_coffee'];

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
// Hilfsfunktion: HTTP Basic Auth für Review-Queue
// ──────────────────────────────────────────────────────────────────
function checkBasicAuth(Request $request, Response $response): ?Response {
    global $config;
    $auth = $request->getHeaderLine('Authorization');
    if (!preg_match('/^Basic (.+)$/', $auth, $m)) {
        return $response
            ->withHeader('WWW-Authenticate', 'Basic realm="Büdchen Review"')
            ->withStatus(401);
    }
    $decoded = base64_decode($m[1]);
    [$user, $pass] = array_pad(explode(':', $decoded, 2), 2, '');
    $validUser = $config['review_queue']['user'] ?? '';
    $validPass = $config['review_queue']['pass'] ?? '';
    if ($user !== $validUser || $pass !== $validPass) {
        return $response->withStatus(401);
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────
// GET /api/review-queue  (HTTP Basic Auth)
// ──────────────────────────────────────────────────────────────────
$app->get('/api/review-queue', function (Request $request, Response $response) {
    $authError = checkBasicAuth($request, $response);
    if ($authError) return $authError;

    $db   = $this->get('db');
    $stmt = $db->query(
        'SELECT q.*, b.name AS buedchen_name
         FROM enrichment_queue q
         JOIN buedchen b ON b.id = q.buedchen_id
         WHERE q.resolved = 0
         ORDER BY q.created_at DESC
         LIMIT 100'
    );
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        $row['ai_output'] = $row['ai_output'] ? json_decode($row['ai_output']) : null;
        $row['resolved']  = (bool) $row['resolved'];
    }

    return jsonResponse($response, $rows);
});

// ──────────────────────────────────────────────────────────────────
// POST /api/review-queue/:id/resolve  (HTTP Basic Auth)
// ──────────────────────────────────────────────────────────────────
$app->post('/api/review-queue/{id}/resolve', function (Request $request, Response $response, array $args) {
    $authError = checkBasicAuth($request, $response);
    if ($authError) return $authError;

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
        $tags    = isset($overrides['tags'])    ? json_encode($overrides['tags'])    : null;
        $summary = isset($overrides['summary']) ? (string) $overrides['summary']     : null;

        $sets = ['enriched_at = NOW()'];
        $vals = [];

        if ($tags !== null)    { $sets[] = 'character_tags = ?'; $vals[] = $tags; }
        if ($summary !== null) { $sets[] = 'ai_summary = ?';     $vals[] = substr($summary, 0, 200); }

        if ($sets) {
            $vals[] = $entry['buedchen_id'];
            $db->prepare('UPDATE buedchen SET ' . implode(', ', $sets) . ' WHERE id = ?')
               ->execute($vals);
        }
    }

    $db->prepare('UPDATE enrichment_queue SET resolved = 1 WHERE id = ?')->execute([$id]);

    return jsonResponse($response, ['ok' => true]);
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
