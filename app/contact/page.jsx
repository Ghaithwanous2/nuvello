import { Mail } from "lucide-react";

export const metadata = {
  title: "تواصل معنا",
  description: "تواصل مع فريق Nuvello للاقتراحات أو الإبلاغ عن مشكلة.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return <main className="legal-page contact-page"><p className="section-label">Nuvello</p><h1>تواصل معنا</h1><p className="legal-lead">للاقتراحات أو الإبلاغ عن مشكلة، راسلنا مباشرة.</p><a className="contact-link" href="mailto:gaiethwanous@gmail.com"><Mail size={19} />gaiethwanous@gmail.com</a></main>;
}
