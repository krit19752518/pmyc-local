<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** Read-only v16 team preview. Selection never creates a competition or a draw. */
final class TeamSetupPages
{
    public static function pairCount(int $teamCount): int
    {
        return $teamCount > 1 ? intdiv($teamCount, 2) : 0;
    }

    public static function page(array $m,array $context):array
    {
        $e=fn($v)=>WorkspaceView::e($v);$f=$m['filters'];$teams=$m['eligible_teams'];
        if(isset($m['setup_input']))foreach(['season_id','division_code','stage','province','district'] as $name)$f[$name]=$m['setup_input'][$name];
        $female=$f['division_code']==='U18_GIRL';
        $complete=$f['season_id']!==''&&$f['division_code']!==''&&$f['stage']!==''&&$f['province']!==''&&($female||$f['stage']==='2'||$f['district']!=='');
        if(!$complete)$teams=null;
        $clearUrl=WorkspaceView::setupEntryUrl($f);
        $html=WorkspaceView::heading('ตั้งค่าการจับสลาก','เลือกขอบเขตการแข่งขัน แล้วตรวจสอบรายชื่อทีมที่มีสิทธิ์','<a class="btn" href="'.$e($clearUrl).'">ล้างข้อมูล</a>','TOURNAMENT MANAGEMENT');
        $html.='<div class="stepper">';
        foreach(['เลือกทีมและพื้นที่','พิธีจับสลาก','เปิดทีมครบและดูผล','จัดตารางการแข่งขัน'] as $i=>$label)$html.='<div class="step'.($i===0?' current':'').'"><span>'.($i+1).'</span>'.$e($label).'</div>';
        $html.='</div>'.DashboardPages::filters($m,$context['actor'],'setup');
        $scope=implode(' · ',array_filter([EventDraft::DIVISIONS[$f['division_code']] ?? '',$female||$f['stage']==='2'?'ระดับจังหวัด':$f['district'],$f['province']]));
        $count=$teams===null?'—':(string)count($teams);
        $html.='<section class="card"><div class="card-head"><div><h2>ทีมที่มีสิทธิ์เข้าร่วมการแข่งขัน</h2><p>'.$e($scope).'</p></div><span class="badge">'.$count.' ทีม</span></div><div class="table-wrap"><table><thead><tr><th>ลำดับ</th><th>ทีม</th><th>อำเภอ</th><th>'.($f['stage']==='2'?'แหล่งทีม':'สถานะการลงทะเบียน').'</th><th>สิทธิ์เข้าร่วม</th></tr></thead><tbody>';
        foreach($teams ?? [] as $i=>$team){
            $status=$m['teams_source']==='registration'?'อนุมัติแล้ว':'รายชื่อแข่งขันที่บันทึกไว้';
            $html.='<tr><td>'.str_pad((string)($i+1),2,'0',STR_PAD_LEFT).'</td><td>'.$e($team['name']).'</td><td>'.$e($team['district'] ?: '—').'</td><td>'.$status.'</td><td><span class="badge">มีสิทธิ์</span></td></tr>';
        }
        if(!$teams){
            $message=($m['available'] ?? true)?($teams===null?($f['stage']==='2'?'ยังไม่มีรายชื่อทีมผ่านเข้ารอบในขอบเขตนี้':'เลือกจังหวัดและอำเภอ/เขตเพื่อแสดงทีมที่ผ่านการอนุมัติ'):'ยังไม่มีทีมที่ผ่านอนุมัติทีมและรุ่น พร้อมนักกีฬาอนุมัติอย่างน้อย 18 คนในขอบเขตนี้'):'ยังไม่ได้เชื่อมข้อมูลการแข่งขัน';
            if(!$complete)$message='กรุณาเลือกตัวกรองให้ครบเพื่อแสดงทีมที่มีสิทธิ์';
            elseif(!empty($m['no_demo_area']))$message='ยังไม่มีข้อมูล Demo ในจังหวัดและรุ่นที่เลือก';
            $html.='<tr><td colspan="5" class="empty">'.$message.'</td></tr>';
        }
        $html.='</tbody></table></div><div class="panel-action"><div><h3>'.($female?($teams?count($teams).' ทีม · รอกำหนดรูปแบบจับสลาก':'ยังไม่มีทีมหญิงผ่านเกณฑ์'):($teams?count($teams).' ทีม · '.self::pairCount(count($teams)).' คู่แข่งขัน':'ยังไม่พร้อมจับสลาก')).'</h3><p>'.($female?'ทีมหญิงรวมทุกอำเภอภายในจังหวัด · รอข้อสรุปจำนวนทีม/รูปแบบจับสลาก':($f['stage']==='2'?'ทีมผ่านเข้ารอบจากการแข่งขันอำเภอ':'ทีมอนุมัติแล้ว · รุ่นส่งสมัครและไม่ยกเลิก · นักกีฬาอนุมัติอย่างน้อย 18 คน · สูงสุด 8 ทีมแรกตามเวลาสมัคร')).'</p></div>';
        if(!$female&&$teams&&($context['actor']['role'] ?? '')!=='DOCUMENT_VERIFIER')$html.='<a class="btn primary" href="'.$e(WorkspaceView::url('ceremony',$f)).'">เข้าสู่พิธีจับสลาก '.WorkspaceView::icon('arrow').'</a>';
        $html.='</div></section>';
        return WorkspaceView::page('setup',$html,$context,$f);
    }
}
