<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class CompetitionDraft
{
    public static function validate(array $input, array $areas, ?string $divisionCode=null): array
    {
        $errors=[];$women=$divisionCode==='U18_GIRL';
        $stage=$input['stage'] ?? null;
        if (!in_array($stage,[1,2,3,4,'1','2','3','4'],true)) $errors['stage']='กรุณาเลือก Stage 1–4';
        $stage=(int)(is_scalar($stage)?$stage:0);
        $division=$input['division_id'] ?? null;
        if (!EventRepository::validUuid($division)) $errors['division_id']='กรุณาเลือกรุ่นของรายการนี้';
        $values=[];
        foreach (['province','district','zone'] as $field) {
            $raw=$input[$field] ?? '';
            if (!is_string($raw) || preg_match('/[\x00-\x1F\x7F]/u',$raw)) { $errors[$field]='พื้นที่ไม่ถูกต้อง'; $raw=''; }
            $values[$field]=trim($raw)===''?null:trim($raw);
        }
        ['province'=>$province,'district'=>$district,'zone'=>$zone]=$values;
        if ($zone!==null) $zone=$values['zone']=strtoupper($zone);
        if (in_array($stage,[1,2],true) && ($province===null || !isset($areas[$province]))) $errors['province']='กรุณาเลือกจังหวัดที่ถูกต้อง';
        if (!$women && $stage===1 && ($district===null || !in_array($district,$areas[$province ?? ''] ?? [],true))) $errors['district']='อำเภอหรือเขตต้องอยู่ในจังหวัดที่เลือก';
        if($women&&($stage!==1||$district!==null))$errors['stage']='รอบแรกหญิงใช้ระดับจังหวัดเท่านั้น ไม่ต้องเลือกอำเภอ';
        if ($stage!==1 && $district!==null) $errors['district']='Stage นี้ไม่ใช้พื้นที่ระดับอำเภอ';
        if ($stage>=3 && $province!==null) $errors['province']='Stage นี้ไม่ใช้จังหวัดเป็นขอบเขต';
        if ($stage===3 && ($zone===null || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{1,15}$/D',$zone))) $errors['zone']='กรุณาระบุรหัสโซนที่ถูกต้อง';
        if ($stage!==3 && $zone!==null) $errors['zone']='Stage นี้ไม่ใช้รหัสโซน';
        return ['errors'=>$errors,'draft'=>$errors?null:['division_id'=>$division,'stage'=>$stage,...$values]];
    }
}
