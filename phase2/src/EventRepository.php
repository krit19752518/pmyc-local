<?php
declare(strict_types=1);

namespace PMYC\Phase2;

final class EventRepository
{
    public function __construct(private \PDO $db) {}

    public static function configured(): bool
    {
        return (bool)(getenv('PHASE2_DATABASE_URL') || getenv('PHASE2_TEST_DSN'));
    }

    /** Check readiness without initializing tables from a web request. */
    public function creationReady(): bool
    {
        foreach (['p2_season','p2_template_version','p2_event','p2_event_division','p2_audit_log'] as $table) {
            $query=$this->db->prepare('SELECT to_regclass(?) IS NOT NULL');
            $query->execute([$table]);
            if ($query->fetchColumn() !== true) return false;
        }
        $query=$this->db->prepare('SELECT count(*) FROM p2_template_version WHERE id IN (?,?,?)');
        $query->execute(array_keys(EventDraft::TEMPLATES));
        return (int)$query->fetchColumn() === count(EventDraft::TEMPLATES);
    }

    public static function connect(): \PDO
    {
        if ($testDsn = getenv('PHASE2_TEST_DSN')) {
            if (getenv('PHASE2_TEST_DATABASE') !== '1') throw new \RuntimeException('Test DSN is disabled');
            return new \PDO($testDsn, getenv('PHASE2_TEST_USER') ?: 'p2test', null, self::options());
        }
        $url = parse_url(getenv('PHASE2_DATABASE_URL') ?: '');
        if (!$url || !in_array($url['scheme'] ?? '', ['postgres','postgresql'], true)) throw new \RuntimeException('Database is not configured');
        $host = $url['host'] ?? '';
        $name = ltrim($url['path'] ?? '', '/');
        if (!preg_match('/^[a-zA-Z0-9_.:-]+$/D', $host) || !preg_match('/^[a-zA-Z0-9_-]+$/D', $name)) throw new \RuntimeException('Invalid database target');
        return new \PDO('pgsql:host='.$host.';port='.($url['port'] ?? 5432).';dbname='.$name.';connect_timeout=3', rawurldecode($url['user'] ?? ''), rawurldecode($url['pass'] ?? ''), self::options());
    }

    private static function options(): array
    {
        return [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC, \PDO::ATTR_EMULATE_PREPARES => false];
    }

    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 15) | 64);
        $bytes[8] = chr((ord($bytes[8]) & 63) | 128);
        $hex = bin2hex($bytes);
        return substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20);
    }

    public static function validUuid(mixed $value): bool
    {
        return is_string($value) && (bool)preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/Di', $value);
    }

    public function create(array $draft, string $actorId, string $requestId): array
    {
        if (!self::validUuid($requestId)) throw new \InvalidArgumentException('Invalid request ID');
        sort($draft['divisions']);
        $hash = hash('sha256', json_encode($draft, JSON_THROW_ON_ERROR));
        $this->db->beginTransaction();
        try {
            // Serialize retries of this request, including concurrent submissions.
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-event:'.$requestId]);
            $previous = $this->one('SELECT id,request_hash,created_by FROM p2_event WHERE request_id=?', [$requestId]);
            if ($previous) {
                if ($previous['created_by'] !== $actorId || !hash_equals($previous['request_hash'], $hash)) throw new \DomainException('คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาเปิดแบบฟอร์มใหม่');
                $this->db->commit();
                return ['id' => $previous['id'], 'created' => false];
            }
            $template = $this->one('SELECT config FROM p2_template_version WHERE id=?', [$draft['template_version']]);
            if (!$template) throw new \DomainException('ไม่พบเทมเพลทฉบับที่เลือก');
            $seasonId = self::uuid();
            $this->db->prepare('INSERT INTO p2_season(id,label) VALUES (?,?) ON CONFLICT(label) DO NOTHING')->execute([$seasonId, $draft['season']]);
            $seasonId = $this->one('SELECT id FROM p2_season WHERE label=?', [$draft['season']])['id'];
            $id = self::uuid();
            $this->db->prepare('INSERT INTO p2_event(id,season_id,template_version_id,name,is_test,start_date,end_date,config_snapshot,created_by,request_id,request_hash) VALUES (?,?,?,?,CAST(? AS boolean),?,?,CAST(? AS jsonb),?,?,?)')
                ->execute([$id,$seasonId,$draft['template_version'],$draft['name'],$draft['is_test'] ? 'true' : 'false',$draft['start_date'],$draft['end_date'],$template['config'],$actorId,$requestId,$hash]);
            $division = $this->db->prepare('INSERT INTO p2_event_division(id,event_id,code) VALUES (?,?,?)');
            foreach ($draft['divisions'] as $code) $division->execute([self::uuid(), $id, $code]);
            $this->db->prepare('INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,\'EVENT_CREATED\',?,CAST(? AS jsonb))')
                ->execute([$id,$actorId,$requestId,json_encode(['status'=>'DRAFT','is_test'=>$draft['is_test'],'divisions'=>$draft['divisions']], JSON_THROW_ON_ERROR)]);
            $this->db->commit();
            return ['id' => $id, 'created' => true];
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    public function list(?bool $isTest = null): array
    {
        $sql = 'SELECT e.*,s.label AS season FROM p2_event e JOIN p2_season s ON s.id=e.season_id';
        if ($isTest !== null) $sql .= ' WHERE e.is_test=CAST(? AS boolean)';
        $stmt = $this->db->prepare($sql.' ORDER BY e.created_at DESC,e.id LIMIT 100');
        $stmt->execute($isTest === null ? [] : [$isTest ? 'true' : 'false']);
        return $stmt->fetchAll();
    }

    public function get(string $id): ?array
    {
        if (!self::validUuid($id)) return null;
        $event = $this->one('SELECT e.*,s.label AS season FROM p2_event e JOIN p2_season s ON s.id=e.season_id WHERE e.id=?', [$id]);
        if (!$event) return null;
        $stmt = $this->db->prepare('SELECT code FROM p2_event_division WHERE event_id=? ORDER BY code');
        $stmt->execute([$id]);
        $event['divisions'] = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        return $event;
    }

    private function one(string $sql, array $values): ?array
    {
        $stmt = $this->db->prepare($sql);
        $stmt->execute($values);
        return $stmt->fetch() ?: null;
    }
}
