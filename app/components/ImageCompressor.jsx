"use client";

import { useEffect, useRef, useState } from "react";
import { downloadZip } from "client-zip";
import Link from "next/link";
import { Ban, Check, Crown, Download, FileArchive, FileImage, Gauge, ImagePlus, LoaderCircle, Lock, RotateCcw, Settings2, SlidersHorizontal, TriangleAlert, X } from "lucide-react";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function extensionFor(mimeType) {
  return mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
}

function getTargetSize(width, height, resize, maxWidth) {
  if (!resize || width <= maxWidth) return { width, height };
  const ratio = maxWidth / width;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const source = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(source);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new Error("تعذر قراءة هذه الصورة."));
    };
    image.src = source;
  });
}

async function compressImage(file, settings) {
  const image = await loadImage(file);
  const { width, height } = getTargetSize(image.naturalWidth || image.width, image.naturalHeight || image.height, settings.resize, settings.maxWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("تعذر إنشاء الملف المضغوط.")), settings.format, settings.format === "image/png" ? undefined : settings.quality / 100);
  });
  return { blob, width, height };
}

function limitNotice(snapshot) {
  if (snapshot?.plan === "guest") {
    return {
      tone: "limit",
      title: "انتهت حصة الزائر لهذا اليوم",
      body: "يمكن للزوار معالجة 5 صور يومياً. أنشئ حساباً مجانياً لتحصل على 25 صورة يومياً، وتبقى صورك على جهازك دائماً.",
      action: { href: "/signup", label: "إنشاء حساب مجاني" },
    };
  }
  return {
    tone: "limit",
    title: "وصلت إلى حد الخطة المجانية",
    body: "الخطة المجانية تتيح 25 صورة يومياً. ترقية Pro تفتح استخداماً غير محدود بدون انتظار.",
    action: { href: "/account", label: "ترقية إلى Pro" },
  };
}

export default function ImageCompressor() {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [isZipping, setIsZipping] = useState(false);
  const [quota, setQuota] = useState(null);
  const [notice, setNotice] = useState(null);
  const [settings, setSettings] = useState({ quality: 76, format: "image/webp", resize: false, maxWidth: 1920 });
  const inputRef = useRef(null);

  useEffect(() => () => results.forEach((result) => { if (result.url) URL.revokeObjectURL(result.url); }), [results]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview?.url]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (active) applyQuota(data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const doneCount = results.filter((result) => result.status === "done").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const blockedCount = results.filter((result) => result.status === "blocked").length;
  const batchTotal = results.filter((result) => result.status !== "blocked").length;
  const selectedTotal = files.reduce((total, file) => total + file.size, 0);
  const outputTotal = results.reduce((total, result) => total + (result.status === "done" ? result.blob.size : 0), 0);
  const doneInputTotal = results.reduce((total, result) => total + (result.status === "done" ? result.file.size : 0), 0);
  const saving = doneInputTotal ? Math.max(0, Math.round((1 - outputTotal / doneInputTotal) * 100)) : 0;
  const canDownloadAll = doneCount > 1;
  const quotaExhausted = Boolean(quota && !quota.unlimited && quota.remaining === 0);

  function applyQuota(payload) {
    if (!payload || typeof payload !== "object" || payload.dailyLimit === undefined) return;
    setQuota({
      plan: payload.plan,
      planLabel: payload.planLabel,
      unlimited: Boolean(payload.unlimited),
      usage: Number(payload.usage) || 0,
      dailyLimit: payload.dailyLimit,
      remaining: payload.remaining ?? 0,
      guest: Boolean(payload.guest),
    });
  }

  function selectFiles(incoming) {
    const images = Array.from(incoming).filter((file) => acceptedTypes.includes(file.type)).slice(0, 20);
    results.forEach((result) => { if (result.url) URL.revokeObjectURL(result.url); });
    setResults([]);
    setFiles(images);
    setNotice(null);
  }

  function clearAll() {
    results.forEach((result) => { if (result.url) URL.revokeObjectURL(result.url); });
    setResults([]);
    setFiles([]);
    setProgress(0);
    setNotice(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function updateResult(index, patch) {
    setResults((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  }

  async function compressOne(file, index, currentSettings) {
    try {
      updateResult(index, { status: "working" });
      const output = await compressImage(file, currentSettings);
      const name = `${file.name.replace(/\.[^.]+$/, "")}-nuvello.${extensionFor(currentSettings.format)}`;
      updateResult(index, { status: "done", ...output, url: URL.createObjectURL(output.blob), name });
      return true;
    } catch (error) {
      updateResult(index, { status: "failed", error: error.message });
      return false;
    }
  }

  async function handleCompress() {
    if (!files.length || isCompressing) return;
    setNotice(null);

    // Ask the server how much of this batch the plan allows.
    let reservation;
    try {
      reservation = await fetch("/api/usage/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: files.length }),
      });
    } catch {
      setNotice({ tone: "error", title: "تعذر الاتصال بالخادم", body: "تحقق من اتصالك ثم أعد المحاولة." });
      return;
    }

    const snapshot = await reservation.json().catch(() => null);
    if (!snapshot) {
      setNotice({ tone: "error", title: "رد غير متوقع من الخادم", body: "أعد المحاولة بعد قليل." });
      return;
    }
    applyQuota(snapshot);

    const allowed = Math.max(0, Math.min(files.length, Number(snapshot.allowed) || 0));
    if (allowed === 0) {
      setNotice(limitNotice(snapshot));
      return;
    }

    const batch = files.slice(0, allowed);
    const skipped = files.slice(allowed);

    results.forEach((result) => { if (result.url) URL.revokeObjectURL(result.url); });
    setResults([
      ...batch.map((file) => ({ file, status: "pending" })),
      ...skipped.map((file) => ({ file, status: "blocked" })),
    ]);
    setIsCompressing(true);
    setProgress(0);

    let failures = 0;
    for (const [index, file] of batch.entries()) {
      if (!(await compressOne(file, index, settings))) failures += 1;
      setProgress(Math.round(((index + 1) / batch.length) * 100));
    }

    // Unreadable files should not cost quota.
    if (failures > 0) {
      try {
        const released = await fetch("/api/usage/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: failures }),
        });
        if (released.ok) applyQuota(await released.json());
      } catch {
        // Quota refresh failed; the next page load will resync it.
      }
    }

    setIsCompressing(false);
    if (skipped.length) setNotice(limitNotice(snapshot));
  }

  async function handleDownloadAll() {
    if (!canDownloadAll || isZipping) return;
    setIsZipping(true);
    try {
      const succeeded = results.filter((result) => result.status === "done");
      const buffered = await downloadZip(
        succeeded.map((result) => {
          const safeName = result.name.replace(/[\\/:*?"<>|]/g, "_");
          return { name: safeName, input: result.blob };
        }), { buffers: true, buffersAreUTF8: true },
      ).blob();
      const url = URL.createObjectURL(buffered);
      const link = document.createElement("a");
      link.href = url;
      link.download = "nuvello-images.zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (error) {
      setNotice({ tone: "error", title: "تعذر إنشاء ملف ZIP", body: error?.message || "أعد المحاولة." });
    }
    setIsZipping(false);
  }

  function openPreview(result) {
    if (!result.blob || preview) return;
    setPreview({
      url: URL.createObjectURL(result.blob),
      name: result.name,
      type: result.blob.type,
      size: result.blob.size,
    });
  }

  function closePreview() {
    setPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  return (
    <section className="workspace" aria-label="أداة ضغط الصور">
      <div className="workspace-topline">
        <div><span className="section-label">لوحة العمل</span><h2>حضّر الصور</h2></div>
        <div className="topline-meta">
          {quota && (
            <div className={`quota-chip ${quota.unlimited ? "is-pro" : quotaExhausted ? "is-empty" : ""}`}>
              {quota.unlimited
                ? <><Crown size={15} /> Pro · استخدام مفتوح</>
                : <><Gauge size={15} /> متبقٍ اليوم {quota.remaining} من {quota.dailyLimit}</>}
              {quota.plan === "guest" && <Link href="/signup">أنشئ حساباً</Link>}
              {!quota.guest && quotaExhausted && <Link href="/account">ترقية</Link>}
            </div>
          )}
          <div className="file-types"><FileImage size={16} /> JPG، PNG، WebP</div>
        </div>
      </div>

      <div
        className={`drop-area ${isDragging ? "is-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectFiles(event.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => selectFiles(event.target.files)} />
        <span className="drop-icon"><ImagePlus size={28} /></span>
        <strong>اسحب الصور إلى هنا</strong>
        <span>أو اختر الملفات من جهازك</span>
        <small>حتى 20 صورة في المرة الواحدة</small>
      </div>

      <div className="settings-panel">
        <div className="settings-title"><Settings2 size={18} /><span>إعدادات التصدير</span></div>
        <label className="quality-control">
          <span>الجودة <b>{settings.quality}%</b></span>
          <input type="range" min="25" max="95" value={settings.quality} onChange={(event) => setSettings({ ...settings, quality: Number(event.target.value) })} />
        </label>
        <label className="select-control"><span>الصيغة</span><select value={settings.format} onChange={(event) => setSettings({ ...settings, format: event.target.value })}><option value="image/webp">WebP</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label>
        <label className="resize-control"><input type="checkbox" checked={settings.resize} onChange={(event) => setSettings({ ...settings, resize: event.target.checked })} /><span><b>تصغير الأبعاد الكبيرة</b><small>لحد أقصى {settings.maxWidth}px</small></span></label>
        <label className="width-control"><span>الحد الأقصى للعرض</span><input type="number" min="320" max="6000" step="10" disabled={!settings.resize} value={settings.maxWidth} onChange={(event) => setSettings({ ...settings, maxWidth: Math.max(320, Number(event.target.value) || 1920) })} /></label>
      </div>

      <div className="workspace-actions">
        <button
          className="button primary"
          disabled={!files.length || isCompressing || quotaExhausted}
          title={quotaExhausted ? "استنفدت حصتك اليومية" : undefined}
          onClick={handleCompress}
        >
          {isCompressing ? <LoaderCircle className="spin" size={19} /> : <SlidersHorizontal size={19} />}
          {isCompressing ? "جاري التجهيز..." : "تجهيز الصور"}
        </button>
        <button className="button secondary" disabled={!files.length || isCompressing} onClick={clearAll}><RotateCcw size={18} />مسح الكل</button>
        {!!files.length && <span className="selection-note">تم اختيار {files.length} {files.length === 1 ? "صورة" : "صور"} · {formatBytes(selectedTotal)}</span>}
      </div>

      {notice && (
        <div className={`workspace-notice ${notice.tone}`} role="status">
          <TriangleAlert size={18} />
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.body}</p>
          </div>
          {notice.action && <Link className="button primary" href={notice.action.href}>{notice.action.label}</Link>}
          <button type="button" className="notice-close" aria-label="إغلاق التنبيه" onClick={() => setNotice(null)}><X size={16} /></button>
        </div>
      )}

      {isCompressing && (
        <div className="progress-wrap" role="status" aria-live="polite">
          <div className="progress-bar" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
          <small>جاري ضغط {doneCount + failedCount} من {batchTotal}...</small>
        </div>
      )}

      {!!results.length && <>
        <div className="result-summary">
          <div><span>الصور</span><strong>{results.length}</strong></div>
          <div><span>قبل الضغط</span><strong>{formatBytes(selectedTotal)}</strong></div>
          <div><span>بعد الضغط</span><strong>{formatBytes(outputTotal)}</strong></div>
          <div className="saving"><span>تم توفير</span><strong>{saving}%</strong></div>
        </div>
        <div className="results-list" aria-live="polite">
          {results.map((result, index) => (
            <ResultRow key={`${result.file.name}-${index}`} result={result} onPreview={openPreview} />
          ))}
        </div>
        {!isCompressing && <div className="results-footer">
          <span className="results-note">
            {doneCount} جاهزة{failedCount ? ` · ${failedCount} فشلت` : ""}{blockedCount ? ` · ${blockedCount} خارج الحصة` : ""}
          </span>
          {canDownloadAll && (
            <button className="button primary" disabled={isZipping} onClick={handleDownloadAll}>
              {isZipping ? <LoaderCircle className="spin" size={18} /> : <FileArchive size={18} />}
              {isZipping ? "جاري إنشاء ZIP..." : `تحميل الكل (${doneCount})`}
            </button>
          )}
        </div>}
      </>}

      {preview && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-label={`معاينة ${preview.name}`} onClick={closePreview}>
          <div className="preview-card" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{preview.name}</strong>
              <button type="button" className="preview-close" onClick={closePreview} aria-label="إغلاق المعاينة"><X size={18} /></button>
            </header>
            <div className="preview-canvas"><img src={preview.url} alt={`معاينة ${preview.name}`} /></div>
            <footer>
              <span>{formatBytes(preview.size)} · {preview.type}</span>
              <a className="download" href={preview.url} download={preview.name}><Download size={18} />تحميل</a>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

function ResultRow({ result, onPreview }) {
  const { file, status } = result;

  if (status === "failed") {
    return (
      <article className="result-row failed">
        <span className="file-thumb"><X size={22} /></span>
        <div>
          <strong>{file.name}</strong>
          <small>{result.error}</small>
        </div>
        <Ban size={18} className="row-status failed-status" />
      </article>
    );
  }

  if (status === "blocked") {
    return (
      <article className="result-row blocked">
        <span className="file-thumb"><Lock size={20} /></span>
        <div>
          <strong>{file.name}</strong>
          <small>خارج الحصة اليومية · لن تُعالج</small>
        </div>
        <Lock size={18} className="row-status" />
      </article>
    );
  }

  if (status === "working") {
    return (
      <article className="result-row working">
        <span className="file-thumb"><LoaderCircle className="spin" size={22} /></span>
        <div>
          <strong>{file.name}</strong>
          <small>{formatBytes(file.size)} · جاري الضغط...</small>
        </div>
        <LoaderCircle className="spin row-status" size={18} />
      </article>
    );
  }

  if (status === "pending") {
    return (
      <article className="result-row pending">
        <span className="file-thumb"><FileImage size={22} /></span>
        <div>
          <strong>{file.name}</strong>
          <small>{formatBytes(file.size)} · في الانتظار</small>
        </div>
      </article>
    );
  }

  const saved = Math.max(0, Math.round((1 - result.blob.size / file.size) * 100));
  return (
    <article className="result-row done">
      <button type="button" className="result-thumb" onClick={() => onPreview(result)} aria-label={`معاينة ${result.name}`}>
        <img src={result.url} alt="" />
      </button>
      <div>
        <strong>{result.name}</strong>
        <small>
          {formatBytes(file.size)} ← {formatBytes(result.blob.size)} · وفر {saved}% · {result.width}×{result.height}
          <button type="button" className="preview-link" onClick={() => onPreview(result)}>معاينة قبل/بعد</button>
        </small>
      </div>
      <div className="row-side">
        <span className="row-done-badge"><Check size={15} />تم</span>
        <a className="download" href={result.url} download={result.name}><Download size={18} />تحميل</a>
      </div>
    </article>
  );
}
