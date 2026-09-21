export const metadata = {
  title: "سياسة الخصوصية",
  description: "تعرف على طريقة تعامل Nuvello مع الصور وبيانات الاستخدام والإعلانات.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage title="الخصوصية" lead="خصوصيتك جزء أساسي من طريقة عمل Nuvello." sections={[
    ["معالجة محلية", "تُعالج الصور التي تختارها داخل متصفحك فقط. لا نرفعها إلى خوادمنا، ولا نحتفظ بنسخ منها."],
    ["بيانات الاستخدام", "قد نستخدم أدوات قياس عامة لفهم أداء الموقع وتحسينه. لا ترتبط هذه البيانات بمحتوى صورك."],
    ["عدّاد الحصة اليومية", "نحفظ عدّاداً رقمياً لعدد الصور المعالجة لكل حساب أو زائر، فقط لتطبيق حدود الخطط. لا نرى صورك ولا نعرف محتواها. نستخدم ملف تعريف ارتباط موقّعاً لتمييز الزائر وإعادة ضبط العدّاد يومياً."],
    ["الإعلانات", "قد تظهر إعلانات من شركاء معتمدين. تُدار ملفات تعريف الارتباط الخاصة بهم وفق سياساتهم وخيارات الموافقة المعروضة لك."],
  ]} />;
}

function LegalPage({ title, lead, sections }) {
  return <main className="legal-page"><p className="section-label">Nuvello</p><h1>{title}</h1><p className="legal-lead">{lead}</p>{sections.map(([heading, copy]) => <section key={heading}><h2>{heading}</h2><p>{copy}</p></section>)}</main>;
}
