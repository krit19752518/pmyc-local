<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class CompetitionPolicy
{
    public const ACTIONS = ['view','import','draw','schedule','result'];

    public static function can(?array $actor, array $competition, ?array $assignment, string $action): bool
    {
        if (!$actor || !in_array($action,self::ACTIONS,true)) return false;
        if ($action!=='view' && (in_array($competition['event_status'] ?? '',['CLOSED','ARCHIVED'],true) || in_array($competition['status'] ?? '',['COMPLETED','ARCHIVED'],true))) return false;
        if (($actor['role'] ?? null)==='SUPER_ADMIN') return true;
        if (!in_array($actor['role'] ?? null,['DOCUMENT_VERIFIER','SAT_OFFICER'],true)) return false;
        if (!$assignment || ($assignment['active'] ?? false)!==true || ($assignment['actor_id'] ?? null)!==($actor['id'] ?? null)
            || ($assignment['actor_role'] ?? null)!==($actor['role'] ?? null)) return false;
        if ($actor['role']==='DOCUMENT_VERIFIER' && $action!=='view') return false;
        if ($actor['role']==='SAT_OFFICER' && (empty($actor['province']) || !in_array((int)$competition['stage'],[1,2],true) || ($competition['province'] ?? null)!==$actor['province'])) return false;
        $permissions=$assignment['permissions'] ?? [];
        if (is_string($permissions)) $permissions=json_decode($permissions,true);
        return is_array($permissions) && in_array('view',$permissions,true) && in_array($action,$permissions,true);
    }
}
