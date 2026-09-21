import { redirect } from "next/navigation";
import { Activity, Bitcoin, Crown, ShieldCheck, Users } from "lucide-react";
import AdminActions from "../components/AdminActions";
import { getAdminOverview, getCurrentUser, getRecentPayments } from "@/lib/auth";
import { paymentStatusLabel, paymentStatusTone } from "@/lib/payment-status";

export const metadata = {
  title: "لوحة الأدمن",
  description: "إدارة المستخدمين والخطط والاستخدام في Nuvello.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "admin") redirect("/account");

  const { stats, users } = await getAdminOverview();
  const payments = await getRecentPayments(8);

  return (
    <main className="admin-page">
      <section className="account-hero">
        <p className="section-label">Nuvello Admin</p>
        <h1>لوحة التحكم</h1>
        <p className="legal-lead">إدارة المستخدمين، الخطط، الجلسات، وحدود الاستخدام اليومية.</p>
      </section>

      <section className="admin-stats">
        <article><Users size={22} /><span>المستخدمون</span><strong>{stats.users}</strong></article>
        <article><Crown size={22} /><span>Pro</span><strong>{stats.proUsers}</strong></article>
        <article><ShieldCheck size={22} /><span>الجلسات النشطة</span><strong>{stats.activeSessions}</strong></article>
        <article><Activity size={22} /><span>صور اليوم</span><strong>{stats.todayUsage}</strong></article>
      </section>

      <section className="admin-table-wrap">
        <div className="admin-table-head">
          <div>
            <span className="section-label">المستخدمون</span>
            <h2>إدارة الحسابات</h2>
          </div>
          <small>{stats.freeUsers} Free · {stats.proUsers} Pro</small>
        </div>

        <div className="admin-table">
          <div className="admin-row admin-row-head">
            <span>المستخدم</span>
            <span>الخطة</span>
            <span>الدور</span>
            <span>اليوم</span>
            <span>الجلسات</span>
            <span>إجراءات</span>
          </div>
          {users.map((user) => (
            <div className="admin-row" key={user.id}>
              <span><strong>{user.name}</strong><small>{user.email}</small></span>
              <span>
                {user.plan === "pro" ? "Pro" : "Free"}
                {user.planSource === "stripe" && <small>Stripe{user.subscriptionStatus ? ` · ${user.subscriptionStatus}` : ""}</small>}
                {(!user.planSource || user.planSource === "manual" || user.planSource === "dev") && <small>يدوي</small>}
              </span>
              <span>{user.role === "admin" ? "Admin" : "User"}</span>
              <span>{user.usageToday}</span>
              <span>{user.activeSessions}</span>
              <AdminActions user={user} />
            </div>
          ))}
        </div>
      </section>

      <section className="admin-table-wrap">
        <div className="admin-table-head">
          <div>
            <span className="section-label">المدفوعات</span>
            <h2>مدفوعات الكريبتو</h2>
          </div>
          <small><Bitcoin size={14} /> {payments.length} أحدث عملية</small>
        </div>

        {payments.length === 0 ? (
          <p className="admin-empty">لا توجد مدفوعات مسجلة بعد.</p>
        ) : (
          <div className="admin-table">
            <div className="admin-row payments-row admin-row-head">
              <span>المستخدم</span>
              <span>المبلغ</span>
              <span>النوع</span>
              <span>الحالة</span>
              <span>التاريخ</span>
              <span>المعاملة</span>
            </div>
            {payments.map((payment) => (
              <div className="admin-row payments-row" key={payment.id}>
                <span><strong>{payment.userName || "—"}</strong><small>{payment.userEmail || payment.userId}</small></span>
                <span>{payment.amountUsd ? `${payment.amountUsd}$` : "—"}</span>
                <span>{payment.kind === "lifetime" ? "مدى الحياة" : `${payment.days} يوماً`}</span>
                <span><span className={`payment-badge ${paymentStatusTone(payment.status)}`}>{paymentStatusLabel(payment.status)}</span></span>
                <span>{new Date(payment.createdAt).toISOString().slice(0, 10)}</span>
                <span className="payment-tx">{payment.txid ? `${payment.txid.slice(0, 12)}…` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
