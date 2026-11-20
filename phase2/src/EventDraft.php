<?php
declare(strict_types=1);

namespace PMYC\Phase2;

final class EventDraft
{
    public const DIVISIONS = ['U14_BOY'=>'U14 ชาย','U16_BOY'=>'U16 ชาย','U18_BOY'=>'U18 ชาย','U18_GIRL'=>'U18 หญิง'];

    public static function divisionLabels(array $codes): string
    {
        return implode(' · ',array_map(fn($code)=>self::DIVISIONS[$code] ?? $code,$codes));
    }
    public const TEMPLATES = [
        'pmyc-four-stage-v1' => ['name' => 'PMYC 4 Stage', 'description' => 'อำเภอ · จังหวัด · โซน · ประเทศ', 'stages' => 4],
        'knockout-v1' => ['name' => 'ฟุตบอลแพ้คัดออก', 'description' => 'จับสลากและแข่งขันแบบแพ้คัดออก', 'stages' => 1],
        'round-robin-v1' => ['name' => 'ฟุตบอลพบกันหมด', 'description' => 'สร้างโปรแกรมพบกันหมดหนึ่งเลก', 'stages' => 1],
    ];

    /** Preview only. Persistence and approved rules are separate milestones. */
    public static function validate(array $input): array
    {
        $errors = [];
        $name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
        if (!preg_match('/^.{1,200}$/usD', $name)) $errors['name'] = 'กรุณาระบุชื่อรายการแข่งขันไม่เกิน 200 ตัวอักษร';
        $season = is_string($input['season'] ?? null) ? trim($input['season']) : '';
        if ($season === '' || strlen($season) > 80) $errors['season'] = 'กรุณาระบุฤดูกาล';
        $template = $input['template'] ?? null;
        if (!is_string($template) || !isset(self::TEMPLATES[$template])) $errors['template'] = 'กรุณาเลือกเทมเพลท';
        $mode = $input['data_mode'] ?? null;
        if (!in_array($mode, ['real', 'demo'], true)) $errors['data_mode'] = 'กรุณาเลือกข้อมูลจริงหรือข้อมูล Demo';
        $start = self::date($input['start_date'] ?? null);
        $end = self::date($input['end_date'] ?? null);
        if ($start === null) $errors['start_date'] = 'กรุณาระบุวันเริ่มที่ถูกต้อง';
        if ($end === null) $errors['end_date'] = 'กรุณาระบุวันสิ้นสุดที่ถูกต้อง';
        if ($start !== null && $end !== null && $end < $start) $errors['end_date'] = 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม';
        $divisions = $input['divisions'] ?? [];
        if (!is_array($divisions) || $divisions === [] || count($divisions) !== count(array_unique($divisions, SORT_REGULAR))
            || array_filter($divisions, fn($v) => !is_string($v) || !isset(self::DIVISIONS[$v]))) {
            $errors['divisions'] = 'กรุณาเลือกรุ่นที่เปิดรับอย่างน้อยหนึ่งรุ่นและไม่ซ้ำ';
        }
        return ['errors' => $errors, 'draft' => $errors ? null : [
            'name' => $name, 'season' => $season, 'template_version' => $template,
            'is_test' => $mode === 'demo', 'start_date' => $start, 'end_date' => $end,
            'divisions' => array_values($divisions), 'status' => 'DRAFT',
        ]];
    }

    private static function date(mixed $value): ?string
    {
        if (!is_string($value)) return null;
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $date && $date->format('Y-m-d') === $value ? $value : null;
    }
}
