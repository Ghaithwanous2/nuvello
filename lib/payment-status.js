// Pure status labels shared by server pages and client components
// (no Node-only imports here so it can be bundled either way).

export const PAYMENT_STATUS_LABELS = {
  created: "بانتظار الدفع",
  check: "بانتظار التحويل",
  confirm_check: "بانتظار التأكيدات",
  process: "قيد المعالجة",
  paid: "مدفوع",
  paid_over: "مدفوع (أكثر من المطلوب)",
  wrong_amount: "مبلغ أقل من المطلوب",
  wrong_amount_waiting: "بانتظار تكملة المبلغ",
  fail: "فشل",
  cancel: "أُلغي",
  system_fail: "خطأ في النظام",
  refund_process: "الاسترجاع قيد التنفيذ",
  refund_fail: "فشل الاسترجاع",
  refund_paid: "تم الاسترجاع",
  locked: "مجمّد (مراجعة AML)",
};

export function paymentStatusLabel(status) {
  if (!status) return "غير معروف";
  return PAYMENT_STATUS_LABELS[status] || status;
}

export function paymentStatusTone(status) {
  if (status === "paid" || status === "paid_over") return "good";
  if (["fail", "cancel", "system_fail", "wrong_amount", "refund_paid"].includes(status)) return "bad";
  return "waiting";
}
