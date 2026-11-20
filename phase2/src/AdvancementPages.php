<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class AdvancementPages
{
    public static function render(\PDO $db,string $id,string $path,string $method,array $input,array $context):array
    {
        $scope=(new CompetitionRepository($db))->requireAccess($id,$context['actor'],'import');$repo=new AdvancementRepository($db);if(!$repo->ready())return [503,'ยังไม่ได้ติดตั้งระบบทีมผ่านเข้ารอบ'];
        if($method==='POST'){$repo->execute($id,$context['actor'],$input);return [303,'',$path];}
        $preview=$repo->preview($scope);$current=(new RosterRepository($db))->current($id);$districts=array_column($repo->sources($scope),'district','id');
        if($current && $current['locked']){$preview['teams']=$current['teams'];$preview['pending']=[];$preview['origins']=$repo->lineage($current['id']);}
        $origins=array_column($preview['origins'],null,'source_team_id');
        $body=Ui::context($scope).'<div class="card"><div class="card-b"><h2>ทีมผ่านจากรอบอำเภอ</h2><p>แชมป์และรองแชมป์ของอำเภอที่ยืนยันผลแล้ว หรือทีมเดียวที่เผยแพร่สิทธิ์อัตโนมัติ ใช้รายชื่อฉบับที่แข่งขันจริง ไม่อ่านทับจากทะเบียนปัจจุบัน</p>';
        if(!$preview['source_ids'])$body.='<div class="notice">ยังไม่มีการแข่งขันอำเภอในรุ่นนี้</div>';
        if($preview['pending'])$body.='<div class="notice">รออำเภอยืนยันผล: '.self::e(implode(' · ',$preview['pending'])).'</div>';
        foreach($preview['teams'] as $team){$origin=$origins[$team['source_team_id']];$body.='<p>'.self::e($team['name']).' · นักกีฬา '.count($team['players']).' คน · อำเภอ '.self::e($origin['district'] ?? $districts[$origin['source_competition_id']] ?? '').' · ลำดับคัดเลือก '.$origin['rank'].(isset($origin['draw_version'])?' · ผลจับสลากฉบับ '.$origin['draw_version']:'').'</p>';}
        $body.='<p>รายชื่อฉบับ '.($current['version'] ?? '—').' · '.($current && $current['locked']?'ล็อกแล้ว':'ยังไม่ล็อก').'</p>';
        if(!$preview['pending'] && $preview['teams'] && !($current['locked'] ?? false)){
            foreach(['import'=>'บันทึกรายชื่อทีมผ่านเข้ารอบฉบับใหม่','lock'=>'ยืนยันล็อกรายชื่อรอบจังหวัด'] as $op=>$label){if($op==='lock'&&!$current)continue;$body.='<form class="draw-action" method="post" action="'.self::e($path).'"><input type="hidden" name="_csrf" value="'.self::e($context['csrf']).'"><input type="hidden" name="request_id" value="'.EventRepository::uuid().'"><input type="hidden" name="version" value="'.($current['version'] ?? 0).'"><input type="hidden" name="operation" value="'.$op.'"><p>'.($op==='lock'?'การล็อกจะตรวจผลต้นทางซ้ำ และปิดการแก้ผลต้นทางที่ใช้คัดทีมชุดนี้':'นำเข้าครบทุกอำเภอในรายการ รุ่น และจังหวัดเดียวกัน').'</p><button class="btn btn-primary" type="submit">'.$label.'</button></form>';}
        }
        $body.='</div></div><div class="action-row"><a class="btn btn-light" href="/phase2demo/competitions/'.$id.'/roster">รายชื่อแข่งขัน</a>';
        if($current && $current['locked'])$body.='<a class="btn btn-primary" href="/phase2demo/competitions/'.$id.'/draw">จับสลากรอบจังหวัด</a>';
        return Application::page('นำทีมผ่านเข้ารอบจังหวัด',$body.'</div>',$path,$context);
    }
    private static function e(?string $s):string{return htmlspecialchars($s ?? '',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
}
