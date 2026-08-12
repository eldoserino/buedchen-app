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
