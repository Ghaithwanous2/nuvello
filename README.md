# Nuvello

تطبيق عربي لضغط صور JPG وPNG وWebP داخل المتصفح. الصور لا تُرفع إلى خادم.

## قاعدة البيانات

في الإنتاج استخدم PostgreSQL كامل عبر متغير البيئة:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
AUTH_SECRET=ضع_قيمة_طويلة_عشوائية
```

الكود ينشئ الجداول تلقائياً عند أول استخدام. يوجد أيضاً ملف `database.sql` إذا أردت إنشاء الجداول يدوياً من لوحة قاعدة البيانات.

مهم: بدون `DATABASE_URL` يعمل المشروع محلياً فقط عبر `data/db.json`. هذا الملف لا يصلح على Vercel لأن تخزين الملفات هناك ليس دائماً.

## التشغيل محلياً

```powershell
npm run dev -- -p 3000
```

ثم افتح `http://localhost:3000`.

## الخطط والحدود

كل الحدود معرّفة في مكان واحد: `lib/plans.js`.

| الخطة | الحد اليومي | كيف تعمل |
| --- | --- | --- |
| زائر (بدون تسجيل) | 5 صور | يُحدد الزائر بملف تعريف ارتباط موقّع، ويُعاد ضبط العدّاد يومياً |
| Free | 25 صورة | لكل حساب مسجَّل، منفصل عن حصة الزائر |
| Pro | بلا حدود | يُفعَّل عبر Stripe أو من لوحة الأدمن |

كيف تُحتسب الحصة:

- تُحجز الحصة **قبل** الضغط، لذا لا يمكن تجاوز الحد حتى عند فتح عدة تبويبات.
- إذا كان المتاح أقل من حجم الدفعة، تُعالج الصور التي تتسع لها الحصة فقط وتظهر الباقية بحالة «خارج الحصة».
- الصور التي تعذّرت قراءتها تُعاد حصتها تلقائياً (`/api/usage/release`) فلا تستهلك الحد.
- تنتهي الحصة كل يوم بتوقيت UTC.

## الدفع (Stripe)

الترقية تتحوّل إلى Stripe Checkout (وضع الاشتراكات)، والحالة تُدار عبر الويبهوك:

- `POST /api/billing/checkout` — ينشئ جلسة دفع ويُعيد رابط التحويل.
- `POST /api/billing/portal` — بوابة إدارة/إلغاء الاشتراك لعملاء Stripe.
- `POST /api/billing/webhook` — يستقبل `checkout.session.completed` و`customer.subscription.*` ويحدّث الخطة.

أحداث الويبهوك التي تُعالج: `checkout.session.completed`، `customer.subscription.created`، `customer.subscription.updated`، `customer.subscription.deleted`.
حالة `active` أو `trialing` تعني Pro، وأي حالة أخرى تُعيد الحساب إلى Free.

بدون مفاتيح Stripe تظل الواجهة تعمل: زر الترقية يخبر المستخدم أن الدفع غير مهيأ، وللتحكم محلياً يوجد زر تفعيل/إلغاء تجريبي يعمل خارج الإنتاج فقط.

## الدفع بالكريبتو (Cryptomus)

بوابة ثانية للدفع لا تحتاج بطاقة بنكية، والافتراضي هو USDT على شبكة BEP20.

كيف تعمل:

1. العميل يختار العرض في صفحة «حسابي» ثم `POST /api/billing/crypto/invoice` ينشئ فاتورة في Cryptomus ويُسجّل الطلب في قاعدة البيانات.
2. نحن نحوّل العميل إلى صفحة دفع Cryptomus. الرابط الأولي والعنوان يعودان من مزوّد الدفع، ولا نُنشئ عناوين محافظ بأنفسنا.
3. عند تغيّر حالة الفاتورة ترسل Cryptomus ويبهوك مُوقّعاً إلى `POST /api/billing/crypto/webhook`، وبعد التحقق من التوقيع تُفعّل Pro.
4. إن تأخر الويبهوك (أو كان الموقع محلياً فلا تصل Cryptomus إليه)، تعيد صفحة الحساب المزامنة عبر `GET /api/billing/crypto/order?order=<orderId>` فتقرأ حالة الفاتورة من Cryptomus مباشرة.

ملاحظات مهمة:

- التفعيل **مرة واحدة لكل طلب**: تكرار الويبهوك لا يمدّد المدة مرتين (idempotent).
- الحالات الناجحة هي `paid` و`paid_over` فقط، وما دونهما لا يفعّل شيئاً.
- التوقيع: `md5(base64(json_body) + API_KEY)`، ويُرفض أي ويبهوك بتوقيع غير صحيح (400).
- المدفوعات مسجّلة في جدول `payments` عند استخدام PostgreSQL، وتظهر آخر العمليات في لوحة الأدمن وفي صفحة الحساب.
- خطة Pro المدفوعة بالكريبتو **مدفوعة مقدماً**: تنتهي تلقائياً في `planRenewsAt`، وبعد الانتهاء يعود الحساب للخطة المجانية بدون أي إجراء.
- عرض «مدى الحياة» يُفعّل بضبط `CRYPTO_LIFETIME_PRICE_USD`، ويمكن تشغيل العروض معاً.

قبل النشر: اضبط `CRYPTOMUS_MERCHANT_ID` و`CRYPTOMUS_API_KEY`، وتأكد أن `NEXT_PUBLIC_SITE_URL` رابط عام (HTTPS) لأن Cryptomus تحتاج الوصول إلى مسار الويبهوك.

## متغيرات البيئة

انسخ `.env.example` إلى `.env.local` واضبط القيم:

- `AUTH_SECRET` — سر توقيع الجلسات وملف الزائر (إلزامي في الإنتاج).
- `DATABASE_URL` — رابط PostgreSQL للحسابات والجلسات والخطط والاستخدام والمدفوعات.
- `NEXT_PUBLIC_SITE_URL` — رابط الموقع، يُستخدم في روابط Stripe وخريطة الموقع.
- `STRIPE_SECRET_KEY` و`STRIPE_PRICE_ID` و`STRIPE_WEBHOOK_SECRET` — لتشغيل اشتراكات البطاقات.
- `CRYPTOMUS_MERCHANT_ID` و`CRYPTOMUS_API_KEY` — لتشغيل الدفع بالكريبتو.
- `CRYPTO_CURRENCY` و`CRYPTO_NETWORK` و`CRYPTO_NETWORK_LABEL` — العملة والشبكة (الافتراضي USDT على `bsc` = BEP20).
- `CRYPTO_PERIOD_DAYS` و`CRYPTO_PERIOD_PRICE_USD` و`CRYPTO_LIFETIME_PRICE_USD` — العروض والأسعار؛ اضبط `CRYPTO_PERIOD_DAYS=0` لإلغاء عرض المدة.

## قبل النشر

- اضبط `AUTH_SECRET` بقيمة عشوائية طويلة.
- أضف `DATABASE_URL` في Vercel Environment Variables.
- راجع البريد في `app/contact/page.jsx`.
- أضف كود الإعلانات بعد قبول حسابك في AdSense، مع الحفاظ على المساحات المخصصة في الواجهة.
- اربط Stripe: أضف المنتج والسعر، ثم أضف بوابة الويبهوك على `https://<domain>/api/billing/webhook`.
- انشر المشروع على Vercel أو أي استضافة تدعم Next.js.
