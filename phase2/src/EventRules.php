<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** Decisions must be explicitly supplied per Event; no sporting defaults. */
final class EventRules
{
    /** Confirmed by the user on 2026-11-07; preparation values, not an automatic DB approval. */
    public const PMYC_CONFIRMED=['confirmation'=>'SUPER_ADMIN','knockout_tie'=>'EXTRA_TIME'];
    public static function validate(array $input):array
    {
        $confirmation=$input['confirmation'] ?? null;$tie=$input['knockout_tie'] ?? null;$lineup=$input['lineup_required'] ?? null;
        if(!in_array($confirmation,['SUPER_ADMIN','RESULT_ASSIGNEES'],true)||!in_array($tie,['PENALTIES','EXTRA_TIME','PENDING'],true)||!in_array($lineup,['yes','no'],true))throw new \InvalidArgumentException('กรุณาระบุผู้ยืนยันผล วิธีตัดสินผลเสมอ และข้อกำหนดรายชื่อก่อนเริ่ม');
        $starters=self::count($input['starters'] ?? null,1,99);$bench=self::count($input['bench_max'] ?? null,0,99);
        if($lineup==='yes' && ($starters===null||$bench===null))throw new \InvalidArgumentException('กรุณาระบุจำนวนตัวจริงและตัวสำรองให้ชัดเจน');
        return ['confirmation'=>$confirmation,'knockout_tie'=>$tie,'lineup_required'=>$lineup==='yes','starters'=>$starters,'bench_max'=>$bench,'walkover'=>'PENDING','discipline'=>'PENDING','standings_tiebreak'=>'PENDING','allstar_quotas'=>'PENDING','stage4_seeding'=>'PENDING'];
    }
    private static function count(mixed $v,int $min,int $max):?int
    {
        if($v===null||$v==='')return null;
        if(!(is_int($v)||is_string($v))||!preg_match('/^[0-9]{1,2}$/D',(string)$v)||(int)$v<$min||(int)$v>$max)throw new \InvalidArgumentException('จำนวนผู้เล่นไม่ถูกต้อง');
        return (int)$v;
    }
}
