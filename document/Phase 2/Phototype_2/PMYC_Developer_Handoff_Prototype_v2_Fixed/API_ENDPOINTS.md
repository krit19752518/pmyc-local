# API ที่แนะนำ

Endpoint คงชื่อภาษาอังกฤษตามมาตรฐานเทคนิค แต่ข้อความสำหรับผู้ใช้งานระบบเป็นภาษาไทย

## การแข่งขัน
- `GET/POST /competitions`
- `GET/PATCH /competitions/:id`
- `GET /competitions/:id/participants`
- `POST /competitions/:id/participants/lock`

## การจับสลาก
- `POST /competitions/:id/draws`
- `POST /draws/:id/reset`
- `POST /draws/:id/confirm`
- `POST /draws/:id/publish`
- `GET /draws/:id/history`

## ผล/รายชื่อผู้เล่น
- `PATCH /matches/:id/schedule`
- `PUT /matches/:id/lineups/:teamId`
- `POST /matches/:id/results`
- `POST /matches/:id/results/confirm`

## Stage 3
- `POST /zones/:id/slot-draw`
- `POST /zones/:id/generate-fixtures`
- `GET /zones/:id/fixtures`
- `GET /zones/:id/standings`

## แมวมอง / ออลสตาร์
- `GET /scout/players`
- `POST/DELETE /scout/players/:id/favorite`
- `POST /all-star-teams/:id/players`
- `POST /all-star-teams/:id/staff`
- `POST /all-star-teams/:id/transfer-documents`
- `POST /all-star-teams/:id/confirm`
