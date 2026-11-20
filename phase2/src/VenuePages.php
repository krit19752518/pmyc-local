<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** Shared venue master: the existing repository owns validation, transactions and audit. */
final class VenuePages
{
    public static function render(string $method,array $input,array $context,array $query,\PDO $db):array
    {
        $actor=$context['actor'] ?? [];
        if(($actor['role'] ?? '')!=='SUPER_ADMIN')return [403,'ไม่มีสิทธิ์จัดการสนามแข่งขัน'];
        if(!in_array($method,['GET','POST'],true))return [405,'ไม่รองรับคำขอนี้'];
        if($method==='POST'&&(!is_string($input['_csrf'] ?? null)||empty($context['csrf'])||!hash_equals($context['csrf'],$input['_csrf'])))return [403,'ไม่สามารถยืนยันคำขอได้'];
        try{$filters=DashboardReadModel::query($query,$actor);}
        catch(\InvalidArgumentException $e){return WorkspaceView::page('venues','<div class="notice" role="alert">'.WorkspaceView::e($e->getMessage()).'</div>',$context,[],422);}
        $repo=new MatchRepository($db);$error='';$status=200;
        $values=['name'=>'','province'=>'','district'=>''];
        $request=EventRepository::uuid();
        if($method==='POST'){
            foreach($values as $key=>$_)$values[$key]=is_string($input[$key] ?? null)?$input[$key]:'';
            if(EventRepository::validUuid($input['request_id'] ?? null))$request=$input['request_id'];
            try{$repo->createVenue($input,$actor);$url=WorkspaceView::url('venues',$filters);return [303,'',$url.(str_contains($url,'?')?'&':'?').'saved=1'];}
            catch(\InvalidArgumentException $e){$error=$e->getMessage();$status=422;}
            catch(\DomainException $e){$error=$e->getMessage();$status=409;}
        }
        $e=fn(mixed $value)=>WorkspaceView::e($value);
        $areas=AreaDirectory::districts();$action=WorkspaceView::url('venues',$filters);
        $body=WorkspaceView::heading('จัดการสนามแข่งขัน','เพิ่มสนามเพื่อเลือกใช้ในหน้ากำหนดการแข่งขัน','<a class="btn" href="'.$e(WorkspaceView::url('schedule',$filters)).'">กลับตารางการแข่งขัน</a>','VENUE MANAGEMENT');
        $body.='<div class="venue-management"><p class="notice">สนามเป็นข้อมูลกลาง ใช้ซ้ำได้ทั้งรายการจริงและ Demo โดย dropdown สนามจะแสดงตามจังหวัดของการแข่งขัน</p>';
        if($error!=='')$body.='<div class="notice" role="alert">'.$e($error).'</div>';
        elseif($method==='GET'&&($query['saved'] ?? null)==='1')$body.='<div class="notice" role="status">บันทึกสนามแข่งขันเรียบร้อยแล้ว สามารถเลือกสนามในหน้ากำหนดการแข่งขันของจังหวัดนั้นได้</div>';
        $body.='<section class="card"><div class="card-head"><h2>เพิ่มสนามแข่งขัน</h2></div><div class="card-b"><form method="post" action="'.$e($action).'" data-venue-form><input type="hidden" name="_csrf" value="'.$e($context['csrf']).'"><input type="hidden" name="request_id" value="'.$e($request).'"><div class="form-grid"><label class="field">ชื่อสนาม<input required name="name" maxlength="150" placeholder="กรอกชื่อสนามแข่งขัน" value="'.$e($values['name']).'"></label><label class="field">จังหวัด<select name="province" data-province required><option value="">เลือกจังหวัด</option>';
        foreach(array_keys($areas) as $province)$body.='<option value="'.$e($province).'"'.($values['province']===$province?' selected':'').'>'.$e($province).'</option>';
        $body.='</select></label><label class="field">อำเภอ / เขต<select name="district" data-district required><option value="">เลือกอำเภอ</option>';
        foreach($areas[$values['province']] ?? [] as $district)$body.='<option value="'.$e($district).'"'.($values['district']===$district?' selected':'').'>'.$e($district).'</option>';
        $body.='</select></label></div><p>กรอกข้อมูลให้ครบทั้ง 3 ช่อง ระบบจะสร้างรหัสสนาม ผู้สร้าง วันเวลาสร้าง และบันทึกประวัติให้อัตโนมัติ ชื่อสนามต้องไม่ซ้ำในอำเภอเดียวกัน</p><button class="btn primary" type="submit">บันทึกสนามแข่งขัน</button></form></div></section>';
        $venues=$repo->venues();
        $body.='<section class="card"><div class="card-head"><h2>รายการสนามแข่งขัน</h2><span class="badge">'.count($venues).' สนาม</span></div><div class="table-wrap"><table><thead><tr><th scope="col">ชื่อสนาม</th><th scope="col">จังหวัด</th><th scope="col">อำเภอ / เขต</th></tr></thead><tbody>';
        foreach($venues as $venue)$body.='<tr><td>'.$e($venue['name']).'</td><td>'.$e($venue['province']).'</td><td>'.$e($venue['district']).'</td></tr>';
        if(!$venues)$body.='<tr><td colspan="3" class="empty">ยังไม่มีสนามแข่งขัน กรุณาเพิ่มสนามด้านบน</td></tr>';
        $body.='</tbody></table></div></section></div>';
        return WorkspaceView::page('venues',$body,$context,$filters,$status);
    }
}
