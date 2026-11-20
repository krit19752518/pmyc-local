"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSupportReportWidget = renderSupportReportWidget;
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}
function renderSupportReportWidget(pageDescription, baseUrl) {
    const safeDescription = escapeHtml(pageDescription);
    return `
    <button type="button" class="btn btn-outline-danger w-100 text-start mt-2" data-bs-toggle="modal" data-bs-target="#supportReportModal">
      <i class="bi bi-exclamation-triangle me-2"></i>แจ้งปัญหาการใช้งานระบบ
    </button>
    <div class="modal fade" id="supportReportModal" tabindex="-1" aria-labelledby="supportReportTitle" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <form id="supportReportForm" enctype="multipart/form-data">
            <div class="modal-header">
              <h5 class="modal-title" id="supportReportTitle">ระบบรับแจ้งปัญหาการใช้งาน ${safeDescription}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="ปิด"></button>
            </div>
            <div class="modal-body">
              <label class="form-label fw-semibold" for="supportReportDescription">อธิบายปัญหาการใช้งานให้ละเอียด</label>
              <textarea class="form-control mb-3" id="supportReportDescription" name="description" rows="5" maxlength="10000" required></textarea>
              <label class="form-label fw-semibold" for="supportReportFiles">แนบรูปปัญหาที่เจอ (สูงสุด 10 รูป รูปละไม่เกิน 4 MB)</label>
              <input class="form-control" id="supportReportFiles" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple>
              <div id="supportReportPreviews" class="d-flex flex-wrap gap-2 mt-3"></div>
              <div id="supportReportMessage" class="mt-3" role="status" aria-live="polite"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">ยกเลิก</button>
              <button type="submit" class="btn btn-danger" id="supportReportSubmit">ส่งแจ้งปัญหา</button>
            </div>
          </form>
        </div>
      </div>
    </div>
    <style>
      .support-report-preview { width: 112px; height: 100px; }
      .support-report-remove { opacity: 0; pointer-events: none; transition: opacity .15s ease-in-out; }
      .support-report-preview:hover .support-report-remove,
      .support-report-preview:focus-within .support-report-remove { opacity: 1; pointer-events: auto; }
      @media (hover: none) { .support-report-remove { opacity: 1; pointer-events: auto; } }
    </style>
    <script>
    (() => {
      const modalElement = document.getElementById('supportReportModal');
      if (modalElement && modalElement.parentElement !== document.body) {
        document.body.appendChild(modalElement);
      }
      const form = document.getElementById('supportReportForm');
      if (!form) return;
      const input = document.getElementById('supportReportFiles');
      const previews = document.getElementById('supportReportPreviews');
      const message = document.getElementById('supportReportMessage');
      const submit = document.getElementById('supportReportSubmit');
      let selectedFiles = [];
      const renderPreviews = () => {
        previews.replaceChildren();
        selectedFiles.forEach((file, index) => {
          const card = document.createElement('div');
          card.className = 'position-relative border rounded p-1';
          const image = document.createElement('img');
          const imageUrl = URL.createObjectURL(file);
          image.src = imageUrl;
          image.alt = file.name;
          image.style.cssText = 'width:96px;height:72px;object-fit:cover';
          image.onload = image.onerror = () => URL.revokeObjectURL(imageUrl);
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'btn btn-sm btn-danger position-absolute top-0 end-0 support-report-remove';
          remove.setAttribute('aria-label', 'ลบ ' + file.name);
          remove.innerHTML = '&times;';
          remove.addEventListener('click', () => { selectedFiles.splice(index, 1); renderPreviews(); });
          card.classList.add('support-report-preview');
          card.append(image, remove);
          previews.append(card);
        });
      };
      input.addEventListener('change', () => {
        const incoming = Array.from(input.files || []);
        const oversized = incoming.find(file => file.size > 4 * 1024 * 1024);
        if (oversized) {
          message.textContent = 'ไฟล์ ' + oversized.name + ' มีขนาดเกิน 4 MB';
          message.className = 'text-danger mt-3';
          input.value = '';
          return;
        }
        if (selectedFiles.length + incoming.length > 10) {
          message.textContent = 'แนบรูปได้ไม่เกิน 10 รูป';
          message.className = 'text-danger mt-3';
          input.value = '';
          return;
        }
        selectedFiles = selectedFiles.concat(incoming);
        input.value = '';
        message.textContent = '';
        renderPreviews();
      });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        message.textContent = '';
        submit.disabled = true;
        const data = new FormData();
        const descriptionInput = document.getElementById('supportReportDescription');
        if (!descriptionInput) throw new Error('ไม่พบช่องกรอกรายละเอียดปัญหา');
        data.set('description', descriptionInput.value);
        data.set('pageDescription', ${JSON.stringify(pageDescription)});
        data.set('pagePath', window.location.pathname + window.location.search);
        selectedFiles.forEach(file => data.append('attachments', file));
        try {
          const response = await fetch(${JSON.stringify(baseUrl + '/api/support/reports')}, { method: 'POST', body: data, credentials: 'same-origin' });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.error || 'ส่งรายงานไม่สำเร็จ');
          form.reset();
          selectedFiles = [];
          renderPreviews();
          const confirmation = await Swal.fire({
            icon: 'success',
            title: 'ส่งรายงานเรียบร้อยแล้ว',
            text: 'หมายเลข ' + result.reportId,
            color: '#198754',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#198754',
            allowOutsideClick: false,
            allowEscapeKey: false
          });
          if (confirmation.isConfirmed) {
            document.querySelectorAll('.modal.show').forEach(modalElement => {
              const modal = bootstrap.Modal.getInstance(modalElement) || bootstrap.Modal.getOrCreateInstance(modalElement);
              modal.hide();
            });
          }
        } catch (error) {
          message.textContent = error instanceof Error ? error.message : 'ส่งรายงานไม่สำเร็จ';
          message.className = 'text-danger mt-3';
        } finally {
          submit.disabled = false;
        }
      });
    })();
    </script>`;
}
