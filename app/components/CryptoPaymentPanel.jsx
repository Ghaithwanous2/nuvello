"use client";

import { useEffect, useRef, useState } from "react";
import { Bitcoin, CircleCheck, Clock, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/payment-status";

export default function CryptoPaymentPanel({ offers, currency, networkLabel, initialOrderId, configured }) {
  const [selected, setSelected] = useState(offers?.[0]?.kind || "period");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [checkedOrders, setCheckedOrders] = useState(0);
  const pollRef = useRef(null);

  const offer = offers?.find((item) => item.kind === selected) || offers?.[0] || null;

  useEffect(() => {
    if (!initialOrderId) return undefined;
    let cancelled = false;
    let attempts = 0;

    async function checkOrder() {
      attempts += 1;
      try {
        const response = await fetch(`/api/billing/crypto/order?order=${encodeURIComponent(initialOrderId)}`, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (cancelled || !data?.order) return;

        setOrder(data.order);
        setCheckedOrders(attempts);
        if (data.order.paid) {
          clearInterval(pollRef.current);
          // Give the server a moment to persist, then re-render server data.
          setTimeout(() => window.location.replace("/account?crypto=paid"), 1200);
        }
      } catch {
        // Ignore transient failures and keep polling.
      }
    }

    checkOrder();
    pollRef.current = setInterval(checkOrder, 6000);
    return () => { cancelled = true; clearInterval(pollRef.current); };
  }, [initialOrderId]);

  async function startPayment() {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/crypto/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: selected }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "تعذر بدء عملية الدفع.");
    } catch {
      setError("تعذر الاتصال بخدمة الدفع.");
    }
    setIsLoading(false);
  }

  if (!offers?.length) {
    return <p className="crypto-note">لم تُفعّل أسعار الكريبتو بعد. اضبط السعر عبر متغيرات البيئة.</p>;
  }

  return (
    <div className="crypto-panel">
      {initialOrderId && (
        <div className={`crypto-status ${order ? paymentStatusTone(order.status) : "waiting"}`}>
          {order?.paid
            ? <CircleCheck size={18} />
            : <Clock size={18} />}
          <div>
            <strong>
              {order?.paid
                ? "تم تأكيد الدفع وتفعيل Pro"
                : `بانتظار تأكيد الدفع (${paymentStatusLabel(order?.status || "created")})`}
            </strong>
            <p>
              {order?.paid
                ? "شكراً لك. يُحدَّث حسابك الآن..."
                : "بعد الدفع على الشبكة تحتاج المعاملة بعض التأكيدات. يمكنك إغلاق الصفحة والعودة لاحقاً، وسيُفعّل حسابك تلقائياً."}
            </p>
          </div>
          {!order?.paid && <RefreshCw size={16} className={checkedOrders % 2 ? "spin-slow" : ""} />}
        </div>
      )}

      <div className="crypto-options">
        {offers.map((item) => (
          <button
            key={item.kind}
            type="button"
            className={`crypto-option ${item.kind === selected ? "is-selected" : ""}`}
            onClick={() => setSelected(item.kind)}
            aria-pressed={item.kind === selected}
          >
            <span className="crypto-option-head">
              <Bitcoin size={17} />
              <b>{item.title}</b>
            </span>
            <strong className="crypto-price">{item.priceLabel}</strong>
            <small>{item.note}</small>
          </button>
        ))}
      </div>

      <div className="crypto-actions">
        <button className="button primary" type="button" onClick={startPayment} disabled={isLoading || !configured}>
          {isLoading ? <LoaderCircle className="spin" size={18} /> : <Wallet size={18} />}
          {isLoading ? "جار تجهيز الفاتورة..." : `الدفع بـ ${currency} (${networkLabel})`}
        </button>
        <span className="crypto-note">
          {offer ? `${offer.priceLabel} عبر ${currency} على شبكة ${networkLabel}` : null}
        </span>
      </div>

      {!configured && <p className="plan-error">بوابة Cryptomus غير مهيأة على هذا الخادم، لذا الدفع معطّل حالياً.</p>}
      {error && <p className="plan-error">{error}</p>}
    </div>
  );
}
