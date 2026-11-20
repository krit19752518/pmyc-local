<?php
declare(strict_types=1);

namespace PMYC\Phase2;

final class Bridge
{
    public static function verify(array $headers, string $body, string $method, string $uri, string $secret, ?int $now = null): array
    {
        $stamp = $headers['x-pmyc-time'] ?? '';
        $nonce = $headers['x-pmyc-nonce'] ?? '';
        $encoded = $headers['x-pmyc-context'] ?? '';
        $signature = $headers['x-pmyc-signature'] ?? '';
        if (strlen($secret) < 32 || !is_string($stamp) || !preg_match('/^[0-9]{13}$/D', $stamp) || abs(($now ?? (int) round(microtime(true) * 1000)) - (int) $stamp) > 10000
            || !preg_match('/^[a-f0-9]{32}$/D', $nonce) || !preg_match('/^[a-f0-9]{64}$/D', $signature) || strlen($encoded) > 16384) {
            throw new \RuntimeException('Invalid bridge request');
        }
        $canonical = implode("\n", [$stamp, $nonce, $method, $uri, hash('sha256', $body), $encoded]);
        if (!hash_equals(hash_hmac('sha256', $canonical, $secret), $signature)) {
            throw new \RuntimeException('Invalid bridge signature');
        }
        $raw = base64_decode(strtr($encoded, '-_', '+/'), true);
        $context = $raw === false ? null : json_decode($raw, true);
        if (!is_array($context) || !array_key_exists('actor', $context)) throw new \RuntimeException('Invalid bridge context');
        $actor = $context['actor'];
        if ($actor !== null) {
            if (!is_array($actor) || !is_string($actor['id'] ?? null) || !is_string($actor['name'] ?? null)
                || !in_array($actor['role'] ?? null, ['SUPER_ADMIN', 'DOCUMENT_VERIFIER', 'SAT_OFFICER'], true)
                || !in_array($actor['portal'] ?? null, ['central', 'sat'], true)
                || !is_numeric($context['expiresAt'] ?? null) || $context['expiresAt'] <= ($now ?? (int) round(microtime(true) * 1000))) {
                throw new \RuntimeException('Invalid or expired identity');
            }
            if (($actor['role'] === 'SAT_OFFICER') !== ($actor['portal'] === 'sat')
                || ($actor['role'] === 'SAT_OFFICER' && (!is_string($actor['province'] ?? null) || trim($actor['province']) === ''))) {
                throw new \RuntimeException('Invalid portal scope');
            }
        }
        return $context;
    }
}
