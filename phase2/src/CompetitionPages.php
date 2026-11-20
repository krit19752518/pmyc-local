<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class CompetitionPages
{
    public static function matches(string $path): bool
    {
        return $path==='/phase2demo/competitions'
            || (bool)preg_match('#^/phase2demo/competitions/[a-f0-9-]{36}(?:/roster|/advancement|/draw(?:/(?:setup|ceremony|result|history))?|/bracket)?$#Di',$path)
            || (bool)preg_match('#^/platform/events/[a-f0-9-]{36}/competitions(?:/new)?$#Di',$path)
            || (bool)preg_match('#^/platform/competitions/[a-f0-9-]{36}/permissions$#Di',$path);
    }

    public static function render(string $path,string $method,array $input,array $context): array
    {
        $actor=$context['actor'];
        if ($actor===null) return [403,'กรุณาเข้าสู่ระบบ'];
        if (str_starts_with($path,'/platform') && $actor['role']!=='SUPER_ADMIN') return [403,'ไม่มีสิทธิ์เข้าถึงหลังบ้านกลาง'];
        if (!in_array($method,['GET','POST'],true)) return [405,'ไม่รองรับคำขอนี้'];
        if ($method==='POST' && (!is_string($input['_csrf'] ?? null) || empty($context['csrf']) || !hash_equals($context['csrf'],$input['_csrf']))) return [403,'ไม่สามารถยืนยันคำขอได้'];
        if (!EventRepository::configured()) {
            if ($path==='/phase2demo/competitions' && $method==='GET') return Application::page('รายการที่รับผิดชอบ','<div class="context-bar">'.self::e($actor['province'] ?: 'ตามรายการที่ได้รับมอบหมาย').'</div><div class="notice">ยังไม่ได้เชื่อมข้อมูลการแข่งขัน</div>',$path,$context);
            return [503,'ยังไม่ได้เชื่อมข้อมูลการแข่งขัน'];
        }
        $db=EventRepository::connect();$repo=new CompetitionRepository($db);
        if (!$repo->ready()) return [503,'กำลังเตรียมระบบการแข่งขันย่อย กรุณาลองใหม่ภายหลัง'];
        try {
            if(preg_match('#^/phase2demo/competitions/([a-f0-9-]{36})/advancement$#Di',$path,$advance))return AdvancementPages::render($db,$advance[1],$path,$method,$input,$context);
            if (preg_match('#^/phase2demo/competitions/([a-f0-9-]{36})/(?:draw(?:/(?:setup|ceremony|result|history))?|bracket)$#Di',$path,$match)) return DrawPages::render($db,$match[1],$path,$method,$input,$context);
            if (preg_match('#^/phase2demo/competitions/([a-f0-9-]{36})/roster$#Di',$path,$match)) return RosterPages::render($db,$match[1],$path,$method,$input,$context);
            if (preg_match('#^/platform/events/([a-f0-9-]{36})/competitions(/new)?$#Di',$path,$match)) {
                $event=(new EventRepository($db))->get($match[1]);
                if (!$event) return [404,'ไม่พบรายการแข่งขัน'];
                $base='/platform/events/'.$event['id'].'/competitions';
                if ($method==='POST') {
                    if (!empty($match[2])) return [405,'ไม่รองรับคำขอนี้'];
                    $feedback=($input['_setup_feedback'] ?? null)==='1';
                    try {
                        $result=$repo->create($event['id'],$input,$actor,is_string($input['request_id'] ?? null)?$input['request_id']:'');
                        if($feedback)return self::json(['ok'=>true,'message'=>'บันทึกการตั้งค่าการแข่งขันแล้ว','competition_id'=>$result['id']]);
                        return [303,'','/phase2demo/competitions/'.$result['id']];
                    }
                    catch (\InvalidArgumentException $error) { if($feedback)return self::json(['ok'=>false,'message'=>$error->getMessage()],422);return Application::page('ตรวจข้อมูลการแข่งขัน','<div class="notice" role="alert">'.self::e($error->getMessage()).'</div>'.self::form($db,$event,$repo->divisions($event['id']),$context,$input),$path,$context,422); }
                    catch (\DomainException $error) { if($feedback)return self::json(['ok'=>false,'message'=>$error->getMessage()],409);throw $error; }
                }
                if (!empty($match[2])) return Application::page('ตั้งค่าการแข่งขัน',self::form($db,$event,$repo->divisions($event['id']),$context),$path,$context);
                $content=self::eventContext($event).'<div class="section-title"><h2>การแข่งขันย่อยตามรุ่นและพื้นที่</h2><a class="btn btn-primary" href="/phase2demo/workspace/draw-setup?event_id='.$event['id'].'">＋ ตั้งค่าการจับสลาก</a></div>'.self::cards($repo->listVisible($actor,$event['id']));
                return Application::page('จัดการการแข่งขันย่อย',$content,$path,$context);
            }
            if (preg_match('#^/platform/competitions/([a-f0-9-]{36})/permissions$#Di',$path,$match)) {
                $competition=$repo->requireAccess($match[1],$actor);
                if ($method==='POST') {
                    $repo->assign($competition['id'],$input,$actor);
                    return [303,'',$path];
                }
                return Application::page('ผู้รับผิดชอบและสิทธิ์',self::context($competition).self::permissions($repo,$competition,$context),$path,$context);
            }
            if ($method!=='GET') return [405,'ไม่รองรับคำขอนี้'];
            if ($path==='/phase2demo/competitions') {
                $body='<div class="section-title"><div><h2>การแข่งขันที่เข้าถึงได้</h2><p>'.self::e($actor['province'] ?: 'ตามรายการที่ได้รับมอบหมาย').'</p></div></div>'.self::cards($repo->listVisible($actor));
                return Application::page('รายการที่รับผิดชอบ',$body,$path,$context);
            }
            $id=basename($path);$competition=$repo->requireAccess($id,$actor);
            $assignment=$repo->assignment($id,$actor);
            $labels=['view'=>'ดูข้อมูล','import'=>'นำทีมเข้า','draw'=>'จับสลาก','schedule'=>'จัดตาราง','result'=>'บันทึกรายชื่อ / ผล'];
            $body=self::context($competition).'<div class="card"><div class="card-h"><h3>สิทธิ์ของคุณในการแข่งขันนี้</h3></div><div class="card-b"><div class="choice-row">';
            foreach ($labels as $action=>$label) if (CompetitionPolicy::can($actor,$competition,$assignment,$action)) $body.='<span class="badge b-blue">'.$label.'</span>';
            $body.='</div><div class="action-row"><a class="btn btn-primary" href="/phase2demo/competitions/'.$id.'/draw/setup">ตั้งค่าการจับสลากและตรวจทีม</a><a class="btn btn-light" href="/phase2demo/competitions/'.$id.'/draw">จับสลากและคู่แข่งขัน</a></div></div></div><div class="action-row">';
            if ($actor['role']==='SUPER_ADMIN') $body.='<a class="btn btn-primary" href="/platform/competitions/'.$id.'/permissions">จัดการผู้รับผิดชอบ</a><a class="btn btn-light" href="/platform/events/'.$competition['event_id'].'/competitions">การแข่งขันในรายการนี้</a>';
            $body.='<a class="btn btn-light" href="/phase2demo/competitions">กลับรายการที่รับผิดชอบ</a></div>';
            $body.='<div class="action-row"><a class="btn btn-primary" href="/phase2demo/competitions/'.$id.'/matches">จัดตารางและจัดการแมตช์</a></div>';
            if(class_exists(ResultRepository::class) && (new ResultRepository($db))->ready()){
                $qualified=(new ResultRepository($db))->qualifiers($id);$draw=(new DrawRepository($db))->current($id);$names=array_column($draw['slots'] ?? [],'name','source_team_id');
                $body.='<div class="card"><div class="card-b"><h3>ทีมผ่านเข้ารอบ</h3>';
                if(!$qualified)$body.='<p>รอผลการแข่งขันที่ยืนยัน</p>';
                foreach($qualified as $q)$body.='<p>ลำดับคัดเลือก '.$q['rank'].' · '.self::e($names[$q['source_team_id']] ?? '').($q['origin_kind']==='DRAW'?' · ทีมเดียวผ่านอัตโนมัติ':'').'</p>';
                $body.='</div></div>';
            }
            return Application::page('รายละเอียดการแข่งขัน',$body,$path,$context);
        } catch (\UnexpectedValueException $error) { return [403,'ไม่มีสิทธิ์เข้าถึงการแข่งขันนี้']; }
        catch (\OutOfBoundsException $error) { return [404,'ไม่พบการแข่งขัน']; }
        catch (\InvalidArgumentException $error) { return Application::page('ตรวจข้อมูลคำขอ','<div class="notice">'.self::e($error->getMessage()).'</div>',$path,$context,422); }
        catch (\DomainException $error) { return Application::page('ข้อมูลถูกเปลี่ยนแล้ว','<div class="notice">'.self::e($error->getMessage()).'</div><a class="btn btn-light" href="'.self::e($path).'">กลับไปตรวจข้อมูล</a>',$path,$context,409); }
    }

    public static function setup(\PDO $db,string $eventId,string $path,array $context,array $input=[]):array
    {
        if(($context['actor']['role'] ?? '')!=='SUPER_ADMIN')return [403,'เฉพาะผู้ดูแลระบบสูงสุด'];
        $event=(new EventRepository($db))->get($eventId);if(!$event)return [404,'ไม่พบรายการแข่งขัน'];
        $context['ui_event_id']=$eventId;
        return Application::page('ตั้งค่าการแข่งขัน',self::form($db,$event,(new CompetitionRepository($db))->divisions($eventId),$context,$input),$path,$context);
    }
    private static function form(\PDO $db,array $event,array $divisions,array $context,array $input=[]): string
    {
        $stage=is_scalar($input['stage'] ?? null)?(string)$input['stage']:'1';$province=is_string($input['province'] ?? null)?$input['province']:'';
        $request=EventRepository::validUuid($input['request_id'] ?? null)?$input['request_id']:EventRepository::uuid();
        $format=$event['template_version_id']==='round-robin-v1'?'พบกันหมด 1 เลก':'แพ้คัดออก';
        $registered=(new RegistrationAdapter($db))->existingAreas($event['is_test'],array_column($divisions,'code'),$event['season_id']);$areas=[];
        foreach($divisions as $division)$areas[$division['id']]=['1'=>$registered[$division['code']] ?: new \stdClass(),'2'=>new \stdClass()];
        $sources=$db->prepare("SELECT division_id,province FROM p2_competition WHERE event_id=? AND stage=1 AND status<>'ARCHIVED' ORDER BY province");$sources->execute([$event['id']]);
        foreach($sources->fetchAll() as $source)if(isset($areas[$source['division_id']])&&isset(AreaDirectory::districts()[$source['province']])){$areas[$source['division_id']]['2']=(array)$areas[$source['division_id']]['2'];$areas[$source['division_id']]['2'][$source['province']]=[];}
        $selection=$input['division_id'] ?? '';if(!is_string($selection))$selection='';$visible=(array)($areas[$selection][$stage] ?? []);

        $html='<form class="card competition-setup" method="post" action="/platform/events/'.$event['id'].'/competitions" data-competition-form data-setup-submit data-existing-areas="'.self::e(json_encode($areas,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)).'"><div class="card-b"><p class="setup-event-name">'.self::e($event['name']).' <span class="badge '.($event['is_test']?'b-amber':'b-green').'">'.($event['is_test']?'ข้อมูล Demo':'ข้อมูลจริง').'</span></p><input type="hidden" name="_csrf" value="'.self::e($context['csrf']).'"><input type="hidden" name="request_id" value="'.$request.'"><input type="hidden" name="zone" data-zone value=""><div class="form-grid">';
        $html.='<label class="field">ฤดูกาล *<select class="select" disabled aria-label="ฤดูกาล"><option>'.self::e($event['season']).'</option></select></label>';
        $html.='<label class="field">รุ่นอายุ *<select class="select" required name="division_id" data-division><option value="">เลือกรุ่นในรายการ</option>';
        foreach($divisions as $division)$html.='<option data-code="'.$division['code'].'" value="'.$division['id'].'" '.(($input['division_id'] ?? '')===$division['id']?'selected':'').'>'.self::e(EventDraft::DIVISIONS[$division['code']] ?? $division['code']).'</option>';
        $html.='</select></label><label class="field">Stage *<select class="select" required name="stage" data-stage>';
        foreach([1=>'Stage 1 อำเภอ',2=>'Stage 2 จังหวัด',3=>'Stage 3 โซน · รอยืนยันกติกา',4=>'Stage 4 ประเทศ · รอยืนยันกติกา'] as $key=>$label)$html.='<option value="'.$key.'" '.($stage===(string)$key?'selected':'').($key>2?' disabled':'').'>'.$label.'</option>';
        $html.='</select></label><div class="field"><span>พื้นที่ *</span><div class="setup-area"><select class="select" name="province" data-province required aria-label="จังหวัด"><option value="">เลือกจังหวัด</option>';
        foreach(array_keys($visible) as $name)$html.='<option '.($province===$name?'selected':'').'>'.self::e($name).'</option>';
        $html.='</select><select class="select" name="district" data-district aria-label="อำเภอ / เขต"><option value="">เลือกอำเภอ / เขต</option>';
        foreach($visible[$province] ?? [] as $name)$html.='<option '.(($input['district'] ?? '')===$name?'selected':'').'>'.self::e($name).'</option>';
        $html.='</select></div></div><label class="field">รูปแบบการแข่งขัน *<select class="select" disabled aria-label="รูปแบบการแข่งขัน"><option>'.self::e($format).'</option></select></label><label class="field">สถานะ<select class="select" disabled aria-label="สถานะ"><option>ร่าง</option></select></label></div><p class="muted">แสดงเฉพาะพื้นที่ที่มีข้อมูลของรุ่นและประเภทจริง/Demo ที่เลือก: Stage 1 ใช้ทีมลงทะเบียน (หญิงเริ่มจังหวัด/ชายเริ่มอำเภอ) ส่วน Stage 2 ใช้ทีมผ่านรอบอำเภอของชาย การแข่งขันใหม่บันทึกเป็นร่างก่อนตรวจรายชื่อและจับสลาก</p><noscript><p class="notice">กรุณาเปิด JavaScript เพื่อเลือกรุ่น จังหวัดและอำเภอจากข้อมูลในระบบ</p></noscript><div class="action-row"><button class="btn btn-primary" type="submit" data-setup-save>บันทึก</button></div></div></form>';
        return $html.'<dialog class="setup-feedback" data-setup-feedback aria-labelledby="setup-feedback-title"><div class="card-b"><div class="setup-feedback-icon" aria-hidden="true">✓</div><h2 id="setup-feedback-title" data-feedback-title>บันทึกสำเร็จ</h2><p data-feedback-message>บันทึกการตั้งค่าการแข่งขันแล้ว</p><button class="btn btn-primary" type="button" data-feedback-close>ปิด</button></div></dialog>';
    }
    private static function json(array $payload,int $status=200):array{return [$status,json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),null,'application/json'];}
    private static function permissions(CompetitionRepository $repo,array $competition,array $context): string
    {
        $accounts=$repo->accounts();$byKey=[];foreach ($accounts as $account) $byKey[$account['account_key']]=$account;
        $assigned=[];$body='<div class="card"><div class="card-h"><h3>บทบาทและสิทธิ์การใช้งาน</h3></div><div class="table-wrap"><table><thead><tr><th>ผู้รับผิดชอบ</th><th>บทบาท / พื้นที่</th><th>ดูข้อมูล</th><th>นำทีมเข้า</th><th>จับสลาก</th><th>จัดตาราง</th><th>บันทึกผล</th></tr></thead><tbody>';
        foreach($repo->assignments($competition['id']) as $a){$key=($a['actor_role']==='SAT_OFFICER'?'sat:':'admin:').$a['actor_id'];$account=$byKey[$key] ?? ['fullname'=>$a['actor_id'],'province'=>null];$rights=json_decode($a['permissions'],true);$body.='<tr><td>'.self::e($account['fullname']).'</td><td>'.($a['actor_role']==='SAT_OFFICER'?'กกท. '.self::e($account['province'] ?? ''):'เจ้าหน้าที่ตรวจเอกสาร').'</td>';foreach(['view','import','draw','schedule','result'] as $right)$body.='<td>'.($a['active']&&in_array($right,$rights,true)?'✓':'—').'</td>';$body.='</tr>';}
        $body.='</tbody></table></div></div>';
        foreach ($repo->assignments($competition['id']) as $assignment) {
            $key=($assignment['actor_role']==='SAT_OFFICER'?'sat:':'admin:').$assignment['actor_id'];$assigned[]=$key;
            $account=$byKey[$key] ?? ['account_key'=>$key,'fullname'=>$assignment['actor_id'],'role'=>$assignment['actor_role'],'province'=>null];
            $body.='<div class="card"><div class="card-h"><h3>'.self::e($account['fullname']).'</h3><span class="badge '.($assignment['active']?'b-green':'b-amber').'">'.($assignment['active']?'ใช้งาน':'เพิกถอนแล้ว').'</span></div><div class="card-b">'.self::assignmentForm($competition,$context,[$account],$assignment).'</div></div>';
        }
        $available=array_values(array_filter($accounts,fn($account)=>!in_array($account['account_key'],$assigned,true) && ($account['role']!=='SAT_OFFICER' || in_array((int)$competition['stage'],[1,2],true) && $account['province']===$competition['province'])));
        $body.='<div class="card"><div class="card-h"><h3>เพิ่มผู้รับผิดชอบ</h3></div><div class="card-b">'.($available?self::assignmentForm($competition,$context,$available):'<p>ไม่มีบัญชีที่เพิ่มได้ในพื้นที่นี้</p>').'</div></div><p class="muted">ใช้บัญชีจากระบบลงทะเบียนเดิม เจ้าหน้าที่ตรวจเอกสารดูข้อมูลได้เท่านั้น เจ้าหน้าที่จังหวัดต้องมีจังหวัดตรงกับ Competition และต้องได้รับสิทธิ์แต่ละงานอย่างชัดเจน</p>';
        return $body;
    }

    private static function assignmentForm(array $competition,array $context,array $accounts,?array $assignment=null): string
    {
        $html='<form method="post" action="/platform/competitions/'.$competition['id'].'/permissions" data-assignment-form><input type="hidden" name="_csrf" value="'.self::e($context['csrf']).'"><input type="hidden" name="request_id" value="'.EventRepository::uuid().'"><input type="hidden" name="version" value="'.(int)($assignment['version'] ?? 0).'"><label class="field">บัญชีผู้รับผิดชอบ<select name="account_key" required data-account>';
        foreach ($accounts as $account) $html.='<option value="'.self::e($account['account_key']).'" data-role="'.$account['role'].'">'.self::e($account['fullname'].' · '.($account['role']==='SAT_OFFICER'?'กกท. '.$account['province']:'เจ้าหน้าที่ตรวจเอกสาร')).'</option>';
        $html.='</select></label><fieldset><legend>สิทธิ์ใน Competition นี้</legend><div class="choice-row">';
        $selected=$assignment?json_decode($assignment['permissions'],true):['view'];
        foreach (['view'=>'ดูข้อมูล','import'=>'นำทีมเข้า','draw'=>'จับสลาก','schedule'=>'จัดตาราง','result'=>'บันทึกรายชื่อ / ผล'] as $key=>$label) $html.='<label class="choice"><input type="checkbox" name="permissions[]" value="'.$key.'" '.($key==='view'?'required ':'').(in_array($key,$selected,true)?'checked':'').'> '.$label.'</label>';
        $html.='</div></fieldset><label class="field">เหตุผลในการมอบหมายหรือเปลี่ยนสิทธิ์ *<input name="reason" required maxlength="300"></label><div class="action-row"><button class="btn btn-success" name="operation" value="grant">'.($assignment?'บันทึกสิทธิ์':'เพิ่มผู้รับผิดชอบ').'</button>';
        if ($assignment && $assignment['active']) $html.='<button class="btn btn-danger" name="operation" value="revoke">เพิกถอนสิทธิ์</button>';
        return $html.'</div></form>';
    }

    private static function cards(array $competitions): string
    {
        if (!$competitions) return '<div class="card"><div class="card-b empty"><h2>ยังไม่มีการแข่งขันในขอบเขตนี้</h2><p>การแข่งขันจะแสดงเมื่อสร้างและมอบหมายผู้รับผิดชอบแล้ว</p></div></div>';
        $body='';foreach ($competitions as $competition) $body.='<article class="card"><div class="card-b">'.self::context($competition).'<a class="btn btn-primary" href="/phase2demo/competitions/'.$competition['id'].'">เปิดการแข่งขัน</a></div></article>';
        return $body;
    }
    private static function context(array $competition): string { return Ui::context($competition); }
    private static function eventContext(array $event): string { return Ui::context($event); }
    private static function e(mixed $value): string { return htmlspecialchars(is_string($value)?$value:'',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
}
