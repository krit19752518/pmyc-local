<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class ResultRules
{
    public static function validate(array $input,array $config,array $teams):array
    {
        $type=$input['type'] ?? null;
        if(!in_array($type,['NORMAL','PENALTIES','EXTRA_TIME'],true))throw new \InvalidArgumentException('รูปแบบผลไม่รองรับ ชนะบาย/วอล์กโอเวอร์ยังรอกติกา');
        $a=self::score($input['goals_a'] ?? null);$b=self::score($input['goals_b'] ?? null);$ea=null;$eb=null;$pa=null;$pb=null;
        $winner=null;$totalA=$a;$totalB=$b;
        if($type==='NORMAL'){
            if($a===$b)throw new \InvalidArgumentException('ผลปกติต้องไม่เสมอในรอบแพ้คัดออก');
            foreach(['extra_a','extra_b','penalties_a','penalties_b'] as $field)if(($input[$field] ?? '')!=='')throw new \InvalidArgumentException('ผลปกติไม่รับสกอร์ต่อเวลาหรือจุดโทษ');
        }else{
            if($a!==$b || $config['knockout_tie']==='PENDING')throw new \InvalidArgumentException('ผลเสมอต้องมีกติกาตัดสินที่ยืนยันแล้ว');
            if($config['knockout_tie']==='EXTRA_TIME'){$ea=self::score($input['extra_a'] ?? null);$eb=self::score($input['extra_b'] ?? null);$totalA+=$ea;$totalB+=$eb;}
            elseif(($input['extra_a'] ?? '')!==''||($input['extra_b'] ?? '')!=='')throw new \InvalidArgumentException('กติกานี้ไม่ต่อเวลาพิเศษ');
            if($type==='EXTRA_TIME' && ($config['knockout_tie']!=='EXTRA_TIME'||$totalA===$totalB))throw new \InvalidArgumentException('ผลต่อเวลาต้องมีผู้ชนะ และตรงกติกา');
            if($type==='PENALTIES'){
                if($totalA!==$totalB)throw new \InvalidArgumentException('ก่อนยิงจุดโทษผลต้องเสมอ');
                $pa=self::score($input['penalties_a'] ?? null);$pb=self::score($input['penalties_b'] ?? null);if($pa===$pb)throw new \InvalidArgumentException('จุดโทษต้องมีผู้ชนะ');$winner=$pa>$pb?$teams['a']:$teams['b'];
            }elseif(($input['penalties_a'] ?? '')!==''||($input['penalties_b'] ?? '')!=='')throw new \InvalidArgumentException('ผลต่อเวลาไม่รับสกอร์จุดโทษ');
        }
        $winner??=$totalA>$totalB?$teams['a']:$teams['b'];
        if(!$teams['a']||!$teams['b']||$teams['a']===$teams['b'])throw new \DomainException('คู่แข่งขันยังไม่ครบ');
        return ['type'=>$type,'team_a'=>$teams['a'],'team_b'=>$teams['b'],'goals_a'=>$a,'goals_b'=>$b,'extra_a'=>$ea,'extra_b'=>$eb,'total_a'=>$totalA,'total_b'=>$totalB,'penalties_a'=>$pa,'penalties_b'=>$pb,'winner'=>$winner,'loser'=>$winner===$teams['a']?$teams['b']:$teams['a']];
    }
    private static function score(mixed $value):int
    {
        if(!(is_int($value)||is_string($value))||!preg_match('/^[0-9]{1,3}$/D',(string)$value))throw new \InvalidArgumentException('กรุณาระบุสกอร์เป็นจำนวนเต็มไม่ติดลบ');return (int)$value;
    }
}
