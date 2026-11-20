"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSupportReportsPage = renderSupportReportsPage;
function renderSupportReportsPage(canChangeStatus, apiBase) {
    const statusOptions = [
        ['OPEN', 'รับแจ้งแล้ว'],
        ['IN_PROGRESS', 'กำลังดำเนินการ'],
        ['RESOLVED', 'แก้ไขแล้ว'],
        ['CLOSED', 'ปิดรายการ']
    ];
    const statusLabels = Object.fromEntries(statusOptions);
    return `
  <section class="card border-0 shadow-sm rounded-3">
    <div class="card-body p-3 p-lg-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h4 class="fw-bold text-navy mb-1"><i class="bi bi-inbox me-2"></i>รายการปัญหาการใช้งานระบบ</h4>
          <p class="text-muted mb-0">ตรวจสอบรายละเอียดและสถานะรายการแจ้งปัญหา</p>
        </div>
        <button class="btn btn-outline-secondary btn-sm" id="supportReportsRefresh" type="button"><i class="bi bi-arrow-clockwise me-1"></i>รีเฟรช</button>
      </div>
      <div id="supportReportsMessage" class="alert d-none" role="status"></div>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light"><tr>
            <th style="width:44px"><span class="visually-hidden">บทสนทนา</span></th><th style="width:72px">ลำดับ</th><th>เลขที่ / วันเวลา</th><th>ผู้แจ้ง</th><th>ทีม / จังหวัด</th><th>หน้าที่พบปัญหา</th><th>รายละเอียด</th><th>ข้อมูลการสนทนา</th><th>สถานะปัญหา</th>
          </tr></thead>
          <tbody id="supportReportsRows"><tr><td colspan="9" class="text-center text-muted py-4">กำลังโหลดรายการ...</td></tr></tbody>
        </table>
      </div>
      <div class="d-flex justify-content-between align-items-center gap-2">
        <small class="text-muted" id="supportReportsCount"></small>
        <div class="btn-group btn-group-sm" role="group" aria-label="แบ่งหน้ารายการปัญหา">
          <button class="btn btn-outline-secondary" id="supportReportsPrevious" type="button">ก่อนหน้า</button>
          <button class="btn btn-outline-secondary" id="supportReportsNext" type="button">ถัดไป</button>
        </div>
      </div>
    </div>
  </section>
  <script>
  (() => {
    const rows = document.getElementById('supportReportsRows');
    const message = document.getElementById('supportReportsMessage');
    const count = document.getElementById('supportReportsCount');
    const pageSize = 25;
    const canChangeStatus = ${canChangeStatus ? 'true' : 'false'};
    const statusOptions = ${JSON.stringify(statusOptions)};
    const statusLabels = ${JSON.stringify(statusLabels)};
    const statusButtonClasses = {
      OPEN: 'btn-warning text-dark',
      IN_PROGRESS: 'btn-primary text-white',
      RESOLVED: 'btn-success text-white',
      CLOSED: 'btn-secondary text-white'
    };
    let page = 1;
    let total = 0;

    const showMessage = (text, type = 'danger') => {
      message.textContent = text;
      message.className = 'alert alert-' + type;
    };
    const readApiResponse = async (response, defaultMessage) => {
      const contentType = response.headers && response.headers.get('content-type') || '';
      const body = await response.text();
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ใช่ข้อมูล JSON (HTTP ' + response.status + ') กรุณาเข้าสู่ระบบใหม่หรือติดต่อผู้ดูแลระบบ');
      }
      let data;
      try {
        data = JSON.parse(body);
      } catch (_) {
        throw new Error('เซิร์ฟเวอร์ตอบกลับ JSON ไม่ถูกต้อง (HTTP ' + response.status + ') กรุณาติดต่อผู้ดูแลระบบ');
      }
      if (!response.ok || !data.success) throw new Error(data.error || defaultMessage);
      return data;
    };
    const cell = (text, className = '') => {
      const element = document.createElement('td');
      element.textContent = text == null || text === '' ? '-' : String(text);
      if (className) element.className = className;
      return element;
    };
    const formatDate = value => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('th-TH');
    };
    const createConversationRow = (report, parentRow, columnCount) => {
      const toggleCell = document.createElement('td');
      const detailRow = document.createElement('tr');
      detailRow.hidden = true;
      const detailCell = document.createElement('td');
      detailCell.colSpan = columnCount;
      const panel = document.createElement('div');
      panel.className = 'p-2 bg-light rounded';
      const feedback = document.createElement('div');
      feedback.className = 'small text-muted mb-2';
      feedback.textContent = 'กด + เพื่อโหลดประวัติข้อความ';
      const historyRows = document.createElement('tbody');
      const historyTable = document.createElement('table');
      historyTable.className = 'table table-sm table-bordered align-middle mb-0';
      historyTable.innerHTML = '<thead class="table-light"><tr><th style="width:64px">ลำดับ</th><th>ข้อความ</th><th style="width:260px">ผู้ส่ง / วันเวลา</th></tr></thead>';
      historyTable.append(historyRows);
      panel.append(feedback, historyTable);
      detailCell.append(panel);
      detailRow.append(detailCell);

      if (report.message_count > 0) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'btn btn-outline-primary btn-sm px-2 py-0';
        toggle.textContent = '+';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'แสดงบทสนทนา ' + report.id);
        let loaded = false;
        let loading = false;
        toggle.addEventListener('click', async () => {
          const expanded = toggle.getAttribute('aria-expanded') !== 'true';
          toggle.setAttribute('aria-expanded', String(expanded));
          toggle.textContent = expanded ? '−' : '+';
          toggle.setAttribute('aria-label', (expanded ? 'ซ่อน' : 'แสดง') + 'บทสนทนา ' + report.id);
          if (parentRow.nextElementSibling !== detailRow) parentRow.after(detailRow);
          detailRow.hidden = !expanded;
          if (!expanded || loaded || loading) return;

          loading = true;
          feedback.className = 'small text-muted mb-2';
          feedback.textContent = 'กำลังโหลดประวัติข้อความ...';
          try {
            const response = await fetch(${JSON.stringify(apiBase + '/api/support/reports/')} + encodeURIComponent(report.id) + '/messages', {
              credentials: 'same-origin', headers: { 'Accept': 'application/json' }
            });
            const data = await readApiResponse(response, 'โหลดประวัติข้อความไม่สำเร็จ');
            historyRows.replaceChildren();
            if (!data.messages.length) {
              feedback.className = 'small text-muted mb-2';
              feedback.textContent = 'ไม่พบข้อความในประวัติ';
            } else {
              data.messages.forEach((item, index) => {
                const messageRow = document.createElement('tr');
                messageRow.className = item.sender_type === 'ADMIN' ? 'table-primary' : 'table-success';
                const sequence = document.createElement('td');
                sequence.textContent = String(index + 1);
                const content = document.createElement('td');
                content.className = 'text-break';
                content.style.whiteSpace = 'pre-wrap';
                content.textContent = item.message;
                const sender = document.createElement('td');
                sender.textContent = (item.sender_type === 'ADMIN' ? 'ผู้ดูแลระบบ: ' : 'ผู้ใช้งาน: ') + item.sender_name + ' (' + item.sender_role + ')';
                const sentAt = document.createElement('small');
                sentAt.className = 'd-block text-muted';
                sentAt.textContent = formatDate(item.created_at);
                sender.append(sentAt);
                messageRow.append(sequence, content, sender);
                historyRows.append(messageRow);
              });
              feedback.className = 'small text-muted mb-2';
              feedback.textContent = '';
            }
            loaded = true;
          } catch (error) {
            feedback.className = 'small text-danger mb-2';
            feedback.textContent = error instanceof Error ? error.message : 'โหลดประวัติข้อความไม่สำเร็จ';
          } finally {
            loading = false;
          }
        });
        toggleCell.append(toggle);
      }
      return { toggleCell, detailRow };
    };
    const openDetails = report => {
      const attachments = Array.isArray(report.attachments) ? report.attachments : [];
      const attachmentHtml = attachments.map(item =>
        '<a class="d-inline-block me-2 mb-2" target="_blank" rel="noopener noreferrer" href="' +
        ${JSON.stringify(apiBase + '/api/support/reports/')} + encodeURIComponent(report.id) + '/attachments/' + encodeURIComponent(item.id) + '">' +
        '<img alt="รูปแนบ" src="' + ${JSON.stringify(apiBase + '/api/support/reports/')} + encodeURIComponent(report.id) + '/attachments/' + encodeURIComponent(item.id) + '" style="width:96px;height:72px;object-fit:cover;border-radius:6px"></a>'
      ).join('');
      const safe = value => String(value || '-').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
      const reportApiUrl = ${JSON.stringify(apiBase + '/api/support/reports/')} + encodeURIComponent(report.id);
      Swal.fire({
        title: 'รายละเอียดปัญหา',
        width: 920,
        html: '<div class="text-start"><p><b>เลขที่:</b> ' + safe(report.id) + '</p><p><b>ผู้แจ้ง:</b> ' + safe(report.reporter_name) + ' (' + safe(report.reporter_role) + ')</p><p><b>หน้า:</b> ' + safe(report.page_description) + ' · ' + safe(report.page_path) + '</p><p><b>รายละเอียด:</b></p><div class="border rounded p-3 mb-3" style="white-space:pre-wrap">' + safe(report.description) + '</div><div class="mb-3">' + attachmentHtml + '</div>' +
          (canChangeStatus ? '<hr><label class="form-label fw-bold" for="supportReportAdminMessage">ข้อมูลเพิ่มเติมจาก ผู้ดูแลระบบ</label><textarea id="supportReportAdminMessage" class="form-control mb-2" rows="3" maxlength="10000"></textarea><button id="supportReportAdminMessageSubmit" type="button" class="btn btn-primary btn-sm mb-3">บันทึกข้อมูลเพิ่มเติม</button>' : '') +
          '<div id="supportReportMessageFeedback" class="alert d-none py-2" role="status"></div><h6 class="fw-bold mt-2">ประวัติการแจ้งข้อมูลปัญหา</h6><div class="table-responsive"><table class="table table-bordered align-middle"><thead class="table-light"><tr><th style="width:64px">ลำดับ</th><th>ข้อมูลเพิ่มเติม</th><th style="width:220px">ผู้ส่ง</th></tr></thead><tbody id="supportReportMessageRows"><tr><td colspan="3" class="text-center text-muted">กำลังโหลดประวัติ...</td></tr></tbody></table></div></div>',
        confirmButtonText: 'ปิด',
        didOpen: popup => {
          const historyRows = popup.querySelector('#supportReportMessageRows');
          const feedback = popup.querySelector('#supportReportMessageFeedback');
          const setFeedback = (text, type) => {
            feedback.textContent = text;
            feedback.className = 'alert alert-' + type + ' py-2';
          };
          const loadMessages = async () => {
            historyRows.replaceChildren();
            const response = await fetch(reportApiUrl + '/messages', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
            const data = await readApiResponse(response, 'โหลดประวัติข้อความไม่สำเร็จ');
            if (!data.messages.length) {
              const emptyRow = document.createElement('tr');
              const emptyCell = document.createElement('td');
              emptyCell.colSpan = 3;
              emptyCell.className = 'text-center text-muted';
              emptyCell.textContent = 'ยังไม่มีข้อมูลเพิ่มเติม';
              emptyRow.append(emptyCell);
              historyRows.append(emptyRow);
              return;
            }
            data.messages.forEach((item, index) => {
              const row = document.createElement('tr');
              row.className = item.sender_type === 'ADMIN' ? 'table-primary' : 'table-success';
              const sequence = document.createElement('td');
              sequence.textContent = String(index + 1);
              const content = document.createElement('td');
              content.className = 'text-break';
              content.style.whiteSpace = 'pre-wrap';
              content.textContent = item.message;
              const sender = document.createElement('td');
              sender.textContent = (item.sender_type === 'ADMIN' ? 'ผู้ดูแลระบบ: ' : 'ผู้แจ้ง: ') + item.sender_name + ' (' + item.sender_role + ')';
              const sentAt = document.createElement('small');
              sentAt.className = 'd-block text-muted';
              sentAt.textContent = formatDate(item.created_at);
              sender.append(sentAt);
              row.append(sequence, content, sender);
              historyRows.append(row);
            });
          };
          void loadMessages().catch(error => setFeedback(error instanceof Error ? error.message : 'โหลดประวัติข้อความไม่สำเร็จ', 'danger'));
          const submit = popup.querySelector('#supportReportAdminMessageSubmit');
          if (submit) {
            submit.addEventListener('click', async () => {
              const input = popup.querySelector('#supportReportAdminMessage');
              const messageText = input.value.trim();
              if (!messageText) {
                setFeedback('กรุณากรอกข้อมูลเพิ่มเติม', 'danger');
                return;
              }
              submit.disabled = true;
              feedback.className = 'alert d-none py-2';
              try {
                const response = await fetch(reportApiUrl + '/messages', {
                  method: 'POST', credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                  body: JSON.stringify({ message: messageText })
                });
                await readApiResponse(response, 'บันทึกข้อมูลเพิ่มเติมไม่สำเร็จ');
                input.value = '';
                await loadMessages();
                setFeedback('บันทึกข้อมูลเพิ่มเติมเรียบร้อยแล้ว', 'success');
                await load();
              } catch (error) {
                setFeedback(error instanceof Error ? error.message : 'บันทึกข้อมูลเพิ่มเติมไม่สำเร็จ', 'danger');
              } finally {
                submit.disabled = false;
              }
            });
          }
        }
      });
    };
    const makeRow = (report, index) => {
      const row = document.createElement('tr');
      const conversation = createConversationRow(report, row, 9);
      row.append(conversation.toggleCell);
      row.append(cell(String((page - 1) * pageSize + index + 1)));
      const identity = document.createElement('td');
      identity.append(document.createTextNode(report.id + ' '));
      const date = document.createElement('small');
      date.className = 'd-block text-muted';
      date.textContent = formatDate(report.created_at);
      identity.append(date);
      row.append(identity);
      row.append(cell((report.reporter_name || '-') + ' · ' + (report.reporter_role || '-')));
      row.append(cell([report.team_name || report.team_id, report.province].filter(Boolean).join(' / ')));
      row.append(cell(report.page_description));

      const detailCell = document.createElement('td');
      const detailButton = document.createElement('button');
      detailButton.type = 'button';
      detailButton.className = 'btn btn-link btn-sm p-0 text-start';
      detailButton.textContent = (report.description || '').slice(0, 100) || 'ดูรายละเอียด';
      detailButton.addEventListener('click', () => openDetails(report));
      detailCell.append(detailButton);
      row.append(detailCell);
      row.append(cell(String(report.message_count)));

      const statusCell = document.createElement('td');
      const statusButton = document.createElement('button');
      statusButton.type = 'button';
      statusButton.className = 'btn btn-sm ' + (statusButtonClasses[report.status] || 'btn-secondary text-white') + (canChangeStatus ? '' : ' opacity-100');
      statusButton.textContent = statusLabels[report.status] || report.status || 'ไม่ระบุ';
      statusButton.disabled = !canChangeStatus;
      if (canChangeStatus) statusButton.title = 'คลิกเพื่อเปลี่ยนสถานะรายการนี้';
      statusButton.addEventListener('click', async () => {
        if (!canChangeStatus) return;
        try {
          const result = await Swal.fire({
            title: 'เปลี่ยนสถานะปัญหานี้?',
            text: report.id,
            input: 'select',
            inputOptions: Object.fromEntries(statusOptions),
            inputValue: report.status,
            showCancelButton: true,
            confirmButtonText: 'บันทึกสถานะ',
            cancelButtonText: 'ยกเลิก'
          });
          if (!result.isConfirmed) return;
          const response = await fetch(${JSON.stringify(apiBase + '/api/support/reports/')} + encodeURIComponent(report.id) + '/status', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ status: result.value })
          });
          await readApiResponse(response, 'เปลี่ยนสถานะไม่สำเร็จ');
          await load();
        } catch (error) {
          showMessage(error instanceof Error ? error.message : 'เปลี่ยนสถานะไม่สำเร็จ');
        }
      });
      statusCell.append(statusButton);
      row.append(statusCell);
      return row;
    };
    const load = async () => {
      rows.replaceChildren();
      const loading = document.createElement('tr');
      const loadingCell = cell('กำลังโหลดรายการ...', 'text-center text-muted py-4');
      loadingCell.colSpan = 9;
      loading.append(loadingCell);
      rows.append(loading);
      try {
        const response = await fetch(${JSON.stringify(apiBase + '/api/support/reports')} + '?page=' + page + '&limit=' + pageSize, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
        const data = await readApiResponse(response, 'โหลดรายการไม่สำเร็จ');
        total = data.total;
        rows.replaceChildren();
        if (!data.reports.length) {
          const empty = document.createElement('tr');
          const emptyCell = cell('ยังไม่มีรายการปัญหา', 'text-center text-muted py-4');
          emptyCell.colSpan = 9;
          empty.append(emptyCell);
          rows.append(empty);
        } else data.reports.forEach((report, index) => rows.append(makeRow(report, index)));
        count.textContent = 'รายการทั้งหมด ' + total + ' · หน้า ' + page + ' / ' + Math.max(1, Math.ceil(total / pageSize));
        document.getElementById('supportReportsPrevious').disabled = page <= 1;
        document.getElementById('supportReportsNext').disabled = page * pageSize >= total;
        message.className = 'alert d-none';
      } catch (error) {
        showMessage(error instanceof Error ? error.message : 'โหลดรายการไม่สำเร็จ');
      }
    };
    document.getElementById('supportReportsRefresh').addEventListener('click', () => { void load(); });
    document.getElementById('supportReportsPrevious').addEventListener('click', () => { if (page > 1) { page--; void load(); } });
    document.getElementById('supportReportsNext').addEventListener('click', () => { if (page * pageSize < total) { page++; void load(); } });
    void load();
  })();
  </script>`;
}
