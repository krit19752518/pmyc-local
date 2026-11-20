<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class RosterPages
{
    public static function render(\PDO $db,string $id,string $path,string $method,array $input,array $context): array
    {
        $repo=new CompetitionRepository($db);$actor=$context['actor'];$scope=$repo->requireAccess($id,$actor);$rosters=new RosterRepository($db);
        if(!$rosters->ready())return [503,'ยังไม่ได้ติดตั้งระบบรายชื่อแข่งขัน'];
        if($method==='POST'){$rosters->save($id,$actor,$input);return [303,'',$path];}
        $context['ui_scope']=$scope;$action='/phase2demo/competitions/'.$id.'/roster';
        $female=($scope['division_code'] ?? '')==='U18_GIRL';
        $current=$rosters->current($id);$can=CompetitionPolicy::can($actor,$scope,$repo->assignment($id,$actor),'import');$locked=$current['locked'] ?? false;if($female)$can=false;
        $body=self::picker($repo->listVisible($actor,$scope['event_id']),$scope['event_id'],$id).Ui::context($scope).'<div class="notice">'.($female?'ทีมหญิงรวมทุกอำเภอในจังหวัด · รอสรุปจำนวนทีมและรูปแบบจับสลากก่อนนำเข้า/ล็อกเพื่อสร้างคู่จริง':((int)$scope['stage']===1?'ทีมมาจากระบบลงทะเบียนที่อนุมัติทีมแล้ว และนักกีฬาทุกคนในรุ่นที่เลือกได้รับอนุมัติครบ แสดงไม่เกิน 8 ทีมแรกตามเวลาสมัคร แยกตามจังหวัดและเขต/อำเภอของการแข่งขัน':'Stage 2 ใช้ทีมผ่านเข้ารอบจากการแข่งขันอำเภอในรายการนี้')).'</div>';
        $candidates=$can&&(int)$scope['stage']===1&&!$locked?(new RegistrationAdapter($db))->candidates($scope):($current['teams'] ?? []);$selected=array_column($current['teams'] ?? [],'source_team_id');
        if($female&&(int)$scope['stage']===1&&$scope['district']===null)$candidates=(new RegistrationAdapter($db))->candidates($scope);
        $editable=$can&&(int)$scope['stage']===1&&!$locked;
        $body.='<div class="card participants-card"><div class="card-h"><h3>'.self::e(EventDraft::DIVISIONS[$scope['division_code']]).' · '.self::e($scope['district'] ?? $scope['province']).' · '.count($candidates).' ทีม</h3>'.($editable?'<button class="btn btn-primary" type="submit" form="participants-lock" data-participants-lock '.(!$current?'disabled title="บันทึกรายชื่อก่อนล็อก"':'').'>ล็อกรายชื่อ</button>':'<span class="badge '.($locked?'b-green':'b-amber').'">'.($locked?'ล็อกรายชื่อแล้ว':'รายชื่อทีมแข่งขัน').'</span>').'</div>';
        if($editable)$body.='<form method="post" action="'.self::e($action).'" data-participants-form data-saved-teams="'.self::e(json_encode($selected,JSON_THROW_ON_ERROR)).'">'.self::hidden($context,$current,'import');
        $body.='<div class="table-wrap"><table><thead><tr>'.($editable?'<th>เลือก</th>':'').'<th>#</th><th>ทีม</th><th>จังหวัด</th><th>เขต/อำเภอ</th><th>สถานะ</th></tr></thead><tbody>';
        foreach($candidates as $i=>$team){$body.='<tr>'.($editable?'<td><input aria-label="เลือก '.self::e($team['name']).'" type="checkbox" name="teams[]" value="'.self::e($team['source_team_id']).'" '.((!$current||in_array($team['source_team_id'],$selected,true))?'checked':'').'></td>':'').'<td>'.($i+1).'</td><td>'.Ui::team($team['name']).'<details><summary>ดูรายชื่อ ('.count($team['players']).' คน)</summary><ul>';foreach($team['players'] as $p)$body.='<li>'.self::e($p['jersey_no'] ?? '').' · '.self::e($p['name']).'</li>';foreach($team['officials'] as $p)$body.='<li>'.self::e($p['role'] ?? '').' · '.self::e($p['name']).'</li>';$body.='</ul></details></td><td>'.self::e($scope['province']).'</td><td>'.self::e($team['district'] ?? $scope['district'] ?? '—').'</td><td><span class="badge b-green">'.($locked?'ล็อกแล้ว':'มีสิทธิ์').'</span></td></tr>';}
        if(!$candidates)$body.='<tr><td colspan="'.($editable?6:5).'" class="empty">'.((int)$scope['stage']===1?'ยังไม่มีทีมที่อนุมัติทีมและนักกีฬาครบทุกคนในรุ่นและเขต/อำเภอที่เลือก':'ยังไม่มีรายชื่อทีมผ่านเข้ารอบ').'</td></tr>';$body.='</tbody></table></div>';
        if($editable)$body.='<div class="card-b"><p class="muted">คัดจาก 8 ทีมแรกที่ผ่านเกณฑ์ตามเวลาสมัคร เลือก 1–8 ทีม แล้วบันทึกเพื่อตรวจรายชื่อก่อนล็อก</p><button class="btn btn-primary" type="submit">บันทึกรายชื่อฉบับใหม่</button></div></form>';
        $body.='</div>';
        if($current){$body.='<p class="muted">รายชื่อฉบับ '.$current['version'].' · '.count($current['teams']).' ทีม</p>';if($locked)$body.='<div class="notice">เก็บรายชื่อฉบับนี้เป็นประวัติ การแก้ข้อมูลสมัครภายหลังไม่เปลี่ยนรายชื่อแข่งขัน'.(count($current['teams'])===1?' · ทีมเดียวผ่านเข้ารอบอัตโนมัติเมื่อเผยแพร่ผลจับสลาก':'').'</div>';elseif($editable){$body.='<form method="post" action="'.self::e($action).'" id="participants-lock" class="card"><div class="card-h"><h3>ยืนยันรายชื่อทีมเข้าร่วม</h3></div><div class="card-b">'.self::hidden($context,$current,'lock');foreach($selected as $team)$body.='<input type="hidden" name="teams[]" value="'.self::e($team).'">';$body.='<p>บันทึกไว้ '.count($selected).' ทีม ตรวจข้อมูลให้ครบก่อนล็อก การล็อกจะตรวจข้อมูลต้นทางซ้ำอีกครั้ง</p><button class="btn btn-success" type="submit" data-participants-lock>ยืนยันล็อกรายชื่อแข่งขัน</button></div></form>';}}
        if((int)$scope['stage']===2&&$can&&!$locked)$body.='<a class="btn btn-primary" href="/phase2demo/competitions/'.$id.'/advancement">นำทีมผ่านจากรอบอำเภอและล็อกรายชื่อ</a>';
        $body.='<div class="action-row"><a class="btn btn-light" href="/phase2demo/competitions/'.$id.'">กลับรายละเอียดการแข่งขัน</a>';if(!$female&&$locked)$body.='<a class="btn btn-yellow" href="/phase2demo/competitions/'.$id.'/draw/setup">ไปจับสลากและสร้างคู่แข่งขัน</a>';return Application::page('จัดการทีมเข้าร่วม',$body.'</div>',$path,$context);
    }
    public static function picker(array $scopes,?string $eventId=null,?string $selected=null):string
    {
        $html='<form class="card participants-picker" method="get" action="/phase2demo/workspace/participants"><div class="card-b">';
        if($eventId)$html.='<input type="hidden" name="event_id" value="'.self::e($eventId).'">';
        $html.='<label class="field">เขต/อำเภอและรุ่นแข่งขัน<select class="select" name="competition_id" required><option value="">เลือกพื้นที่และรุ่นแข่งขัน</option>';
        $groups=[];foreach($scopes as $scope){if(!in_array((int)$scope['stage'],[1,2],true))continue;$groups[$scope['province'].' · '.($scope['district'] ?: 'ระดับจังหวัด')][]=$scope;}
        ksort($groups);foreach($groups as $area=>$rows){$html.='<optgroup label="'.self::e($area).'">';foreach($rows as $scope)$html.='<option value="'.$scope['id'].'" '.($selected===$scope['id']?'selected':'').'>'.self::e(EventDraft::DIVISIONS[$scope['division_code']].' · Stage '.$scope['stage'].' · '.$scope['event_name'].' · '.$scope['season'].' · '.($scope['is_test']?'Demo':'ข้อมูลจริง')).'</option>';$html.='</optgroup>';}
        return $html.'</select></label><button class="btn btn-primary" type="submit">แสดงทีม</button></div></form>';
    }
    private static function hidden(array $context,?array $current,string $operation): string
    {
        return '<input type="hidden" name="_csrf" value="'.self::e($context['csrf']).'"><input type="hidden" name="request_id" value="'.EventRepository::uuid().'"><input type="hidden" name="version" value="'.($current['version'] ?? 0).'"><input type="hidden" name="operation" value="'.$operation.'">';
    }
    private static function e(?string $v): string { return htmlspecialchars($v ?? '',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
}
