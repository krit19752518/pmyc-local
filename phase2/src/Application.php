<?php
declare(strict_types=1);

namespace PMYC\Phase2;

require_once __DIR__.'/Ui.php';
require_once __DIR__.'/DashboardPages.php';
require_once __DIR__.'/DrawSetupPages.php';
require_once __DIR__.'/CeremonyPages.php';
require_once __DIR__.'/BracketPages.php';
require_once __DIR__.'/SchedulePages.php';
require_once __DIR__.'/WorkspacePages.php';
require_once __DIR__.'/PublicTeamPages.php';

final class Application
{
    public static function render(string $path, string $method, array $query, array $input, array $context, ?EventRepository $repository = null): array
    {
        $actor = $context['actor'];
        $isSuper = ($actor['role'] ?? null) === 'SUPER_ADMIN';
        if(in_array($path,['/phase2demo','/phase2demo/'],true)){
            if($method!=='GET')return [405,'ไม่รองรับการทำรายการนี้'];
            // Explicit public views (and anonymous legacy mode links) remain public.
            $public=array_key_exists('view',$query)||(!$actor&&array_key_exists('mode',$query));
            if(!$public){
                if(!$actor)return [302,'','/phase2demo/login'];
                if(!in_array($actor['role'] ?? '',['SUPER_ADMIN','DOCUMENT_VERIFIER','SAT_OFFICER'],true))return [403,'ไม่มีสิทธิ์เข้าถึงระบบจัดการแข่งขัน'];
                try{
                    if(array_key_exists('mode',$query)){
                        if(!is_string($query['mode'])||!in_array($query['mode'],['real','demo'],true)
                            ||(isset($query['data_mode'])&&$query['data_mode']!==$query['mode']))throw new \InvalidArgumentException('ประเภทข้อมูลไม่ถูกต้อง');
                        $query['data_mode']=$query['mode'];
                    }
                    $filters=DashboardReadModel::query($query,$actor);
                    // Keep validated context for destination authorization; omit dashboard_filters so entry starts blank.
                    return [302,'',WorkspaceView::url('dashboard',$filters)];
                }catch(\InvalidArgumentException $error){return [400,$error->getMessage()];}
                catch(\UnexpectedValueException $error){return [403,$error->getMessage()];}
            }
        }

        if (str_starts_with($path, '/platform') && !$isSuper) {
            return [403, 'ไม่มีสิทธิ์เข้าถึงหลังบ้านกลาง'];
        }
        if($path===CeremonyPages::PATH)return CeremonyPages::render($method,$query,$input,$context);
        if($path===CeremonyPages::RESULT_PATH)return CeremonyPages::render($method,$query,$input,$context,view:'result');
        if($path===CeremonyPages::HISTORY_PATH)return CeremonyPages::render($method,$query,$input,$context,view:'history');
        if($path===BracketPages::PATH)return BracketPages::render($method,$query,$context);
        if($path===SchedulePages::PATH)return SchedulePages::render($method,$query,$input,$context);
        if(DashboardPages::matches($path))return DashboardPages::render($path,$method,$query,$context);
        if(PublicTeamPages::matches($path))return PublicTeamPages::render($path,$method,$query,$context);
        if($path===DrawSetupPages::PATH)return DrawSetupPages::render($path,$method,$query,$input,$context);
        if(WorkspacePages::matches($path))return WorkspacePages::render($path,$method,$query,$context);
        if(class_exists(RulePages::class) && RulePages::matches($path))return RulePages::render($path,$method,$input,$context);
        if (class_exists(MatchPages::class) && MatchPages::matches($path)) return MatchPages::render($path,$method,$input,$context,$query);
        if (class_exists(CompetitionPages::class) && CompetitionPages::matches($path)) return CompetitionPages::render($path,$method,$input,$context);
        $routes = ['/phase2demo', '/phase2demo/', '/phase2demo/login', '/phase2demo/competitions', '/platform', '/platform/', '/platform/templates', '/platform/events/new', '/platform/events/preview', '/platform/events'];
        $eventRoute = preg_match('#^/platform/events/([a-f0-9-]{36})(/clone)?$#Di', $path, $eventMatch);
        if (!in_array($path, $routes, true) && !$eventRoute) return [404, 'ไม่พบหน้าที่ต้องการ'];
        if ($path === '/phase2demo/competitions' && $actor === null) return [403, 'กรุณาเข้าสู่ระบบ'];
        if ($method === 'POST' && !in_array($path, ['/platform/events/preview','/platform/events'], true)) return [405, 'ไม่รองรับการทำรายการนี้'];
        if ($path === '/platform/events' && $method !== 'POST') return [405, 'กรุณาสร้างรายการผ่านแบบฟอร์ม'];
        if ($path === '/platform/events/preview' && $method !== 'POST') return [405, 'กรุณาตรวจรายการผ่านแบบฟอร์ม'];
        if ($method === 'POST' && (!is_string($input['_csrf'] ?? null) || !is_string($context['csrf'] ?? null)
            || $context['csrf'] === '' || !hash_equals($context['csrf'], $input['_csrf']))) return [403, 'ไม่สามารถยืนยันคำขอได้'];
        $title = 'ตารางการแข่งขัน';
        $content = '';
        $status = 200;
        $availability='ยังไม่สามารถบันทึกรายการแข่งขันได้ เนื่องจากระบบยังไม่ได้เชื่อมต่อฐานข้อมูลรายการแข่งขัน';
        if ($isSuper && str_starts_with($path, '/platform')) {
            try {
                if (EventRepository::configured()) $repository ??= new EventRepository(EventRepository::connect());
                if ($repository !== null && !$repository->creationReady()) {
                    $repository=null;
                    $availability='ยังไม่สามารถบันทึกรายการแข่งขันได้ เนื่องจากตารางหรือเทมเพลทรายการแข่งขันยังไม่พร้อม กรุณาแจ้งผู้ดูแลระบบ';
                }
            } catch (\PDOException $error) {
                $repository=null;
                $availability='ยังไม่สามารถบันทึกรายการแข่งขันได้ เนื่องจากไม่สามารถเชื่อมต่อฐานข้อมูลรายการแข่งขัน กรุณาลองใหม่ภายหลัง';
            }
        }
        if ($path === '/phase2demo/login') {
            $title = 'เข้าสู่ระบบเจ้าหน้าที่';
            $return = in_array($query['returnTo'] ?? '', ['/platform', '/platform/events/new'], true) ? $query['returnTo'] : '/phase2demo';
            $content = '<div class="card"><div class="card-b"><h2>เลือกช่องทางเข้าสู่ระบบ</h2><p>ใช้บัญชีเดียวกับระบบลงทะเบียน</p><div class="action-row"><a class="btn btn-primary" href="/phase2demo/login/central?returnTo='.rawurlencode($return).'">ผู้ดูแลระบบ / กกท. กลาง</a><a class="btn btn-success" href="/phase2demo/login/sat?returnTo='.rawurlencode($return).'">เจ้าหน้าที่ กกท. จังหวัด</a></div></div></div>';
            if (!empty($context['ambiguous'])) $content .= '<div class="card"><div class="card-b"><h3>เลือกบัญชีที่ต้องการใช้งาน</h3><p>พบการเข้าสู่ระบบทั้งสองช่องทาง โปรดเลือกบัญชีสำหรับงานครั้งนี้</p><div class="action-row"><a class="btn btn-light" href="/phase2demo/account/central">บัญชีส่วนกลาง</a><a class="btn btn-light" href="/phase2demo/account/sat">บัญชีจังหวัด</a></div></div></div>';
        } elseif ($path === '/platform/events') {
            if ($repository === null) return [503, self::layout('ยังไม่สามารถบันทึกรายการ', '<div class="notice" role="alert">'.self::e($availability).'</div>',$path,$context)];
            $result = EventDraft::validate($input);
            if ($result['errors'] || !EventRepository::validUuid($input['request_id'] ?? null)) return [422, self::layout('ตรวจข้อมูลรายการ', '<div class="notice">กรุณาตรวจข้อมูลและเปิดแบบฟอร์มใหม่หากคำขอหมดอายุ</div>'.self::form($context,$input),$path,$context)];
            try {
                $event = $repository->create($result['draft'], $actor['id'], $input['request_id']);
                return [303, '', '/platform/events/'.$event['id']];
            } catch (\DomainException $error) {
                return [409, self::layout('ไม่สามารถสร้างรายการ', '<div class="notice">'.self::e($error->getMessage()).'</div>',$path,$context)];
            }
        } elseif ($eventRoute) {
            if ($repository === null) return [503, 'ยังไม่ได้เชื่อมฐานข้อมูลรายการแข่งขัน'];
            $event = $repository->get($eventMatch[1]);
            if (!$event) return [404, 'ไม่พบรายการแข่งขัน'];
            $title = $event['name'];
            if (!empty($eventMatch[2])) {
                $content = '<div class="notice">สร้างรายการใหม่จากการตั้งค่าเดิม โดยไม่คัดลอกทีม ผลจับสลาก หรือผลการแข่งขัน</div>'.self::form($context, ['name'=>$event['name'].' ครั้งใหม่','season'=>$event['season'],'template'=>$event['template_version_id'],'start_date'=>$event['start_date'],'end_date'=>$event['end_date'],'data_mode'=>$event['is_test']?'demo':'real','divisions'=>$event['divisions']]);
            } else {
                $content = Ui::context($event).'<div class="card"><div class="card-b"><h2>จัดการรายการแข่งขัน</h2><dl class="summary"><dt>ช่วงการแข่งขัน</dt><dd>'.self::e($event['start_date']).' ถึง '.self::e($event['end_date']).'</dd><dt>รุ่นที่เปิด</dt><dd>'.self::e(EventDraft::divisionLabels($event['divisions'])).'</dd></dl><p>กำหนดการแข่งขันย่อยตามรุ่น Stage และพื้นที่ แล้วมอบหมายผู้รับผิดชอบ</p><div class="action-row"><a class="btn btn-yellow" href="/phase2demo/workspace/dashboard?event_id='.$event['id'].'">เข้าสู่ระบบจัดการแข่งขัน</a><a class="btn btn-primary" href="/platform/events/'.$event['id'].'/competitions">จัดการการแข่งขันย่อย</a><a class="btn btn-light" href="/platform/events/'.$event['id'].'/rules">กติกาและผู้ยืนยันผล</a><a class="btn btn-light" href="/platform/events/'.$event['id'].'/clone">ใช้การตั้งค่าสร้างรายการใหม่</a><a class="btn btn-light" href="/platform">กลับรายการแข่งขัน</a></div></div></div>';
            }
        } elseif (str_starts_with($path, '/platform/events/')) {
            $title = 'สร้างรายการแข่งขัน';
            if ($path === '/platform/events/preview') {
                $result = EventDraft::validate($input);
                if ($result['errors']) {
                    $status = 422;
                    $content = '<div class="notice" role="alert"><strong>กรุณาตรวจข้อมูล</strong><ul>';
                    foreach ($result['errors'] as $error) $content .= '<li>'.self::e($error).'</li>';
                    $content .= '</ul></div>'.self::form($context, $input);
                } else {
                    $draft = $result['draft'];
                    $content = '<div class="card"><div class="card-h"><h3>ตรวจสอบข้อมูลรายการ</h3><span class="badge '.($draft['is_test'] ? 'b-amber' : 'b-green').'">'.($draft['is_test'] ? 'ข้อมูล Demo' : 'ข้อมูลจริง').'</span></div><div class="card-b"><h2>'.self::e($draft['name']).'</h2><dl class="summary"><dt>ฤดูกาล</dt><dd>'.self::e($draft['season']).'</dd><dt>เทมเพลท</dt><dd>'.self::e(EventDraft::TEMPLATES[$draft['template_version']]['name']).'</dd><dt>ช่วงการแข่งขัน</dt><dd>'.self::e($draft['start_date']).' ถึง '.self::e($draft['end_date']).'</dd><dt>รุ่นที่เปิด</dt><dd>'.self::e(EventDraft::divisionLabels($draft['divisions'])).'</dd></dl><div class="notice">ข้อมูลนี้เป็นการตรวจแบบฟอร์ม ยังไม่ได้สร้างรายการหรือบันทึกลงฐานข้อมูล</div>';
                    if ($repository !== null) {
                        $content .= '<form method="post" action="/platform/events"><input type="hidden" name="_csrf" value="'.self::e($context['csrf']).'">';
                        foreach (['name','season','template','data_mode','start_date','end_date','request_id'] as $field) $content .= '<input type="hidden" name="'.$field.'" value="'.self::e($input[$field] ?? '').'">';
                        foreach ($draft['divisions'] as $code) $content .= '<input type="hidden" name="divisions[]" value="'.$code.'">';
                        $content .= '<button class="btn btn-success" type="submit">ยืนยันสร้างรายการแข่งขัน</button></form>';
                    } else {
                        $content .= '<div class="notice" role="alert">'.self::e($availability).'</div><button class="btn btn-success" type="button" disabled>ยืนยันสร้างรายการแข่งขัน (ยังไม่พร้อมใช้งาน)</button>';
                    }
                    $content .= '</div></div>'.self::form($context, $input);
                }
            } else $content = self::form($context, ['template' => $query['template'] ?? '']);
            if ($repository === null && $path === '/platform/events/new') $content='<div class="notice" role="alert">'.self::e($availability).'</div>'.$content;
        } elseif ($path === '/platform/templates') {
            $title = 'เทมเพลทการแข่งขัน';
            $content = '<div class="grid grid-3">';
            foreach (EventDraft::TEMPLATES as $key => $template) {
                $content .= '<article class="card"><div class="card-b"><span class="badge b-blue">ฉบับ 1</span><h2>'.self::e($template['name']).'</h2><p>'.self::e($template['description']).'</p><a class="btn btn-primary" href="/platform/events/new?template='.rawurlencode($key).'">ใช้เทมเพลทนี้</a></div></article>';
            }
            $content .= '</div><p class="muted">โครงเทมเพลทเริ่มต้น กติกาเฉพาะรายการต้องได้รับการยืนยันก่อนเปิดใช้งานการแข่งขัน</p>';
        } elseif ($path === '/platform' || $path === '/platform/') {
            $title = 'รายการแข่งขันทั้งหมด';
            $mode = $query['mode'] ?? 'all';
            if (!is_string($mode) || !in_array($mode,['all','real','demo'],true)) return [400,'ประเภทข้อมูลไม่ถูกต้อง'];
            $events = $repository?->list($mode==='all'?null:$mode==='demo') ?? [];
            $content = '<div class="section-title"><div><h2>จัดการรายการแข่งขัน</h2><p>สร้างรายการใหม่จากเทมเพลท และเก็บประวัติแต่ละครั้งแยกกัน</p></div><a class="btn btn-primary" href="/platform/events/new">＋ สร้างรายการแข่งขัน</a></div><div class="mode-tabs"><a href="/platform">ทั้งหมด</a><a href="/platform?mode=real">ข้อมูลจริง</a><a href="/platform?mode=demo">ข้อมูล Demo</a></div>';
            if ($repository === null) $content .= '<div class="notice" role="alert">'.self::e($availability).'</div>';
            elseif (!$events) $content .= '<div class="card"><div class="card-b empty"><h2>ยังไม่มีรายการแข่งขันในประเภทที่เลือก</h2><p>เริ่มต้นด้วยการสร้างรายการจากเทมเพลท</p></div></div>';
            foreach ($events as $event) $content .= '<article class="card"><div class="card-b"><span class="badge '.($event['is_test']?'b-amber':'b-green').'">'.($event['is_test']?'ข้อมูล Demo':'ข้อมูลจริง').'</span><h2>'.self::e($event['name']).'</h2><p>ฤดูกาล '.self::e($event['season']).' · '.self::e($event['start_date']).' ถึง '.self::e($event['end_date']).' · ร่าง</p><a class="btn btn-primary" href="/platform/events/'.$event['id'].'">เข้าสู่รายการ</a></div></article>';
        } else {
            $mode = $query['mode'] ?? 'real';
            if (!is_string($mode) || !in_array($mode, ['real', 'demo'], true)) return [400, 'ประเภทข้อมูลไม่ถูกต้อง'];
            if ($path === '/phase2demo/competitions') {
                $title = 'รายการที่รับผิดชอบ';
                $content .= '<div class="context-bar"><strong>ขอบเขตของคุณ</strong><span>'.self::e($actor['province'] ?: 'ตามรายการที่ได้รับมอบหมาย').'</span></div>';
            }
            $view=$query['view'] ?? 'fixtures';if(!is_string($view)||!in_array($view,['fixtures','results','bracket','teams'],true))return [400,'หน้าข้อมูลไม่ถูกต้อง'];
            $title=['fixtures'=>'ตารางการแข่งขัน','results'=>'ผลการแข่งขันสาธารณะ','bracket'=>'ก้างปลาสาธารณะ','teams'=>'รายละเอียดทีมสาธารณะ'][$view];
            $published = class_exists(DrawPages::class) ? DrawPages::publicContent($mode==='demo',$view) : '';
            $content .= '<div class="public-head"><strong>PMYC · '.self::e($title).'</strong><span>ข้อมูลที่เผยแพร่แล้ว</span></div><div class="section-title"><div><h2>'.self::e($title).'</h2><p>เลือกข้อมูลการแข่งขันที่เผยแพร่แล้ว</p></div><span class="badge '.($mode === 'demo' ? 'b-amber' : 'b-green').'">'.($mode === 'demo' ? 'ข้อมูล Demo' : 'ข้อมูลจริง').'</span></div><div class="mode-tabs" aria-label="ประเภทข้อมูล"><a '.($mode === 'real' ? 'aria-current="page"' : '').' href="/phase2demo?mode=real&amp;view='.$view.'">ข้อมูลจริง</a><a '.($mode === 'demo' ? 'aria-current="page"' : '').' href="/phase2demo?mode=demo&amp;view='.$view.'">ข้อมูล Demo</a></div>'.($published !== '' ? $published : '<div class="card"><div class="card-b empty"><div class="empty-mark" aria-hidden="true">▦</div><h2>ยังไม่มีตารางการแข่งขันที่เผยแพร่</h2><p>รายการและโปรแกรมจะแสดงที่นี่เมื่อเปิดเผยแพร่</p></div></div>');
        }
        return [$status, self::layout($title, $content, $path, $context)];
    }

    private static function form(array $context, array $input = []): string
    {
        $selected = $input['template'] ?? '';
        $requestId = EventRepository::validUuid($input['request_id'] ?? null) ? $input['request_id'] : EventRepository::uuid();
        $html = '<form method="post" action="/platform/events/preview" class="card"><div class="card-h"><h3>ข้อมูลรายการแข่งขัน</h3><span class="badge b-blue">ตรวจข้อมูลก่อนสร้าง</span></div><div class="card-b"><input type="hidden" name="_csrf" value="'.self::e($context['csrf'] ?? '').'"><input type="hidden" name="request_id" value="'.$requestId.'"><div class="form-grid">';
        foreach (['name' => 'ชื่อรายการแข่งขัน', 'season' => 'ฤดูกาล', 'start_date' => 'วันเริ่มการแข่งขัน', 'end_date' => 'วันสิ้นสุดการแข่งขัน'] as $key => $label) {
            $html .= '<label class="field">'.$label.' *<input required name="'.$key.'" type="'.(str_ends_with($key, '_date') ? 'date' : 'text').'" value="'.self::e($input[$key] ?? '').'"></label>';
        }
        $html .= '<label class="field">เทมเพลท *<select required name="template"><option value="">เลือกเทมเพลท</option>';
        foreach (EventDraft::TEMPLATES as $key => $template) $html .= '<option value="'.$key.'" '.($selected === $key ? 'selected' : '').'>'.self::e($template['name']).'</option>';
        $html .= '</select></label></div><fieldset><legend>ประเภทข้อมูล *</legend><div class="choice-row">';
        foreach (['real' => 'ข้อมูลจริง', 'demo' => 'ข้อมูล Demo'] as $key => $label) $html .= '<label class="choice"><input type="radio" name="data_mode" value="'.$key.'" required '.(($input['data_mode'] ?? null) === $key ? 'checked' : '').'> '.$label.'</label>';
        $html .= '</div><p class="muted">รายการจริงเลือกเฉพาะทีมจริง รายการ Demo เลือกเฉพาะทีม Demo</p></fieldset><fieldset><legend>รุ่นอายุและเพศ *</legend><div class="choice-row">';
        $chosen = is_array($input['divisions'] ?? null) ? $input['divisions'] : [];
        foreach (EventDraft::DIVISIONS as $key => $label) $html .= '<label class="choice"><input type="checkbox" name="divisions[]" value="'.$key.'" '.(in_array($key, $chosen, true) ? 'checked' : '').'> '.$label.'</label>';
        return $html.'</div></fieldset><div class="action-row"><button class="btn btn-primary" type="submit">ตรวจสอบข้อมูล</button><a class="btn btn-light" href="/platform">กลับรายการแข่งขัน</a></div></div></form>';
    }

    public static function page(string $title,string $content,string $path,array $context,int $status=200): array
    {
        return [$status,self::layout($title,$content,$path,$context)];
    }

    private static function layout(string $title, string $content, string $path, array $context): string
    {
        $actor = $context['actor'];
        $super = ($actor['role'] ?? null) === 'SUPER_ADMIN';
        if($super&&preg_match('#^/platform/events/([a-f0-9-]{36})#Di',$path,$eventPath))$context['ui_event_id']=$eventPath[1];
        $scope=Ui::scope($path,$context);
        $nav=Ui::navigation($path,$context,$scope);
        $roles = ['SUPER_ADMIN' => 'ผู้ดูแลระบบสูงสุด', 'DOCUMENT_VERIFIER' => 'เจ้าหน้าที่ตรวจเอกสาร', 'SAT_OFFICER' => 'เจ้าหน้าที่ กกท. จังหวัด'];
        $account = $actor ? '<div class="userbox"><span class="avatar" aria-hidden="true">กกท</span><span>'.self::e($actor['name']).'<small>'.self::e($roles[$actor['role']] ?? '').'</small></span></div>' : '<a class="btn btn-primary" href="/phase2demo/login">เข้าสู่ระบบ</a>';
        return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.self::e($title).' · PMYC</title><link rel="stylesheet" href="/phase2demo/assets/app.css?v=42"><script src="/assets/data/thai-administrative-divisions.js" defer></script><script src="/phase2demo/assets/app.js?v=53" defer></script><script src="/phase2demo/assets/draw-setup.js?v=2" defer></script></head><body data-authenticated="'.($actor ? '1' : '0').'" data-ambiguous="'.(!empty($context['ambiguous']) ? '1' : '0').'" data-expires="'.self::e((string)($context['expiresAt'] ?? '')).'" data-role="'.self::e($actor['role'] ?? '').'"><div class="drawer-backdrop" hidden></div><div class="shell"><aside class="sidebar" id="navigation"><div class="brand"><img src="/assets/img/pmyc_top_logo.png" alt="PMYC"><small>ระบบจัดการแข่งขันฟุตบอล</small></div><nav class="nav" aria-label="เมนูหลัก">'.$nav.'</nav></aside><main class="main"><header class="topbar"><div class="topbar-left"><button class="menu-toggle" type="button" aria-label="เปิดเมนู" aria-controls="navigation" aria-expanded="false">☰</button><div><div class="page-title">'.self::e($title).'</div><div class="page-sub">PMYC · ระบบจัดการแข่งขัน</div></div></div>'.$account.'</header><div class="content"><div class="breadcrumb">'.(str_starts_with($path,'/platform')?'หลังบ้านกลาง':'ระบบจัดการแข่งขัน').' / '.self::e($title).'</div><div class="section-title page-heading"><div><h2>'.self::e($title).'</h2><p>'.($scope?self::e($scope['event_name']).' · '.self::e(EventDraft::DIVISIONS[$scope['division_code']]):(str_starts_with($path,'/platform')?'จัดการรายการแข่งขันและข้อมูลกลาง':'PMYC · ระบบจัดการแข่งขันฟุตบอล')).'</p></div>'.($scope?'<a class="btn btn-light" href="/phase2demo/workspace/dashboard?event_id='.$scope['event_id'].'">เปลี่ยนการแข่งขัน</a>':'').'</div>'.$content.'</div></main></div></body></html>';
    }

    private static function e(mixed $value): string
    {
        return htmlspecialchars(is_string($value) ? $value : '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
