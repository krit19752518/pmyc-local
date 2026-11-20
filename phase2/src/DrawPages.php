<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class DrawPages
{
    public static function render(\PDO $db,string $id,string $path,string $method,array $input,array $context): array
    {
        $repo=new CompetitionRepository($db);$actor=$context['actor'];$scope=$repo->requireAccess($id,$actor);
        $draws=new DrawRepository($db);if(!$draws->ready())return [503,'ยังไม่ได้ติดตั้งระบบจับสลาก'];
        $base='/phase2demo/competitions/'.$id.'/draw';$view=basename($path);$view=match($view){'history'=>'history','setup'=>'setup','result'=>'result','bracket'=>'bracket',default=>'ceremony'};
        if($method==='POST'){
            if(!in_array($path,[$base,$base.'/setup',$base.'/result'],true))return [405,'ไม่รองรับคำขอนี้'];
            if(($input['_draw_feedback'] ?? '')==='1'){
                try{$draws->execute($id,$actor,$input);return [200,json_encode(['ok'=>true,'ceremony_url'=>$base],JSON_THROW_ON_ERROR),null,'application/json'];}
                catch(\InvalidArgumentException|\DomainException $e){return [$e instanceof \InvalidArgumentException?422:409,json_encode(['ok'=>false,'message'=>$e->getMessage()],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),null,'application/json'];}
            }
            $draws->execute($id,$actor,$input);return [303,'',$base];
        }
        $current=$draws->current($id);if($current)$current=self::withWinners($db,$current);$can=CompetitionPolicy::can($actor,$scope,$repo->assignment($id,$actor),'draw');
        if($current && $draws->ceremonyStatus($scope['event_id'],$current['id'])!==null && $view!=='history' && $view!=='setup'){
            return [303,'',WorkspaceView::url($view==='result'?'result':'ceremony',['competition_id'=>$id])];
        }
        if($view==='setup'||!$current)return DrawSetupPages::render($path,'GET',[],[],$context,$scope);
        $body=Ui::context($scope).'<nav class="tabs" aria-label="ขั้นตอนการจับสลาก">';
        foreach(['setup'=>'ตั้งค่าการจับสลาก','ceremony'=>'พิธีจับสลาก','result'=>'ผลการจับสลาก','history'=>'ประวัติการจับสลาก'] as $key=>$label)$body.='<a class="tab '.($key===$view?'active':'').'" href="'.$base.($key==='ceremony'?'':'/'.$key).'">'.$label.'</a>';
        $body.='</nav>';
        if($view==='history'){
            $body.='<div class="card"><div class="table-wrap"><table><thead><tr><th>เวอร์ชัน</th><th>สถานะ</th><th>เวลา</th><th>ผู้ดำเนินการ</th><th>เหตุผล</th></tr></thead><tbody>';
            $history=$draws->history($id);foreach($history as $d)$body.='<tr><td>เวอร์ชัน '.$d['version'].'</td><td><span class="badge '.($d['id']===($current['id'] ?? '')?'b-green':'b-amber').'">'.($d['id']!==($current['id'] ?? '')?'แทนที่ด้วยเวอร์ชันใหม่':($d['published_at']?'เผยแพร่แล้ว':'รอเผยแพร่')).'</span></td><td>'.self::e($d['created_at']).'</td><td>'.self::e($d['actor_id']).'</td><td>'.self::e($d['reason']).'</td></tr>';
            if(!$history)$body.='<tr><td colspan="5" class="empty">ยังไม่มีประวัติการจับสลาก</td></tr>';$body.='</tbody></table></div></div>';
            foreach($history as $d)$body.='<details class="card"><summary>ผลจับสลาก เวอร์ชัน '.$d['version'].'</summary><div class="card-b">'.self::metadata($d,$current).self::bracket($d).'<p class="muted">วิธีสุ่ม: '.self::e($d['algorithm_version']).'</p></div></details>';
        }elseif($view==='ceremony'){
            $body.='<section class="draw-stage" data-draw-ceremony data-draw-id="'.$current['id'].'"><div><h2>พิธีจับสลากดิจิทัล PMYC</h2><p>'.self::e(EventDraft::DIVISIONS[$scope['division_code']]).' · '.self::e(implode(' · ',array_filter([$scope['district'],$scope['province']]))).' · เวอร์ชัน '.$current['version'].'</p><div class="machine" data-draw-machine aria-hidden="true">';
            foreach($current['slots'] as $i=>$slot)$body.='<span class="ball">'.($i+1).'</span>';
            $body.='</div><div class="draw-reveals" aria-live="polite">';foreach($current['slots'] as $slot)$body.='<div class="reveal-box" data-draw-reveal data-name="'.self::e($slot['name']).'"><span>'.self::e($slot['slot']).'</span><b>รอผล</b></div>';
            $body.='</div><button class="btn btn-yellow" type="button" data-draw-next>เริ่มพิธีจับสลาก</button><p data-draw-status role="status">พร้อมเริ่มพิธี · เปิดผลทีละตำแหน่งจนครบ</p><p><a class="btn btn-light" href="'.$base.'/result">ดูผลการจับสลาก</a></p><noscript><p>เปิด JavaScript เพื่อชมพิธี หรือกดดูผลการจับสลากได้ทันที</p></noscript></div></section><details class="card"><summary>ผลจับสลากและคู่แข่งขัน</summary><div class="card-b">'.self::bracket($current).'</div></details>';
        }else{
            if($view==='bracket')$body.=Ui::metrics(['ทีม'=>count($current['slots']),'ทีมที่ผ่านเข้ารอบ'=>(int)$scope['stage']===1?min(2,count($current['slots'])):1,'รูปแบบการแข่งขัน'=>'แพ้คัดออก']);
            $body.='<div class="card"><div class="card-h"><h3>'.($view==='bracket'?'ก้างปลา Stage '.$scope['stage']:'ผลจับสลากอย่างเป็นทางการ').'</h3><span class="badge '.($current['published_at']?'b-green':'b-amber').'">'.($current['published_at']?'เผยแพร่แล้ว':'สร้างแล้ว').'</span></div><div class="card-b">'.self::bracket($current).self::metadata($current,$current);
            $started=$draws->started($current['id']);if($can&&!$current['published_at'])$body.=self::form($base,$context,$current['version'],'publish','ยืนยันและเผยแพร่คู่แข่งขัน');
            if($can&&$actor['role']==='SUPER_ADMIN'&&!$started)$body.=self::form($base,$context,$current['version'],'redraw','สุ่มใหม่เป็นเวอร์ชันถัดไป',true);
            if($started)$body.='<div class="notice">มีคู่แข่งขันเริ่มแล้ว ปิดสิทธิ์สุ่มใหม่สำหรับผลจับสลากนี้</div>';
            $body.='<a class="btn btn-primary" href="/phase2demo/competitions/'.$id.'/matches">ตารางและรายละเอียดแมตช์</a></div></div>';
        }
        $title=match($view){'history'=>'ประวัติการจับสลาก','setup'=>'ตั้งค่าการจับสลาก','result'=>'ผลการจับสลาก','bracket'=>'ก้างปลา Stage '.$scope['stage'].' '.((int)$scope['stage']===1?'ระดับอำเภอ':'ระดับจังหวัด'),default=>$current?'พิธีจับสลาก':'ตั้งค่าการจับสลาก'};
        return Application::page($title,$body,$path,$context);
    }
    public static function bracket(array $draw): string
    {
        $names=[];foreach($draw['winner_names'] ?? [] as $number=>$name)$names['winner:'.$number]=$name;$html='<div class="choice-row draw-slots">';
        foreach($draw['slots'] as $slot){$names[$slot['source_team_id']]=$slot['name'];$html.='<span class="badge b-blue">'.self::e($slot['slot']).' · '.self::e($slot['name']).'</span>';}$html.='</div>';
        foreach($draw['automatic_qualifiers'] as $qualifier)$html.='<div class="notice">'.self::e($names[$qualifier['source_team_id']]).' · ผ่านเข้ารอบอัตโนมัติ (ทีมเดียว)'.(!$draw['published_at']?' · รอยืนยันเผยแพร่':'').'</div>';
        if(!$draw['fixtures'])return $html;
        $html.='<div class="bracket-scroll" tabindex="0" aria-label="ก้างปลาแข่งขัน"><div class="bracket">';$round=0;$lastRound=max(array_column($draw['fixtures'],'round'));$n=count($draw['slots']);
        foreach($draw['fixtures'] as $fixture){
            if($round!==$fixture['round']){
                if($round)$html.='</div>';$round=$fixture['round'];
                $label=$round===$lastRound?'รอบชิงชนะเลิศ':($round===1 && ($n & ($n-1))!==0?'รอบเพลย์ออฟ':'รอบ '.(2 ** ($lastRound-$round+1)).' ทีม');
                $html.='<div class="round"><h3 class="round-title">'.$label.'</h3>';
            }
            $html.='<div class="match"><div class="mno">M'.$fixture['number'].'</div><div class="slot">'.self::side($fixture['side_a'],$names).'</div><div class="slot">'.self::side($fixture['side_b'],$names).'</div></div>';
        }
        return $html.'</div></div></div><p class="muted">ดูวัน เวลา และสนามในตารางการแข่งขัน · ไม่มีการกำหนดสกอร์ให้ทีมที่ได้บาย</p>';
    }
    public static function publicContent(bool $demo,string $view='fixtures',?\PDO $database=null): string
    {
        if(!$database&&!EventRepository::configured())return '';
        $db=$database??EventRepository::connect();$repo=new DrawRepository($db);if(!$repo->ready())return '';
        $matches=class_exists(MatchRepository::class)?new MatchRepository($db):null;
        $html='';foreach($repo->published($demo) as $draw){
            $drawPublic=$draw['draw_is_published']===true||$draw['draw_is_published']==='t';
            if(!$drawPublic&&$view!=='fixtures')continue;
            $html.='<article class="card"><div class="card-h"><h3>'.self::e($draw['event_name']).'</h3><span class="badge b-green">'.($drawPublic?'เผยแพร่ผลจับสลากแล้ว':'เผยแพร่ตารางแข่งขันแล้ว').'</span></div><div class="card-b"><p>'.self::e(EventDraft::DIVISIONS[$draw['division_code']]).' · Stage '.$draw['stage'].' · '.self::e($draw['province']).' '.self::e($draw['district']).'</p>';
            if(!$drawPublic)$html.=($matches&&$matches->ready()?MatchPages::table($matches,$draw,true):'');
            elseif($view==='teams'){$s=$db->prepare('SELECT teams FROM p2_roster_revision WHERE id=?');$s->execute([$draw['roster_revision_id']]);$html.='<div class="table-wrap"><table><thead><tr><th>ทีม</th><th>นักกีฬา</th><th></th></tr></thead><tbody>';foreach(json_decode($s->fetchColumn(),true,512,JSON_THROW_ON_ERROR) as $t)$html.='<tr><td>'.Ui::team($t['name']).'</td><td>'.count($t['players']).' คน</td><td><a class="btn btn-light" href="/phase2demo/teams/'.$draw['competition_id'].'?team_id='.rawurlencode($t['source_team_id']).'">ดูรายละเอียดทีม</a></td></tr>';$html.='</tbody></table></div>';}
            elseif($view==='bracket')$html.=self::bracket(self::withWinners($db,$draw));
            else{if($draw['automatic_qualifiers'])$html.=self::bracket($draw);$html.=($matches&&$matches->ready()?MatchPages::table($matches,$draw,true,$view==='results'):'').'<details><summary>ดูก้างปลาและผลจับสลาก</summary>'.self::bracket(self::withWinners($db,$draw)).'</details>';}
            $html.='</div></article>';
        }return $html;
    }
    private static function withWinners(\PDO $db,array $draw):array
    {
        if(!class_exists(ResultRepository::class)||(new ResultRepository($db))->ready()===false)return $draw;
        $s=$db->prepare("SELECT m.number,r.result->>'winner' AS winner FROM p2_match m JOIN p2_result_revision r ON r.id=m.confirmed_result_id AND r.match_id=m.id WHERE m.draw_id=?");$s->execute([$draw['id']]);$names=array_column($draw['slots'],'name','source_team_id');$draw['winner_names']=[];foreach($s->fetchAll() as $row)$draw['winner_names'][$row['number']]=$names[$row['winner']];return $draw;
    }
    private static function metadata(array $draw,?array $current): string
    {
        $html='<div class="audit">';foreach(['รหัสการจับสลาก'=>$draw['id'],'เวอร์ชัน'=>'v'.$draw['version'],'ผู้ดำเนินการ'=>$draw['actor_id'],'สถานะ'=>$draw['published_at']?'เผยแพร่แล้ว':'รอเผยแพร่'] as $label=>$value)$html.='<div class="audit-item"><small>'.$label.'</small><strong>'.self::e($value).'</strong></div>';return $html.'</div><p class="muted">'.self::e($draw['created_at']).' · เหตุผล: '.self::e($draw['reason']).'</p>';
    }
    private static function form(string $path,array $context,int $version,string $operation,string $label,bool $reason=false): string
    {
        return '<form method="post" action="'.$path.'" class="draw-action"><input type="hidden" name="_csrf" value="'.self::e($context['csrf']).'"><input type="hidden" name="request_id" value="'.EventRepository::uuid().'"><input type="hidden" name="version" value="'.$version.'"><input type="hidden" name="operation" value="'.$operation.'">'.($reason?'<label class="field">เหตุผลสุ่มใหม่ *<input required name="reason" maxlength="300" placeholder="ระบุเหตุผลเพื่อเก็บประวัติ"></label><p>ทำได้เฉพาะ Super Admin ก่อนมีคู่แข่งขันเริ่ม รวมถึงผลที่เคยเผยแพร่แล้ว ผลเดิมจะอยู่ในประวัติ</p>':'').'<button class="btn '.($reason?'btn-light':'btn-success').'" type="submit">'.$label.'</button></form>';
    }
    private static function side(array $side,array $names): string { return $side['type']==='winner'?(isset($names['winner:'.$side['match']])?self::e($names['winner:'.$side['match']]):'ผู้ชนะ M'.$side['match']):self::e($side['slot']).' · '.self::e($names[$side['source_team_id']]); }
    private static function e(?string $v): string {return htmlspecialchars($v ?? '',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
}
