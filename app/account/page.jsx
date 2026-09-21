import { redirect } from "next/navigation";
import { CalendarClock, Crown, Gauge, Mail, UserRound } from "lucide-react";
import { getCurrentUser, getUserPayments, getUserSubscription, getUserUsage } from "@/lib/auth";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/payment-status";
import { CRYPTO_CURRENCY, CRYPTO_NETWORK_LABEL, cryptoOffers, isCryptoCheckoutEnabled, planIdForUser, quotaSnapshot } from "@/lib/plans";
import { isCryptomusConfigured } from "@/lib/cryptomus";
import CryptoPaymentPanel from "../components/CryptoPaymentPanel";
import LogoutButton from "../components/LogoutButton";
import ManageSubscriptionButton from "../components/ManageSubscriptionButton";

export const metadata = {
  title: "حسابي",
  description: "إدارة حسابك وخطتك في Nuvello.",
  alternates: { canonical: "/account" },
};

function formatDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ar-u-nu-latn", { dateStyle: "long" }).format(new Date(value));
}

const STATUS_LABELS = {
  active: "نشط",
  trialing: "تجريبي",
  past_due: "دفعة متأخرة",
  canceled: "ملغى",
  unpaid: "غير مدفوع",
  paid: "مدفوع",
};

export default async function AccountPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const subscription = getUserSubscription(user.id);
  const activePlan = planIdForUser(user);
  const isPro = activePlan === "pro";
  const quota = quotaSnapshot(activePlan, getUserUsage(user.id));
  const renewal = formatDate(user.planRenewsAt);
  const prepaidExpired = !isPro && user.plan === "pro" && user.planSource === "crypto" && !user.planLifetime;
  const payments = getUserPayments(user.id, 5);

  return (
    <main className="account-page">
      <section className="account-hero">
        <p className="section-label">حسابك</p>
        <h1>أهلاً {user.name}</h1>
        <p className="legal-lead">تابع حدود الاستخدام، وخطة الحساب، وحالة الاشتراك.</p>
      </section>

      {params?.crypto === "paid" && <p className="account-flash good">تم تأكيد الدفع وتفعيل Pro على حسابك.</p>}
      {params?.checkout === "success" && (
        <p className="account-flash good">تم استلام الدفع. تُفعَّل Pro لحظة تأكيد Stripe — حدّث الصفحة إن لم تظهر مباشرة.</p>
      )}
      {params?.checkout === "cancelled" && <p className="account-flash">ألغيت عملية الدفع ولم يتم أي خصم.</p>}
      {prepaidExpired && (
        <p className="account-flash">انتهت مدة Pro المدفوعة بالكريبتو{renewal ? ` في ${renewal}` : ""}. يمكنك التجديد من قسم الدفع بالكريبتو أدناه.</p>
      )}

      <section className="account-grid">
        <article className="account-panel">
          <UserRound size={22} />
          <span>الاسم</span>
          <strong>{user.name}</strong>
        </article>
        <article className="account-panel">
          <Mail size={22} />
          <span>البريد</span>
          <strong>{user.email}</strong>
        </article>
        <article className="account-panel">
          <Crown size={22} />
          <span>الخطة</span>
          <strong>{quota.planLabel}</strong>
          {user.planLifetime && isPro && <small>مدى الحياة</small>}
        </article>
        <article className="account-panel">
          <Gauge size={22} />
          <span>استخدام اليوم</span>
          <strong>{quota.unlimited ? `${quota.usage} صورة` : `${quota.usage} / ${quota.dailyLimit}`}</strong>
          {!quota.unlimited && <small>متبقٍ {quota.remaining} صورة اليوم</small>}
        </article>
      </section>

      {isPro ? (
        <section className="plan-section">
          <article className="pro-panel">
            <span className="section-label">Pro</span>
            <strong className="plan-active">Pro مفعلة</strong>
            <p className="plan-meta">
              {user.planLifetime
                ? <>الصلاحية: <b>مدى الحياة</b></>
                : <>الحالة: <b>{STATUS_LABELS[user.subscriptionStatus] || user.subscriptionStatus || "نشط"}</b>{renewal ? <> · {user.planSource === "crypto" ? "تنتهي في" : "يتجدد في"} <b>{renewal}</b></> : null}</>}
            </p>
            <ManageSubscriptionButton hasBilling={user.hasBilling} />
          </article>
        </section>
      ) : null}

      {isCryptoCheckoutEnabled() && (
        <section className="crypto-section">
          <div className="crypto-head">
            <span className="section-label">الدفع بالكريبتو</span>
            <h2>ادفع بـ {CRYPTO_CURRENCY} على شبكة {CRYPTO_NETWORK_LABEL}</h2>
            <p>دفعة واحدة عبر بوابة Cryptomus، بدون الحاجة إلى بطاقة بنكية. تُفعَّل Pro تلقائياً بعد تأكيد المعاملة على الشبكة.</p>
          </div>
          <CryptoPaymentPanel
            offers={cryptoOffers()}
            currency={CRYPTO_CURRENCY}
            networkLabel={CRYPTO_NETWORK_LABEL}
            initialOrderId={params?.order || null}
            configured={isCryptomusConfigured()}
          />
          {!!payments.length && (
            <ul className="payment-history">
              {payments.map((payment) => (
                <li key={payment.id}>
                  <span className={`payment-badge ${paymentStatusTone(payment.status)}`}>{paymentStatusLabel(payment.status)}</span>
                  <span>{payment.amountUsd ? `${payment.amountUsd}$` : "—"}</span>
                  <span>{payment.kind === "lifetime" ? "مدى الحياة" : `${payment.days} يوماً`}</span>
                  <span className="payment-date">{formatDate(payment.createdAt)}</span>
                  {payment.txid && <span className="payment-tx">tx: {payment.txid.slice(0, 10)}…</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="account-actions">
        <LogoutButton />
      </div>
    </main>
  );
}
