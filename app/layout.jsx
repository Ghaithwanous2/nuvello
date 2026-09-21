import "./globals.css";
import { Cairo } from "next/font/google";
import Link from "next/link";
import { Blend, ShieldCheck, UserRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

const cairo = Cairo({ subsets: ["arabic"], display: "swap" });
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nuvello.app";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Nuvello | ضغط الصور أونلاين للويب",
    template: "%s | Nuvello",
  },
  description: "اضغط صور JPG وPNG وWebP من المتصفح، قلّل حجم الملفات، وحضّر صورك للمواقع والمتاجر بدون رفعها إلى خادم.",
  keywords: ["ضغط الصور", "تصغير حجم الصور", "ضغط JPG", "ضغط PNG", "تحويل WebP", "Image Compressor", "Nuvello"],
  applicationName: "Nuvello",
  authors: [{ name: "Nuvello" }],
  creator: "Nuvello",
  publisher: "Nuvello",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ar",
    url: "/",
    siteName: "Nuvello",
    title: "Nuvello | ضغط الصور أونلاين للويب",
    description: "أداة عربية لضغط الصور وتحضيرها للنشر بسرعة من داخل المتصفح.",
  },
  twitter: {
    card: "summary",
    title: "Nuvello | ضغط الصور أونلاين للويب",
    description: "اضغط صور JPG وPNG وWebP من المتصفح وجهّزها للمواقع والمتاجر.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default async function RootLayout({ children }) {
  const user = await getCurrentUser();

  return (
    <html lang="ar" dir="rtl">
      <body className={cairo.className}>
        <header className="site-header">
          <div className="header-inner">
            <Link className="brand" href="/" aria-label="Nuvello، الصفحة الرئيسية">
              <span className="brand-sign"><Blend size={24} strokeWidth={2.1} /></span>
              <span>
                <strong>Nuvello</strong>
                <small>Image Studio</small>
              </span>
            </Link>
            <nav aria-label="التنقل الرئيسي">
              <Link href="/">الأداة</Link>
              <Link href="/privacy">الخصوصية</Link>
              <Link href="/terms">الشروط</Link>
              <Link href="/contact">تواصل</Link>
              {user?.role === "admin" && <Link href="/admin">الأدمن</Link>}
              <Link className="account-link" href={user ? "/account" : "/login"}><UserRound size={15} />{user ? "حسابي" : "دخول"}</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="footer-inner">
            <div className="footer-privacy"><ShieldCheck size={17} /> معالجة محلية داخل المتصفح.</div>
            <span>© {new Date().getFullYear()} Nuvello</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
