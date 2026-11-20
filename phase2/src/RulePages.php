<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class RulePages
{
    public static function matches(string $path):bool{return (bool)preg_match('#^/platform/events/[a-f0-9-]{36}/rules$#Di',$path);}
    public static function render(string $path,string $method,array $input,array $context):array
    {
        $actor=$context['actor'];if(($actor['role'] ?? '')!=='SUPER_ADMIN')return [403,'เฉพาะผู้ดูแลระบบสูงสุด'];
        if(!in_array($method,['GET','POST'],true))return [405,'ไม่รองรับคำขอนี้'];
        if($method==='POST'&&(!is_string($input['_csrf'] ?? null)||empty($context['csrf'])||!hash_equals($context['csrf'],$input['_csrf'])))return [403,'ไม่สามารถยืนยันคำขอได้'];
        if(!EventRepository::configured())return [503,'ยังไม่ได้เชื่อมข้อมูล'];$db=EventRepository::connect();$repo=new RuleRepository($db);if(!$repo->ready())return [503,'ยังไม่ได้ติดตั้งระบบกติกา'];
        preg_match('#/events/([a-f0-9-]{36})/#Di',$path,$m);$event=(new EventRepository($db))->get($m[1]);if(!$event)return [404,'ไม่พบรายการ'];
        try{
            if($method==='POST'){$repo->approve($event['id'],$actor,$input);return [303,'',$path];}
            $current=$repo->current($event['id']);$config=$current['config'] ?? (($event['template_version_id'] ?? '')==='pmyc-four-stage-v1'?EventRules::PMYC_CONFIRMED:[]);
            $body='<div class="context-bar">'.self::e($event['name']).' · '.($event['is_test']?'ข้อมูล Demo':'ข้อมูลจริง').'</div><div class="card"><div class="card-b"><h2>กติกาของรายการ · ฉบับ '.($current['version'] ?? 'ยังไม่ยืนยัน').'</h2><p>PMYC ใช้เจ้าหน้าที่บันทึกและ Super Admin ยืนยัน ส่วน Stage 1–2 ถ้าเสมอให้ต่อเวลาก่อนยิงจุดโทษตามข้อตกลงที่ยืนยันแล้ว รายการใหม่ยังต้องบันทึกการอนุมัติพร้อมข้อกำหนดรายชื่อ การบันทึกคือการยืนยันโดย Super Admin และจะเปลี่ยนไม่ได้เมื่อมีแมตช์เริ่มแล้ว</p><form method="post" action="'.self::e($path).'"><input type="hidden" name="_csrf" value="'.self::e($context['csrf']).'"><input type="hidden" name="request_id" value="'.EventRepository::uuid().'"><input type="hidden" name="version" value="'.($current['version'] ?? 0).'"><div class="form-grid">';
            $body.=self::select('confirmation','ผู้ยืนยัน lineup และผล',['SUPER_ADMIN'=>'Super Admin เท่านั้น','RESULT_ASSIGNEES'=>'ผู้ได้รับสิทธิ์ result ในการแข่งขัน'],$config['confirmation'] ?? '');
            $body.=self::select('knockout_tie','ผลเสมอ Stage 1–2 รอบแพ้คัดออก',['PENALTIES'=>'ยิงจุดโทษทันที','EXTRA_TIME'=>'ต่อเวลา แล้วจึงยิงจุดโทษ','PENDING'=>'รอยืนยัน ยังไม่เริ่มการแข่งขัน'],$config['knockout_tie'] ?? '');
            $body.=self::select('lineup_required','ต้องยืนยันรายชื่อก่อนเริ่ม',['yes'=>'ต้องยืนยันทั้งสองทีม','no'=>'ไม่บังคับก่อนเริ่ม'],isset($config['lineup_required'])?($config['lineup_required']?'yes':'no'):'');
            foreach(['starters'=>'จำนวนตัวจริง','bench_max'=>'ตัวสำรองสูงสุด'] as $key=>$label)$body.='<label class="field">'.$label.'<input type="number" name="'.$key.'" min="'.($key==='starters'?1:0).'" max="99" value="'.self::e(isset($config[$key])?(string)$config[$key]:'').'"></label>';
            $body.='<label class="field">เหตุผลยืนยัน *<input required maxlength="300" name="reason"></label></div><p>หากบังคับ lineup ต้องระบุจำนวนผู้เล่นให้ครบ หากยังไม่ตกลงผลเสมอ เลือก “รอยืนยัน” ระหว่างเตรียมงานได้ แต่ต้องตัดสินก่อนเริ่มแมตช์ ผลชนะบาย/วอล์กโอเวอร์, วินัย, tie-break, ออลสตาร์ และ seeding ยังไม่เปิดใช้จนกติกาส่วนนั้นได้รับการยืนยัน</p><button class="btn btn-success" type="submit">ยืนยันกติกาของรายการ</button></form></div></div>';
            $body.='<details class="card"><summary>ประวัติกติกาทุกฉบับ</summary><ul>';
            foreach($repo->history($event['id']) as $r)$body.='<li>ฉบับ '.$r['version'].' · '.($r['config']['confirmation']==='SUPER_ADMIN'?'Super Admin ยืนยัน':'ผู้มีสิทธิ์ผลยืนยัน').' · '.self::e($r['reason']).' · '.self::e($r['actor_id']).' · '.self::e($r['created_at']).'</li>';
            return Application::page('กติกาและผู้ยืนยันผล',$body.'</ul></details>',$path,$context);
        }catch(\InvalidArgumentException $e){return Application::page('ตรวจข้อมูลกติกา','<div class="notice">'.self::e($e->getMessage()).'</div><a href="'.self::e($path).'">กลับไปตรวจข้อมูล</a>',$path,$context,422);}
        catch(\DomainException $e){return Application::page('กติกาไม่สามารถเปลี่ยนได้','<div class="notice">'.self::e($e->getMessage()).'</div>',$path,$context,409);}
    }
    private static function select(string $name,string $label,array $choices,string $value):string{$html='<label class="field">'.$label.' *<select required name="'.$name.'"><option value="">กรุณาเลือก</option>';foreach($choices as $key=>$text)$html.='<option value="'.$key.'" '.($value===$key?'selected':'').'>'.$text.'</option>';return $html.'</select></label>';}
    private static function e(?string $s):string{return htmlspecialchars($s ?? '',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
}
