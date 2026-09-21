import ImageCompressor from "./components/ImageCompressor";

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Nuvello",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    inLanguage: "ar",
    description: "أداة لضغط الصور وتحسين حجم ملفات JPG وPNG وWebP من داخل المتصفح.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "ضغط صور JPG وPNG وWebP",
      "اختيار جودة الصورة",
      "تحويل الصور إلى WebP أو JPG أو PNG",
      "تصغير أبعاد الصور الكبيرة",
      "معالجة الصور داخل المتصفح",
    ],
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="intro-section">
        <div className="intro-copy">
          <p className="section-label">Nuvello Studio</p>
          <h1>اضبط صورك للنشر بسرعة وهدوء.</h1>
          <p className="intro-text">
            قلّل حجم الصور، اختر الصيغة المناسبة، وحمّل ملفات جاهزة للمواقع والمتاجر والمنشورات اليومية.
          </p>
        </div>
        <div className="privacy-note">
          <span className="status-dot" />
          يعمل مباشرة من جهازك.
        </div>
      </section>

      <ImageCompressor />

      <section className="support-section" aria-label="معلومات مساعدة">
        <article>
          <span className="section-label">ملاحظة عملية</span>
          <h2>ابدأ من WebP بجودة 76% لمعظم صور الويب.</h2>
          <p>هذا الإعداد يعطي عادة توازناً جيداً بين الوضوح والحجم، ويمكنك رفع الجودة للصور المهمة أو تقليلها للصور الثانوية.</p>
        </article>
        <article className="ad-placeholder" aria-label="مساحة إعلانية">
          <span>إعلان</span>
          <small>مساحة مخصصة للإعلانات</small>
        </article>
      </section>
    </main>
  );
}
