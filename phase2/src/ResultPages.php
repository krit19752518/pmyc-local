<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class ResultPages
{
    public static function render(\PDO $db,string $competition,string $id,string $section,string $path,string $method,array $input,array $context,array $query=[]):array
    {
        $actor=$context['actor'];$comps=new CompetitionRepository($db);$scope=$comps->requireAccess($competition,$actor);$matches=new MatchRepository($db);$match=$matches->get($id);
        if(!$match||$match['competition_id']!==$competition)throw new \OutOfBoundsException('ไม่พบแมตช์');
        $workspace=in_array((int)$scope['stage'],[1,2],true);
        if($workspace){$event=(new EventRepository($db))->get($scope['event_id']);if(!$event)return [404,'ไม่พบรายการแข่งขัน'];$filters=MatchDetailView::filters($scope,$event,$match,$query,$actor);}
        $repo=new ResultRepository($db);if(!$repo->ready())return [503,'ยังไม่ได้ติดตั้งระบบรายชื่อและผล'];
        if($method==='POST'){
            $allowed=$section==='lineups'?['lineup_draft','lineup_confirm']:['result_draft','result_confirm'];
            if(!in_array($input['operation'] ?? '',$allowed,true))return [422,'คำขอไม่ตรงหน้าที่ใช้งาน'];
            $repo->execute($id,$actor,$input);return [303,'',$workspace?MatchDetailView::url($path,$filters):$path];
        }
        $rules=(new RuleRepository($db))->current($scope['event_id']);$draw=(new DrawRepository($db))->current($competition);$teams=$repo->resolved($match);
        $teamNames=array_column($draw['slots'] ?? [],'name','source_team_id');
        $can=$rules && $draw && $draw['id']===$match['draw_id'] && $draw['published_at'] && CompetitionPolicy::can($actor,$scope,$comps->assignment($competition,$actor),'result');
        if($draw && $draw['id']!==$match['draw_id'])foreach((new DrawRepository($db))->history($competition) as $past)if($past['id']===$match['draw_id']){$draw=$past;break;}
        $confirm=$can && ($actor['role']==='SUPER_ADMIN'||$rules['config']['confirmation']==='RESULT_ASSIGNEES');
        $detailBase='/phase2demo/competitions/'.$competition.'/matches/'.$id;
        $body=$workspace?'<div class="action-row"><a class="btn" href="'.self::e(MatchDetailView::url($detailBase.'/lineups',$filters)).'">รายชื่อผู้เล่น</a><a class="btn" href="'.self::e(MatchDetailView::url($detailBase.'/results',$filters)).'">ผลการแข่งขัน</a></div>':Ui::context($scope).MatchPages::tabs($detailBase,$section).MatchPages::overview($matches,$match,$draw);
        if(!$rules)$body.='<div class="notice">รอ Super Admin ระบุกติกาของรายการ ยังไม่เปิดบันทึกหรือยืนยันข้อมูล</div>';
        elseif(!$teams['a']||!$teams['b'])$body.='<div class="notice">รอยืนยันผู้ชนะจากรอบก่อนหน้า</div>';
        elseif($section==='lineups'){$body.='<div class="lineup-grid">';
            $s=$db->prepare('SELECT teams FROM p2_roster_revision WHERE id=?');$s->execute([$draw['roster_revision_id']]);$roster=json_decode($s->fetchColumn(),true,512,JSON_THROW_ON_ERROR);
            foreach($roster as $team){if(!in_array($team['source_team_id'],$teams,true))continue;$latest=$repo->lineup($id,$team['source_team_id']);$body.='<article class="card"><div class="card-b"><h2>'.self::e($team['name']).'</h2><p>'.($latest?($latest['state']==='CONFIRMED'?'ยืนยันรายชื่อแล้ว':'ร่างรายชื่อ').' · ฉบับ '.$latest['version']:'ยังไม่มีรายชื่อแมตช์').'</p>';
                $selected=array_column($latest['players'] ?? [],'role','id');
                if($can && !$match['started_at'] && $match['state']!=='CANCELLED'){
                    $body.='<form method="post" action="'.self::e($workspace?MatchDetailView::url($path,$filters):$path).'" data-lineup-form>'.self::hidden($context,$match,'lineup_draft').'<input type="hidden" name="team_id" value="'.self::e($team['source_team_id']).'"><p>เลือกจากรายชื่อที่ล็อกเท่านั้น · ตัวจริง '.($rules['config']['starters'] ?? 'ยังไม่กำหนด').' · ตัวสำรองสูงสุด '.($rules['config']['bench_max'] ?? 'ยังไม่กำหนด').'</p><div class="hscroll"><table class="match-table"><thead><tr><th>นักกีฬา</th><th>เบอร์</th><th>ตัวจริง</th><th>สำรอง</th></tr></thead><tbody>';
                    foreach($team['players'] as $p)$body.='<tr><td>'.self::e($p['name']).'</td><td>'.self::e($p['jersey_no'] ?? '').'</td><td><input aria-label="ตัวจริง '.self::e($p['name']).'" type="checkbox" name="starters[]" value="'.self::e($p['id']).'" '.(($selected[$p['id']] ?? '')==='STARTER'?'checked':'').'></td><td><input aria-label="สำรอง '.self::e($p['name']).'" type="checkbox" name="bench[]" value="'.self::e($p['id']).'" '.(($selected[$p['id']] ?? '')==='SUBSTITUTE'?'checked':'').'></td></tr>';
                    $body.='</tbody></table></div>'.self::reason().'<button class="btn btn-primary" type="submit">บันทึกร่างรายชื่อ</button></form>';
                    if($confirm && $latest && $latest['state']==='DRAFT' && $latest['rule_version_id']===$rules['id'])$body.='<form method="post" action="'.self::e($workspace?MatchDetailView::url($path,$filters):$path).'" class="draw-action">'.self::hidden($context,$match,'lineup_confirm').'<input type="hidden" name="team_id" value="'.self::e($team['source_team_id']).'"><input type="hidden" name="draft_id" value="'.$latest['id'].'">'.self::reason().'<button class="btn btn-success" type="submit">ยืนยันรายชื่อฉบับนี้</button></form>';
                }else{foreach($latest['players'] ?? [] as $p)$body.='<p>'.self::e($p['jersey_no'] ?? '').' · '.self::e($p['name']).' · '.($p['role']==='STARTER'?'ตัวจริง':'ตัวสำรอง').'</p>';}
                $body.='<details><summary>ประวัติรายชื่อทุกฉบับ</summary>';
                foreach($repo->lineupHistory($id,$team['source_team_id']) as $h){$body.='<p>ฉบับ '.$h['version'].' · '.($h['state']==='CONFIRMED'?'ยืนยันแล้ว':'ร่าง').' · '.self::e($h['reason']).' · '.self::e($h['actor_id']).' · '.self::e($h['created_at']).'</p><ul>';foreach($h['players'] as $p)$body.='<li>'.self::e($p['name']).' · '.($p['role']==='STARTER'?'ตัวจริง':'สำรอง').'</li>';$body.='</ul>';}
                $body.='</details></div></article>';
            }
            $body.='</div>';
        }else{$body.='<div class="result-layout"><div>';
            $latest=$repo->result($id,true);$official=$repo->result($id);$body.=self::publicResult($db,$id);
            if($latest && $latest['state']==='DRAFT')$body.='<div class="card"><div class="card-b"><h2>ร่างผล · ฉบับ '.$latest['version'].'</h2>'.self::score($latest['result']).'<p>เหตุผล: '.self::e($latest['reason']).'</p></div></div>';
            if($can && $match['started_at'] && (!$official||$actor['role']==='SUPER_ADMIN')){
                $data=$latest['result'] ?? [];$body.='<div class="card"><div class="card-b"><form method="post" action="'.self::e($workspace?MatchDetailView::url($path,$filters):$path).'" data-result-form data-knockout-tie="'.self::e($rules['config']['knockout_tie']).'">'.self::hidden($context,$match,'result_draft').'<h2>'.($official?'สร้างฉบับแก้ไขผล':'บันทึกผลการแข่งขัน').'</h2><p>เหย้า: '.self::e($teamNames[$teams['a']] ?? '').' · เยือน: '.self::e($teamNames[$teams['b']] ?? '').'</p><div class="form-grid"><label class="field">ประเภทผล<select name="type" data-result-type>';
                foreach(['NORMAL'=>'แพ้ชนะในเวลาปกติ','PENALTIES'=>'ยิงจุดโทษ','EXTRA_TIME'=>'แพ้ชนะหลังต่อเวลา'] as $key=>$label)$body.='<option value="'.$key.'" '.(($data['type'] ?? '')===$key?'selected':'').'>'.$label.'</option>';
                $body.='</select></label>';
                foreach(['goals_a'=>'ประตูเหย้าในเวลาปกติ','goals_b'=>'ประตูเยือนในเวลาปกติ','extra_a'=>'ประตูเพิ่มช่วงต่อเวลา (เหย้า)','extra_b'=>'ประตูเพิ่มช่วงต่อเวลา (เยือน)','penalties_a'=>'ยิงจุดโทษเหย้า','penalties_b'=>'ยิงจุดโทษเยือน'] as $key=>$label)$body.='<label class="field" data-score-group="'.(str_starts_with($key,'extra')?'extra':(str_starts_with($key,'penalties')?'penalties':'normal')).'">'.$label.'<input type="number" min="0" max="999" name="'.$key.'" value="'.self::e(isset($data[$key])?(string)$data[$key]:'').'" '.(str_starts_with($key,'goals')?'required':'').'></label>';
                $body.='</div><p>กรอกเฉพาะสกอร์ที่ตรงประเภทผล จุดโทษแยกจากประตูแข่งขัน การบันทึกร่างยังไม่เปลี่ยนผลสาธารณะหรือผู้ชนะเข้ารอบ</p>'.self::reason().'<button class="btn btn-primary" type="submit">บันทึกร่างผลฉบับใหม่</button></form>';
                if($confirm && $latest && $latest['state']==='DRAFT')$body.='<form method="post" action="'.self::e($workspace?MatchDetailView::url($path,$filters):$path).'" class="draw-action">'.self::hidden($context,$match,'result_confirm').'<input type="hidden" name="draft_id" value="'.$latest['id'].'">'.self::reason().'<p>การยืนยันจะอัปเดตผู้ชนะในก้างปลาและการผ่านเข้ารอบ การแก้ผลถูกปิดหากแมตช์ที่รับผู้ชนะต่อเริ่มแล้ว</p><button class="btn btn-success" type="submit">ยืนยันผลฉบับนี้</button></form>';
                $body.='</div></div>';
            }elseif(!$match['started_at'])$body.='<div class="notice">ต้องเริ่มการแข่งขันก่อนบันทึกผล</div>';
            $body.='<details class="card"><summary>ประวัติผลทุกฉบับ</summary>';
            foreach($repo->history($id) as $r)$body.='<article><h3>ฉบับ '.$r['version'].' · '.($r['state']==='CONFIRMED'?'ยืนยันแล้ว':'ร่าง').'</h3>'.self::score($r['result']).'<p>'.self::e($r['reason']).' · '.self::e($r['actor_id']).' · '.self::e($r['created_at']).'</p></article>';
            $body.='</details></div><aside><div class="card"><div class="card-h"><h3>ผลกระทบต่อขั้นตอนถัดไป</h3></div><div class="card-b"><div class="callout">บันทึกร่าง → ตรวจสอบ → ยืนยันผล → อัปเดตผู้ชนะและก้างปลา → เก็บประวัติ</div><p>ร่างผลยังไม่เปลี่ยนผลที่เผยแพร่ การแก้ผลที่ยืนยันแล้วต้องมีเหตุผลและได้รับสิทธิ์</p><p class="muted">จุดโทษแยกจากประตูในเวลาปกติและต่อเวลา</p></div></div></aside></div>';
        }
        if($workspace&&$draw)return MatchDetailView::page($body,$scope,$match,$draw,$matches->resolved($match),$matches->officialResult($match['id']),$context,$filters,$detailBase,'post');
        return Application::page($section==='lineups'?'รายชื่อผู้เล่นแมตช์':'ผลการแข่งขัน',$body,$path,$context);
    }
    public static function publicResult(\PDO $db,string $match):string
    {
        $repo=new ResultRepository($db);if(!$repo->ready())return '';$r=$repo->result($match);if(!$r)return '<div class="notice">ยังไม่มีผลการแข่งขันที่ยืนยัน</div>';
        return '<div class="card"><div class="card-b"><h2>ผลการแข่งขันที่ยืนยัน</h2>'.self::score($r['result']).'</div></div>';
    }
    private static function score(array $r):string
    {
        $extra=isset($r['extra_a'],$r['extra_b']);
        return '<p class="result-score">'.$r['total_a'].' – '.$r['total_b'].'</p>'.($extra?'<p>ในเวลาปกติ '.$r['goals_a'].' – '.$r['goals_b'].' · ประตูเพิ่มช่วงต่อเวลา '.$r['extra_a'].' – '.$r['extra_b'].'</p>':'').($r['type']==='PENALTIES'?'<p>จุดโทษ '.$r['penalties_a'].' – '.$r['penalties_b'].'</p>':'').($r['type']==='EXTRA_TIME'?'<p>ผลหลังต่อเวลาพิเศษ</p>':'');
    }
    private static function reason():string{return '<label class="field">เหตุผล *<input required name="reason" maxlength="300"></label>';}
    private static function hidden(array $context,array $m,string $op):string{return '<input type="hidden" name="_csrf" value="'.self::e($context['csrf']).'"><input type="hidden" name="request_id" value="'.EventRepository::uuid().'"><input type="hidden" name="version" value="'.$m['version'].'"><input type="hidden" name="operation" value="'.$op.'">';}
    private static function e(?string $s):string{return htmlspecialchars($s ?? '',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
}
