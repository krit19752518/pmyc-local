<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class DrawEngine
{
    public const ALGORITHM='fisher-yates-random-int-knockout-v2';
    public const STAGE2_ALGORITHM='rank-district-matching-random-int-v1';
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
    /** Constrain every fixed team-v-team opening pair; winner feeders keep the bracket formula. */
    public static function generateStage2(array $teams):array
    {
        $prototype=self::generate($teams);$n=count($teams);$left=[];$right=[];
        foreach($teams as $team){
            if(!in_array($team['origin_rank'] ?? null,[1,2],true)||empty($team['origin_district']))throw new \DomainException('ต้องมีอันดับและอำเภอต้นทางครบก่อนจับสลากระดับจังหวัด');
            if($team['origin_rank']===1)$left[]=$team;else $right[]=$team;
        }
        $shuffle=static function(array $items):array{for($i=count($items)-1;$i>0;$i--){$j=random_int(0,$i);[$items[$i],$items[$j]]=[$items[$j],$items[$i]];}return $items;};
        $left=$shuffle($left);$right=$shuffle($right);$matched=[];
        $augment=function(int $a,array &$seen)use(&$augment,&$matched,$left,$right):bool{
            foreach($right as $b=>$team){
                if(isset($seen[$b])||$left[$a]['origin_district']===$team['origin_district'])continue;
                $seen[$b]=true;
                if(!isset($matched[$b])||$augment($matched[$b],$seen)){$matched[$b]=$a;return true;}
            }
            return false;
        };
        foreach($left as $a=>$_){$seen=[];$augment($a,$seen);}
        $slotPairs=[];
        foreach($prototype['fixtures'] as $fixture)if($fixture['side_a']['type']==='team'&&$fixture['side_b']['type']==='team')$slotPairs[]=[$fixture['side_a']['slot'],$fixture['side_b']['slot']];
        if(count($matched)<count($slotPairs))throw new \DomainException('ไม่สามารถจัดคู่เริ่มต้นอันดับ 1 พบอันดับ 2 ต่างอำเภอได้ กรุณาตรวจทีมผ่านเข้ารอบ');
        $pairs=[];foreach($matched as $b=>$a)$pairs[]=[$left[$a],$right[$b]];$pairs=$shuffle($pairs);
        $assigned=[];$used=[];
        foreach($slotPairs as $i=>$slots){$pair=$shuffle($pairs[$i]);foreach($slots as $j=>$slot){$assigned[$slot]=$pair[$j];$used[$pair[$j]['source_team_id']]=true;}}
        $remaining=$shuffle(array_values(array_filter($teams,fn($t)=>!isset($used[$t['source_team_id']]))));$slots=[];
        for($i=1;$i<=$n;$i++){$slot='A'.$i;$team=$assigned[$slot] ?? array_pop($remaining);$slots[]=['source_team_id'=>$team['source_team_id'],'name'=>$team['name'],'slot'=>$slot];}
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
