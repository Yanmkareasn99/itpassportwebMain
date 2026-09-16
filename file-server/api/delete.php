<?php

declare(strict_types=1);

require __DIR__ . '/common.php';

handlePreflight($config);
sendCorsHeaders($config);

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    jsonResponse(405, [
        'error' => 'Method not allowed.',
    ]);
}

$user = getAuthenticatedUser($config);
$profile = getUserProfile($config, $user['id']);
$materialId = trim((string) ($_GET['id'] ?? ''));

if (!preg_match(
    '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
    $materialId
)) {
    jsonResponse(422, [
        'error' => 'A valid material ID is required.',
    ]);
}

$materialUrl = rtrim($config['supabase_url'], '/')
    . '/rest/v1/materials'
    . '?id=eq.' . rawurlencode($materialId)
    . '&select=id,uploader_id,storage_path'
    . '&limit=1';

$materialResponse = supabaseRequest(
    $materialUrl,
    'GET',
    [
        'apikey: ' . $config['supabase_service_role_key'],
        'Authorization: Bearer ' . $config['supabase_service_role_key'],
        'Accept: application/json',
    ]
);

if ($materialResponse['status'] !== 200 || empty($materialResponse['body'][0])) {
    jsonResponse(404, [
        'error' => 'The material was not found.',
    ]);
}

$material = $materialResponse['body'][0];
$isOwner = hash_equals((string) $material['uploader_id'], (string) $user['id']);
$isAdmin = ($profile['is_admin'] ?? false) === true
    || strtolower(trim((string) ($profile['role'] ?? ''))) === 'admin';

if (!$isOwner && !$isAdmin) {
    jsonResponse(403, [
        'error' => 'You can only delete materials that you uploaded.',
    ]);
}

$storagePath = (string) $material['storage_path'];
$isFileServerPath = preg_match(
    '/^[0-9]{4}\/[0-9]{2}\/[0-9a-f]{40}\.(pdf|png|jpg|docx|pptx|xlsx)$/',
    $storagePath
) === 1;
$isLegacyPath = preg_match(
    '/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i',
    $storagePath
) === 1;

if (!$isFileServerPath && !$isLegacyPath) {
    jsonResponse(500, [
        'error' => 'The material has an invalid storage path.',
    ]);
}

if ($isFileServerPath) {
    $storageRoot = rtrim(
        (string) $config['storage_directory'],
        DIRECTORY_SEPARATOR
    );
    $targetPath = $storageRoot
        . DIRECTORY_SEPARATOR
        . str_replace('/', DIRECTORY_SEPARATOR, $storagePath);

    if (is_file($targetPath) && !unlink($targetPath)) {
        jsonResponse(500, [
            'error' => 'The material file could not be deleted.',
        ]);
    }
} else {
    $encodedPath = implode('/', array_map('rawurlencode', explode('/', $storagePath)));
    $storageResponse = supabaseRequest(
        rtrim($config['supabase_url'], '/')
            . '/storage/v1/object/materials/' . $encodedPath,
        'DELETE',
        [
            'apikey: ' . $config['supabase_service_role_key'],
            'Authorization: Bearer ' . $config['supabase_service_role_key'],
        ]
    );

    if (!in_array($storageResponse['status'], [200, 204, 404], true)) {
        jsonResponse(502, [
            'error' => 'The legacy material file could not be deleted.',
        ]);
    }
}

$deleteResponse = supabaseRequest(
    rtrim($config['supabase_url'], '/')
        . '/rest/v1/materials?id=eq.' . rawurlencode($materialId),
    'DELETE',
    [
        'apikey: ' . $config['supabase_service_role_key'],
        'Authorization: Bearer ' . $config['supabase_service_role_key'],
        'Prefer: return=minimal',
    ]
);

if ($deleteResponse['status'] < 200 || $deleteResponse['status'] >= 300) {
    jsonResponse(502, [
        'error' => 'The material record could not be deleted.',
    ]);
}

jsonResponse(200, [
    'message' => 'The material was deleted successfully.',
]);
