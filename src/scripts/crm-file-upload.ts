import { MAX_UPLOAD, MAX_UPLOAD_FILES } from '../lib/crm/file-upload-limits';

type Entry = { file: File; state: 'queued'|'invalid'|'uploading'|'saved'|'unconfirmed'|'not_sent'; percent: number };

for (const form of document.querySelectorAll<HTMLFormElement>('[data-files-uploader]')) {
  const input = form.querySelector<HTMLInputElement>('[data-upload-input]')!;
  const zone = form.querySelector<HTMLElement>('[data-dropzone]')!;
  const queue = form.querySelector<HTMLUListElement>('[data-upload-queue]')!;
  const status = form.querySelector<HTMLElement>('[data-upload-status]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-upload-submit]')!;
  const clear = form.querySelector<HTMLButtonElement>('[data-upload-clear]')!;
  const refresh = form.querySelector<HTMLAnchorElement>('[data-upload-refresh]')!;
  const vi = form.dataset.locale === 'vi';
  const version = !!form.dataset.fileId;
  const max = version ? 1 : MAX_UPLOAD_FILES;
  let entries: Entry[] = []; let busy = false; let finished = false;
  const labels = vi
    ? { queued:'Chờ tải', invalid:'Không hợp lệ: chọn tệp từ 1 byte đến 20 MB', uploading:'Đang tải', saved:'Đã lưu', unconfirmed:'Chưa xác nhận — kiểm tra tài liệu trước khi thử lại', not_sent:'Chưa gửi', remove:'Bỏ chọn', empty:'Hãy chọn tệp trước.', complete:'Đã hoàn tất. Mở danh sách để xem tài liệu.', unavailable:'Chưa cấu hình tải trực tiếp lên R2.', expired:'Phiên đăng nhập hoặc quyền truy cập đã thay đổi. Tải lại trang.' }
    : { queued:'Ready', invalid:'Invalid: choose a file between 1 byte and 20 MB', uploading:'Uploading', saved:'Saved', unconfirmed:'Unconfirmed — check Files before trying again', not_sent:'Not sent', remove:'Remove', empty:'Choose files first.', complete:'Finished. Open the list to see your files.', unavailable:'Direct R2 upload has not been configured.', expired:'Your session or access changed. Reload this page.' };
  function render() {
    queue.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement('li'); row.className = 'files-upload-item';
      row.dataset.state = entry.state;
      const info = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = entry.file.name;
      const detail = document.createElement('span'); detail.className = 'files-hint';
      detail.textContent = `${entry.file.size < 1024 ? `${entry.file.size} B` : `${(entry.file.size/1024/1024).toFixed(2)} MB`} · ${labels[entry.state]}${entry.state === 'uploading' ? ` ${entry.percent}%` : ''}`;
      info.appendChild(name); info.appendChild(detail); row.appendChild(info);
      if (!busy && !finished) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'crm-button secondary small'; remove.textContent = labels.remove;
        remove.setAttribute('aria-label',`${labels.remove} ${entry.file.name}`);
        remove.addEventListener('click',() => { entries = entries.filter(item => item !== entry); render(); }); row.appendChild(remove);
      }
      queue.appendChild(row);
    }
    submit.disabled = busy || finished || !entries.some(entry => entry.state === 'queued');
    input.disabled = busy || finished;
    clear.hidden = !entries.length; clear.disabled = busy;
    clear.textContent = finished ? (vi ? 'Chọn tệp khác' : 'Choose more files') : (vi ? 'Xóa lựa chọn' : 'Clear selection');
    zone.setAttribute('aria-busy',String(busy));
  }
  function add(files: File[]) {
    if (busy || finished) return;
    if (files.length + entries.length > max) { status.textContent = vi ? `Chỉ chọn tối đa ${max} tệp mỗi lần.` : `Choose at most ${max} file${max === 1 ? '' : 's'} at a time.`; return; }
    for (const file of files) entries.push({ file, state: file.size > 0 && file.size <= MAX_UPLOAD ? 'queued' : 'invalid', percent:0 });
    status.textContent = vi ? `Đã chọn ${entries.length} tệp. Bấm tải lên để bắt đầu.` : `${entries.length} files selected. Upload when ready.`;
    render();
  }
  input.addEventListener('change',() => { add(Array.from(input.files ?? [])); input.value = ''; });
  clear.addEventListener('click',() => { entries = []; finished = false; refresh.hidden = true; status.textContent = ''; render(); input.focus(); });
  const fileDrag = (event: DragEvent) => event.dataTransfer?.types.includes('Files');
  window.addEventListener('dragover',event => { if (fileDrag(event)) { event.preventDefault(); if (!zone.contains(event.target as Node) && event.dataTransfer) event.dataTransfer.dropEffect = 'none'; } });
  window.addEventListener('drop',event => { if (fileDrag(event)) event.preventDefault(); });
  zone.addEventListener('dragover',event => {
    if (!fileDrag(event)) return;
    event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = busy || finished ? 'none' : 'copy';
    if (!busy && !finished) zone.classList.add('is-dragging');
  });
  zone.addEventListener('dragleave',event => { if (!zone.contains(event.relatedTarget as Node)) zone.classList.remove('is-dragging'); });
  zone.addEventListener('drop',event => {
    if (!fileDrag(event)) return;
    event.preventDefault(); zone.classList.remove('is-dragging');
    const items = Array.from(event.dataTransfer?.items ?? []);
    if (items.some(item => item.webkitGetAsEntry?.()?.isDirectory)) { status.textContent = vi ? 'Chọn các tệp, không kéo cả thư mục.' : 'Drop files rather than folders.'; return; }
    add(Array.from(event.dataTransfer?.files ?? []));
  });
  class UploadError extends Error { constructor(readonly code: string) { super(code); } }
  async function metadata(body: Record<string,unknown>): Promise<Record<string,unknown>> {
    const response = await fetch('/crm/files/uploads',{ method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new UploadError('access');
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UploadError('unconfirmed');
    const result = raw as Record<string,unknown>;
    if (!response.ok) throw new UploadError(typeof result.error === 'string' ? result.error : 'unconfirmed');
    return result;
  }
  function put(entry: Entry, url: string, headers: Record<string,string>): Promise<void> {
    return new Promise((resolve,reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('PUT',url); xhr.timeout = 240_000;
      for (const [key,value] of Object.entries(headers)) xhr.setRequestHeader(key,value);
      xhr.upload.addEventListener('progress',event => { if (event.lengthComputable) { entry.percent = Math.round(event.loaded/event.total*100); render(); } });
      xhr.addEventListener('load',() => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError('put')));
      xhr.addEventListener('error',() => reject(new UploadError('put'))); xhr.addEventListener('timeout',() => reject(new UploadError('put')));
      xhr.send(entry.file); // File bytes go only to the signed R2 S3 URL.
    });
  }
  form.addEventListener('submit',async event => {
    event.preventDefault(); if (busy || finished) return;
    if (!entries.some(entry => entry.state === 'queued')) { status.textContent = labels.empty; return; }
    busy = true; render(); let halt = false; let message = '';
    for (const [index,entry] of entries.entries()) {
      if (entry.state !== 'queued') continue;
      if (halt) { entry.state = 'not_sent'; continue; }
      entry.state = 'uploading'; status.textContent = `${vi ? 'Đang tải' : 'Uploading'} ${index+1}/${entries.length}`; render();
      let reserved = false;
      try {
        const signed = await metadata({ action:'sign',name:entry.file.name,size:entry.file.size,parent:form.dataset.parent || undefined,fileId:form.dataset.fileId || undefined,version:version ? Number(form.dataset.version) : undefined });
        if (typeof signed.url !== 'string' || typeof signed.uploadId !== 'string' || !signed.headers || typeof signed.headers !== 'object') throw new UploadError('unconfirmed');
        reserved = true;
        const url = new URL(signed.url);
        const remote = url.protocol === 'https:' && /^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(url.hostname);
        const local = ['localhost','127.0.0.1'].includes(location.hostname) && url.origin === location.origin && url.pathname.startsWith('/cdn-cgi/local/r2/s3/');
        if (!remote && !local) throw new UploadError('unconfirmed');
        try { await put(entry,url.href,signed.headers as Record<string,string>); }
        catch { /* A lost PUT response is resolved by HEAD during completion. Never resend bytes. */ }
        const completed = await metadata({ action:'complete',uploadId:signed.uploadId });
        if (typeof completed.fileId !== 'string') throw new UploadError('unconfirmed');
        entry.state = 'saved';
      } catch (error) {
        const invalid = !reserved && error instanceof UploadError && ['invalid','size','too_long'].includes(error.code);
        entry.state = invalid ? 'invalid' : 'unconfirmed'; halt = !invalid;
        if (error instanceof UploadError && error.code === 'not_configured') message = labels.unavailable;
        else if (error instanceof UploadError && error.code === 'rate_limit') message = vi ? 'Có quá nhiều lượt tải đang chờ. Hãy thử lại sau vài phút.' : 'Too many uploads are pending. Try again in a few minutes.';
        else if (error instanceof UploadError && ['access','not_found'].includes(error.code)) message = labels.expired;
      }
      render();
    }
    busy = false; finished = true; refresh.hidden = false;
    status.textContent = message || `${entries.filter(entry => entry.state === 'saved').length}/${entries.length} ${vi ? 'tệp đã lưu.' : 'files saved.'} ${labels.complete}`;
    render();
  });
  render();
}
