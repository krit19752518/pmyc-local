"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicRouter = void 0;
const express_1 = require("express");
const layout_1 = require("../layout");
const helpers_1 = require("../utils/helpers");
exports.publicRouter = (0, express_1.Router)();
// Page 1: /index.php & /
exports.publicRouter.get(['/', '/index.php'], (req, res) => {
    const base = (0, helpers_1.getBaseUrl)(req);
    const content = `
  <section class="home-banner text-center py-3">
    <div class="mb-4">
      <img class="home-slide img-fluid rounded-4 shadow" src="${base}/assets/img/slide01.jpg" alt="Prime Minister's Youth CUP Football" style="max-width: 100%; height: auto;">
    </div>

    <div class="card border-0 shadow-sm p-4 p-md-5 mx-auto mb-4 bg-white rounded-4" style="max-width: 900px;">
      <h2 class="fw-bold text-navy mb-2 display-6">การแข่งขันฟุตบอลเยาวชน Prime Minister's Youth CUP</h2>
      <p class="text-muted fs-5 mb-4">เปิดรับสมัครทีมเข้าร่วมการแข่งขัน ประจำปี 2569 (รุ่น U14, U16, U18)</p>

      <div class="mb-4">
        <p class="text-muted fs-5 mb-3">คลิก สมัครแข่งขัน ทั้ง 3 รุ่นได้ที่นี่ โดยลงทะเบียนทีม 1 บัญชี สามารถสมัครได้ทุกรุ่น</p>
        <a class="btn btn-warning btn-lg fw-bold px-4 shadow-sm" href="${base}/team/register.php">
          <i class="bi bi-pencil-square me-1"></i> สมัครแข่งขัน
        </a>
      </div>

      <div class="d-flex flex-wrap justify-content-center gap-2 pt-3 border-top mb-3">
        <a class="btn btn-outline-navy fw-semibold px-3 py-2" href="${base}/rules.php">
          <i class="bi bi-journal-text me-1"></i> ระเบียบการแข่งขัน
        </a>
        <a class="btn btn-navy fw-semibold px-4 py-2" href="${base}/team/index.php">
          <i class="bi bi-person-badge me-1"></i> เข้าสู่ระบบ / จัดการข้อมูลทีม
        </a>
      </div>

      <!-- Download Forms & Manual Section (Below Login Button) -->
      <div class="card bg-light border-0 rounded-4 p-3 p-md-4 text-center">
        <h5 class="fw-bold text-navy mb-3"><i class="bi bi-file-earmark-arrow-down-fill me-2 text-warning"></i> ดาวน์โหลดแบบฟอร์มเอกสาร & คู่มือระบบ</h5>
        <div class="d-flex flex-wrap justify-content-center gap-2">
          <a class="btn btn-outline-primary fw-semibold rounded-3 px-3 py-2 shadow-sm" href="https://docs.google.com/document/d/18_1gkpsljBl2__aYNtGMQ4fXv_QdPG7COYojv2pNdTo/edit?usp=sharing" target="_blank" rel="noopener noreferrer">
            <i class="bi bi-file-earmark-word me-1"></i> ดาวน์โหลดแบบฟอร์มหนังสือรับรองทีม
          </a>
          <a class="btn btn-outline-success fw-semibold rounded-3 px-3 py-2 shadow-sm" href="https://docs.google.com/document/d/1U4Gc96_g87tOBrbyPYEQnGSG51WMxxn9Q-AH6dGFJ_Q/edit?usp=sharing" target="_blank" rel="noopener noreferrer">
            <i class="bi bi-file-earmark-excel me-1"></i> ดาวน์โหลดใบสมัครออฟไลน์
          </a>
          <a class="btn btn-outline-dark fw-semibold rounded-3 px-3 py-2 shadow-sm" href="https://docs.google.com/document/d/1cbvgSxathPC6qngIteqvkgZUN97vnVBFijymexuHYIk/edit?usp=sharing" target="_blank" rel="noopener noreferrer">
            <i class="bi bi-book me-1"></i> ดาวน์โหลดคู่มือระบบลงทะเบียนและจัดการทีม
          </a>
        </div>
        <figure class="mt-3 mb-0">
          <img
            class="img-fluid rounded-2"
            src="${base}/assets/img/lineoa-qr.png"
            alt="QR Code สำหรับติดต่อ Line Official Account"
            width="180"
            height="171"
          >
          <figcaption class="mt-2 text-muted">
            ติดต่อสอบถามรายละเอียดเพิ่มเติม และแจ้งปัญหาการใช้งานระบบ
          </figcaption>
        </figure>
      </div>
    </div>

    <section class="card border-0 shadow-sm p-4 mx-auto mb-4 rounded-4" style="max-width: 900px;" aria-labelledby="home-statistics-title">
      <h2 id="home-statistics-title" class="h4 fw-bold text-navy">ข้อมูลสถิติการสมัคร</h2>
      <div class="row g-3 my-2">
        <div class="col-12 col-md-4"><strong id="home-statistics-total" class="fs-2">—</strong><div>รายการทีม–รุ่นที่สมัคร</div></div>
        <div class="col-6 col-md-4"><strong id="home-statistics-provinces" class="fs-2">—</strong><div>จังหวัดทั้งหมด</div></div>
        <div class="col-6 col-md-4"><strong id="home-statistics-districts" class="fs-2">—</strong><div>อำเภอ/เขตทั้งหมด</div></div>
      </div>
      <p id="home-statistics-summary" role="status" aria-live="polite">กำลังโหลดข้อมูลสถิติการสมัคร…</p>
      <a id="home-statistics-gaps" href="${base}/registration-statistics.php#stats?level=district&amp;status=zero">ดูพื้นที่ที่ยังไม่มีทีมสมัคร →</a>
      <a class="mt-2" href="${base}/registration-statistics.php">ดูข้อมูลสถิติการสมัครทั้งหมด →</a>
    </section>
    <div
      id="home-announcement-popup"
      class="home-announcement-popup"
      role="dialog"
      aria-modal="true"
      aria-label="ประกาศขยายเวลารับสมัคร"
    >
      <div class="home-announcement-popup__frame">
        <img
          class="home-announcement-popup__image"
          src="${base}/assets/img/registration-extension-notice.png"
          alt="ประกาศขยายเวลารับสมัครการแข่งขันฟุตบอลเยาวชน Prime Minister's Youth CUP"
        >
        <button
          class="home-announcement-popup__close"
          type="button"
          aria-label="ปิดประกาศ"
        >&times;</button>
      </div>
    </div>
    <style>
      #home-announcement-popup {
        position: fixed;
        inset: 0;
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(0, 0, 0, 0.78);
      }
      #home-announcement-popup[hidden] { display: none !important; }
      .home-announcement-popup__frame { position: relative; }
      .home-announcement-popup__image {
        display: block;
        max-width: min(92vw, 720px);
        max-height: 92vh;
        width: auto;
        height: auto;
        object-fit: contain;
      }
      .home-announcement-popup__close {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        display: grid;
        place-items: center;
        width: 2.75rem;
        height: 2.75rem;
        padding: 0;
        border: 2px solid #222;
        border-radius: 50%;
        background: #fff;
        color: #111;
        font: 700 2rem/1 sans-serif;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      }
      .home-announcement-popup__close:focus-visible {
        outline: 3px solid #ffdf00;
        outline-offset: 2px;
      }
    </style>
    <script>
      (() => {
        const popup = document.getElementById("home-announcement-popup");
        const closeButton = popup && popup.querySelector(".home-announcement-popup__close");
        if (!popup || !closeButton) return;
        closeButton.addEventListener("click", () => {
          popup.hidden = true;
        });
      })();
    </script>
  </section>`;
    res.send((0, layout_1.renderLayout)('หน้าแรก', content, 'home', base));
});
// Page 2: /rules.php
exports.publicRouter.get('/rules.php', (req, res) => {
    const base = (0, helpers_1.getBaseUrl)(req);
    const content = `
  <div class="card p-4 rule-doc shadow-sm rounded-4 border-0">
    <div class="d-flex flex-wrap align-items-center justify-content-between pb-3 mb-3 border-bottom gap-2">
      <div>
        <h3 class="fw-bold text-navy mb-1"><i class="bi bi-journal-text me-2 text-warning"></i> ระเบียบการแข่งขันฟุตบอล Prime Minister's Youth CUP</h3>
        <p class="text-muted small mb-0">ระเบียบว่าด้วยการจัดการแข่งขันฟุตบอลเยาวชน ประจำปี 2569</p>
      </div>
      <a class="btn btn-warning fw-bold px-3 py-2 rounded-3" href="${base}/document/rules.pdf" target="_blank">
        <i class="bi bi-box-arrow-up-right me-1"></i> เปิดในแท็บใหม่ / ดาวน์โหลด PDF
      </a>
    </div>

    <!-- Embedded PDF Viewer -->
    <div class="ratio ratio-4x3 mb-4 rounded-3 overflow-hidden border shadow-sm" style="min-height: 750px;">
      <iframe src="${base}/document/rules.pdf#toolbar=1&navpanes=0&scrollbar=1" title="ระเบียบการแข่งขันฟุตบอล Prime Minister's Youth CUP" allowfullscreen style="width: 100%; height: 750px; border: none;"></iframe>
    </div>

    <div class="mt-2 pt-3 border-top d-flex flex-wrap gap-2 justify-content-center">
      <a class="btn btn-warning fw-semibold px-4 py-2" href="${base}/team/register.php?category=U14">
        <i class="bi bi-pencil-square me-1"></i> สมัครรุ่น U14
      </a>
      <a class="btn btn-warning fw-semibold px-4 py-2" href="${base}/team/register.php?category=U16">
        <i class="bi bi-pencil-square me-1"></i> สมัครรุ่น U16
      </a>
      <a class="btn btn-warning fw-semibold px-4 py-2" href="${base}/team/register.php?category=U18">
        <i class="bi bi-pencil-square me-1"></i> สมัครรุ่น U18
      </a>
    </div>
  </div>`;
    res.send((0, layout_1.renderLayout)('ระเบียบการแข่งขัน', content, 'rules', base));
});
