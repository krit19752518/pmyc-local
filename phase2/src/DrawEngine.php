<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class DrawEngine
{
    public const ALGORITHM='fisher-yates-random-int-knockout-v2';
    public const TEMPLATES=['pmyc-four-stage-v1','knockout-v1'];
    /** The setup preview and committed bracket share the same fixed slot rules. */
    public static function structure(int $n):array
    {
        if($n<0||$n>128)throw new \InvalidArgumentException('จำนวนทีมไม่ถูกต้อง');
        if($n===0)return ['count'=>0,'main_round'=>0,'playoff_pairs'=>0,'direct_entry_slots'=>[],'playoff_slots'=>[]];
        $power=1;while($power*2<=$n)$power*=2;
        $pre=$n-$power;$direct=$n===1?1:($pre?2*$power-$n:0);$pairs=[];
        for($i=$direct+1;$pre&&$i<=$n;$i+=2)$pairs[]=['A'.$i,'A'.($i+1)];
        return ['count'=>$n,'main_round'=>$power,'playoff_pairs'=>$pre,'direct_entry_slots'=>$direct?array_map(fn($i)=>'A'.$i,range(1,$direct)):[],'playoff_slots'=>$pairs];
    }
    /** random_int uses PHP's OS-backed CSPRNG; no client seed or permutation accepted. */
    public static function generate(array $teams): array
    {
        if (count($teams)<1 || count($teams)>128 || count(array_unique(array_column($teams,'source_team_id')))!==count($teams)) throw new \InvalidArgumentException('จำนวนทีมหรือรหัสทีมไม่ถูกต้อง');
        $slots=array_map(fn($t)=>['source_team_id'=>$t['source_team_id'],'name'=>$t['name']],array_values($teams));
        for ($i=count($slots)-1;$i>0;$i--) { $j=random_int(0,$i);[$slots[$i],$slots[$j]]=[$slots[$j],$slots[$i]]; }
        foreach ($slots as $i=>&$slot) $slot['slot']='A'.($i+1);unset($slot);
        return ['slots'=>$slots,...self::fixtures($slots)];
    }
    /** Balanced preliminary round; byes are advancements, never artificial matches/scores. */
    public static function fixtures(array $slots): array
    {
        $n=count($slots);if ($n<1||$n>128) throw new \InvalidArgumentException('จำนวนทีมไม่ถูกต้อง');
        if ($n===1) return ['fixtures'=>[],'automatic_qualifiers'=>[['source_team_id'=>$slots[0]['source_team_id'],'reason'=>'SINGLE_TEAM']]];
        $fixtures=[];$round=1;$structure=self::structure($n);$power=$structure['main_round'];
        $nodes=array_map(fn($s)=>['type'=>'team','source_team_id'=>$s['source_team_id'],'slot'=>$s['slot']],$slots);
        $match=function(array $a,array $b)use(&$fixtures,&$round):array{$number=count($fixtures)+1;$fixtures[]=['number'=>$number,'round'=>$round,'side_a'=>$a,'side_b'=>$b];return ['type'=>'winner','match'=>$number];};
        if ($power!==$n) {
            $byes=count($structure['direct_entry_slots']);$waiting=array_slice($nodes,0,$byes);$preliminary=[];
            for($i=$byes;$i<$n;$i+=2)$preliminary[]=$match($nodes[$i],$nodes[$i+1]);
            $nodes=[];while($waiting||$preliminary){if($waiting)$nodes[]=array_shift($waiting);if($preliminary)$nodes[]=array_shift($preliminary);}$round++;
        }
        while(count($nodes)>1){$next=[];for($i=0;$i<count($nodes);$i+=2)$next[]=$match($nodes[$i],$nodes[$i+1]);$nodes=$next;$round++;}
        return ['fixtures'=>$fixtures,'automatic_qualifiers'=>[]];
    }
}
