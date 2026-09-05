#!/usr/bin/env node
/**
 * 🤖 وصية — الناشر الأوتوماتيكي للسوشيال ميديا
 * ============================================
 * - يعمل تلقائيًا من GitHub Actions 3 مرات يوميًا (صباح / ظهر / مساء)
 * - يولّد البوست + بطاقة صورة بنفس هوية الموقع تلقائيًا
 * - ينشر على: تليجرام / X (تويتر) / فيسبوك / انستجرام
 * - أي منصة مش متظبطة (متغيراتها ناقصة) بتتخطى بصمت — مش بتعطل الباقي
 * - وضع التجربة: node run.mjs --dry (يولّد ويعرض من غير أي نشر)
 *
 * لإضافة/تعديل البوستات: عدّل مصفوفة TEMPLATES تحت
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { TwitterApi } from "twitter-api-v2";

const DRY = process.argv.includes("--dry");
const APP_URL = (process.env.APP_URL || "https://wasiya-taupe.vercel.app").replace(/\/+$/, "");
const GRAPH_VERSION = "v23.0"; // لو رسالة خطأ تقول النسخة قديمة: زوّد الرقم
const ROOT = path.dirname(new URL(import.meta.url).pathname);

// ============================================================
// 1) مكتبة البوستات — [سطر البطاقة (قصير بدون إيموجي), نص البوست]
//    46 بوست: التنويع التلقائي بيمنع التكرار 46 يوم متتالية
// ============================================================
const TEMPLATES = [
  ["لو رحلت فجأة… مين يوصل كلمات سرّك؟",
   "بريدك، حساباتك، محفظتك الرقمية — كلها ورا كلمات سر في دماغك لوحدك. «وصية» بتخلي كلمتك الأخيرة توصل للي يستاهل: مفتاح حياة دوري، شهود موثوقين، وتشفير كامل."],
  ["إرثك الرقمي أغلى مما تتخيل",
   "صور عيلتك، أعمالك، حساباتك، محافظك — لو ضاعت كلمات السر ضاع كله معاها. الوصية الرقمية مبقتش رفاهية؛ دي أمانة وواجب. ابدأ وصيتك النهارده قبل ما تبقى ضرورة."],
  ["كلمات السر مش بتتورث",
   "للأسف مفيش حد هيخمّن باسوورد بريدك ولا محفظتك. الحل الوحيد: خزنة موثوقة بتتفتح لأهلها بس، بعد ما يطمنوا عليك فعلًا. «وصية» بتعمل كده بالظبط."],
  ["أسرارك في دماغك بس؟ دي مش أمانة… دي مخاطرة",
   "كلنا شايلين أسرار رقمية لو حصللنا حاجة هتضيع أو تتحبس. خزنة «وصية» المشفرة بتحل الموضوع: مفتاح حياة + شهود + تسليم في معاده."],
  ["70% من حياتنا بقيت رقمية… والوصية لسه ورقة في درج؟",
   "زمان الوصية كانت ورقة بتتكتب وبتتحط في الدرج. دلوقتي حياتنا كلها أونلاين: حسابات ومحافظ وذكريات. «وصية» بنقل فكرة الوصية للعصر الرقمي — مشفرة ومؤمنة."],
  ["لو حسابك اتحبس بكره… إيه اللي هيضيع معاه؟",
   "شركات كتير بتقفل الحساب بعد الوفاة وتمسح البيانات. إلا لو حد واقف على كلمة السر — أو واصلته وصية رقمية منظمة. اختار اللي يريح اللي وراك."],
  ["أسرارك الرقمية محتاجة أمين",
   "الأمانة مش بس فلوس وعقار؛ الأمانة كمان معلومات وكلمات سر وذكريات. خليها في خزنة بتتسلم لأصحابها في وقتها."],
  ["مين له حق يعرف أسرارك لو مش موجود؟",
   "انت اللي بتحدد، مش الحظ ولا الصدفة. بـ«وصية» بتحدد لكل حد كوده السري — ولا حد يشوف حاجة مش له."],
  ["مفتاح الحياة: بيسألوا عليك… بس",
   "كل فترة النظام بيقولك «أنت بخير؟» — لو سكتت مدة طويلة بيبدأ إنذار بيوصل لشهودك يطمنوا عليك. كده مفيش وصية بتتسلم بالغلط أبدًا."],
  ["شاهديك هم اللي بيأكدوا",
   "مش هتتسلم وصيتك لمجرد صمت — الشهود اللي انت اخترتهم لهم كود سري بيبلغوا بيه، وبعدها مهلة كاملة يلغوا فيها لو الخبر غلط."],
  ["تشفير من الطراز العسكري",
   "رسايلك بتتخزن مشفرة AES-256-GCM — حتى إدارة الموقع نفسها مش تقدر تقراها. مفتاح فك التشفير عندك إنت."],
  ["الوصية بتتسلم بس بعد تلات طبقات تأكيد",
   "سكوت طويل + بلاغ شهود + مهلة كاملة بتمشي. تلات طبقات عشان يرتاح بالك: لا سر يبان بدري، ولا وصية تضيع."],
  ["خزنة بتفتح لأهلها… وبس",
   "كل مستلم بياخد كوده السري الخاص. الوصية بتوصله هو — ومحدش غيره يفتح حاجة."],
  ["10 دقايق تنظيم… وارتياح لسنين",
   "سجل، اكتب رسايلك، ضيف مستلمين وشهود — خلصت في ربع ساعة. والباقي على الموقع: بيفحص وينبه ويسلم في معاده."],
  ["الهدية الأخيرة… كلمة توصل",
   "في كلام بنسيبه في حلوقنا: شكر، اعتذار، حب. «وصية» بتخليه يوصل في وقته بدل ما يضيع معانا."],
  ["خلي كلمتك الأخيرة جميلة",
   "آخر كلمة في حياتك ممكن تكون أهمهم. اكتبها بإيدك دلوقتي — وسلمها للي يستاهل في وقتها."],
  ["في ناس بتحبك… خليها تلاقيك في كلماتك",
   "بعد الرحيل، الرسايل بتتبقى كنوز. رسالة مسجلة النهارده ممكن تبقى أغلى حاجة تسيبها وراك."],
  ["ورقة في درج… ولا أمانة رقمية موثوقة؟",
   "الورقة بتتاكل وبتتلم، والمعلومات بتضيع. النسخة الرقمية المشفرة بتعيش وبتوصل لصاحبها — مع شهود ومعاده."],
  ["الوصية مش عن الرحيل… دي رحمة بمن وراك",
   "انت مش بتقول وداعا؛ انت بتوفر على اللي وراك حيرة وأسئلة ومشاكل. دي أرحم طريقة للتوديع."],
  ["ذكرياتك تستاهل حارس",
   "أول صورة لأولادك، رسايل مهمة، ملفات شغل — كلها في هواتف وحسابات محتاجة حد يوصلها للي يستاهلها."],
  ["الأمانة تُؤدّى لأهلها",
   "ديننا بيأمرنا بأداء الودائع لأصحابها. كلمات السر والمعلومات دي ودائع — خلّيها تتأدى لصحابها بوصية رقمية."],
  ["الكلمة الطيبة صداقة… خليها توصل",
   "خلي كلمتك الطيبة تشتغل حتى وأنت مش موجود — رسالة لجد، لأولادك، لحد حبيته ومش عرفته."],
  ["الاستعداد مش تشاؤم… ده رحمة",
   "بنأمّن على البيت والعربية والصحة، وننسى أهم حاجة: مين يمسك الحبل الرقمي لو احنا مش موجودين."],
  ["سايب حسرة… ولا سايب أمانة؟",
   "اللي يسيب أسراره مبعثرة يسيب حسرة لورثته. اللي يرتبها يسيب ارتياح. اختار اللي تحب تسيبه."],
  ["أصول رقمية بتضيع بالمليارات كل سنة",
   "محافظ بتتنسى، حسابات بتتحبس، ذكريات بتتمسح — العالم بيتكلم عن الإرث الرقمي من سنين. والاستعداد رخيص: 10 دقايق."],
  ["سياسات الشركات: حسابك يتعطب بعد رحيلك",
   "كتير من الخدمات بتقفل الحساب وتمسح بياناته بعد الوفاة. البديل: حد يعرف يدخل — أو وصية رقمية واصلة له."],
  ["كام حساب لي إيدك على النت؟ بصراحة؟",
   "بريد وبانك ومحفظة وسوشيال ومتاجر… كلهم ورا كلمات سر. متأكد إن حد يعرفها لو حصل خير؟ رتبها مرة وارتيح."],
  ["موبايلك بقى خزنة… والخزنة محتاجة مفتاح",
   "كل حياتك في جهاز واحد. لو ضاع أو اتقفل، إيه اللي هيحصل للي جواه؟ فكر في المفتاح قبل القفل."],
  ["جرّب «وصية» مجانًا — من غير كارت بنكي",
   "تجربة كاملة ببلاش، والدفع في مصر كاش بفودافون كاش. سجل، اكتب أول رسالة، وشوف النظام بإيدك."],
  ["مصري ومش معاك كارت بنكي؟ اتحلّت",
   "تفعيل اشتراكك بفودافون كاش في دقايق — من غير تحويلات خارجية ولا تعقيد."],
  ["اربط حياتك الرقمية… وارتيح",
   "خزنة واحدة لكل أسرارك: رسايل، ملفات، كلمات سر. مقفولة بتشفير قوي، وتتفتح في معاها."],
  ["اعرف فكرة «وصية» في دقيقتين",
   "خزنة أسرار مشفرة + مفتاح حياة دوري + شهود موثوقين = وصيتك بتتسلم صح في وقتها. كل ده من غير تنزيل أي تطبيق."],
  ["التجربة المجانية: كاملة مش شكلية",
   "سجّل حساب تجريبي، اكتب وصية تجريبية، وشوف بنفسك سيناريو الإنذار والتسليم كله بإيدك — قبل أي دفع."],
  ["الميراث مش بس فلوس",
   "في ميراث تاني مبيتوصى بيه: الذكريات، الحسابات، الحقوق الرقمية. اوصي بيه قبل ما يتوه."],
  ["التخطيط للطوارئ حكمة",
   "الطيارة فيها شنطة نجاة والبيت فيه طفاية حريق — وحياتك الرقمية محتاجة خطتها هي كمان. بسيطة وسريعة."],
  ["قرينك يعرف كلمات سر البنك؟ بجد؟",
   "سؤال محرج بس لازم. لو الإجابة «لأ» يبقى في فجوة خطيرة. «وصية» بتسدها بخصوصية كاملة: حد يشوف اللي له بس."],
  ["أمين على أسرار غيرك كمان؟",
   "صاحبك ائتمنك على حاجة؟ عندك معلومات مش بتخصك؟ خليها في مكان آمن يتسلم لصاحبها لو حصل خير."],
  ["تلات طبقات قبل التسليم… بالتفصيل",
   "1) السكوت الطويل يشغل الإنذار 2) الشهود بيبلغوا بكودهم 3) مهلة كاملة تلغي فيها لو انت بخير. بعدها بس: التسليم."],
  ["خصوصية للطرفين",
   "صاحب الوصية مرتاح إن أسراره في أمان، والمستلم شايف اللي له بس بكوده. محدش بيفتح حاجة مش له."],
  ["مفيش إعلانات ولا بيع بيانات",
   "«وصية» بتتكفل بالأمانة وحدك: لا تتبع، لا بيع بيانات، لا إعلانات. رسالتك بتتقرا لصاحبها هي بس."],
  ["من المتصفح مباشرة — من غير تطبيقات",
   "مفيش حاجة تتسطّب. افتح الموقع من أي جهاز، سجل، وابدأ. بياناتك مشفرة على سيرفرات آمنة."],
  ["جرّب سيناريو التسليم بإيدك",
   "حساب تجريبي + شاهد تجريبي + وصية تجريبية: شوف الإنذار بيشتغل إزاي، والتسليم بيحصل إمتى — قبل ما تثق بينا."],
  ["النظام بينبّه قبل ما يسلّم — دايمًا",
   "لأي سبب إنذار: إيميل فوري لصاحب الخزنة يلغي بضغطة واحدة. مفيش مفاجآت في وصية."],
  ["وصية… من الآخر: راحة بال",
   "لما تكتبها وتقفلها، بتنسى الموضوع. الموقع بيفضل يشيل عنك: يفحص، ينبه، ويسلم في معاده."],
  ["ابدأ برسالة واحدة بس",
   "مش لازم ترتب حياتك كلها النهارده. رسالة واحدة لحد قلبك دافي عليه — والباقي يجي ورا بعضه."],
  ["هترسيب حاجة وراك أكيد… إزاي هتسيبها؟",
   "دي مش «لو» — دي حقيقة. الفرق الوحيد: هتتركها منظمة وموصي بها، ولا مبعثرة لحظة صدفة؟"],
];

const TAGS = [
  "#وصية", "#وصية_رقمية", "#إرث_رقمي", "#الأمان_الرقمي", "#ميراث",
  "#خزنة_أسرار", "#مصر", "#تخطيط", "#ذكريات", "#حياتنا_الرقمية", "#أمانة", "#تقنية",
];

// ============================================================
// 2) اختيار بوست اليوم — تنويع رياضي بلا تكرار
// ============================================================
function pickPost() {
  const now = new Date();
  const hour = now.getUTCHours();
  const slot = hour < 8 ? 0 : hour < 14 ? 1 : 2; // الفترة: صبح / ظهر / مغرب
  const dayIndex = Math.floor(now.getTime() / 86400000);
  const i = (dayIndex * 3 + slot) % TEMPLATES.length;
  return {
    i,
    slot,
    hook: TEMPLATES[i][0],
    body: TEMPLATES[i][1],
    tags: [TAGS[i % TAGS.length], TAGS[(i + 5) % TAGS.length], TAGS[(i + 9) % TAGS.length]],
    dayIndex,
  };
}

// ============================================================
// 3) توليد نصوص كل منصة
// ============================================================
function buildTexts(p) {
  const tags = p.tags.join(" ");
  return {
    full: `${p.hook}\n\n${p.body}\n\n🔗 ${APP_URL}\n\n${tags}`,      // تليجرام + فيسبوك
    x: `${p.hook}\n${APP_URL}\n\n${p.tags[0]} ${p.tags[1]}`,        // X — قصير
    ig: `${p.hook}\n\n${p.body}\n\n${tags}`,                        // انستجرام — بدون لينك (اللينك في البايو)
  };
}

// ============================================================
// 4) بطاقة الصورة — SVG بنفس هوية الموقع ثم PNG
// ============================================================
function scrub(s) {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapWords(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxChars) cur = (cur + " " + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

const FONT = "Noto Sans Arabic, Noto Naskh Arabic, KacstOne, FreeSerif, DejaVu Sans";

function buildCardSvg(text, variant) {
  const palettes = [
    { glow: "#7c2d12", accent: "#c2703d", text: "#f5f0e6" }, // صدأ الموقع
    { glow: "#92400e", accent: "#e0a458", text: "#fdf3e3" }, // ذهبي دافي
  ];
  const P = palettes[variant % palettes.length];
  const lines = wrapWords(text, 20);
  const fs = lines.length <= 1 ? 92 : lines.length === 2 ? 80 : 66;
  const lh = Math.round(fs * 1.55);
  const startY = Math.round(560 - (lines.length * lh) / 2 + lh / 2);
  const tspans = lines
    .map((l, idx) => `<tspan x="540" y="${startY + idx * lh}">${escXml(l)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="${P.glow}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${P.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${P.glow}"/>
      <stop offset="100%" stop-color="${P.accent}"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="#0a0a0c"/>
  <rect width="1080" height="1080" fill="url(#g)"/>
  <rect x="44" y="44" width="992" height="992" rx="30" fill="none" stroke="#292524" stroke-width="3"/>
  <text x="540" y="185" text-anchor="middle" font-family="${FONT}" font-size="80" font-weight="700" fill="${P.accent}">وصية</text>
  <rect x="470" y="215" width="140" height="7" rx="4" fill="url(#bar)"/>
  <text x="540" y="330" text-anchor="middle" font-family="${FONT}" font-size="30" fill="#a8a29e">خزنة أسرارك بعد رحيلك</text>
  <text text-anchor="middle" font-family="${FONT}" font-size="${fs}" font-weight="700" fill="${P.text}">${tspans}</text>
  <text x="540" y="985" text-anchor="middle" font-family="DejaVu Sans" font-size="36" fill="#a8a29e">wasiya-taupe.vercel.app</text>
</svg>`;
}

async function renderCard(svg) {
  return await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

// ============================================================
// 5) رفع الصورة لمستضيف عام (مطلوب لانستجرام بس)
// ============================================================
async function uploadTelegraph(buf) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "image/png" }), "card.png");
  const res = await fetch("https://telegra.ph/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!Array.isArray(data) || !data[0] || !data[0].src) {
    throw new Error("telegraph: " + JSON.stringify(data).slice(0, 200));
  }
  return "https://telegra.ph" + data[0].src;
}

// ============================================================
// 6) الناشرون — كل منصة مستقلة تمامًا
// ============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tgOk = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL);
const xOk = () => !!(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET);
const fbOk = () => !!(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN);
const igOk = () => !!(process.env.IG_USER_ID && process.env.FB_PAGE_TOKEN);

async function postTelegram(text, buf) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHANNEL;
  const fd = new FormData();
  fd.append("chat_id", chat);
  if (buf) {
    fd.append("caption", text.slice(0, 1000));
    fd.append("photo", new Blob([buf], { type: "image/png" }), "card.png");
  } else {
    fd.append("text", text);
  }
  const url = buf
    ? `https://api.telegram.org/bot${token}/sendPhoto`
    : `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, { method: "POST", body: fd });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description || "فشل غير معروف");
}

async function postX(text, buf) {
  const client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET,
  });
  let mediaIds;
  if (buf) {
    try {
      const id = await client.v1.uploadMedia(buf, { type: "png" });
      mediaIds = [id];
    } catch (e) {
      console.log("⚠️ رفع صورة X فشل — هينزل نص فقط:", (e.message || "").slice(0, 150));
    }
  }
  await client.v2.tweet({
    text: text.slice(0, 270),
    ...(mediaIds ? { media: { media_ids: mediaIds } } : {}),
  });
}

async function postFacebook(text, buf) {
  const pid = process.env.FB_PAGE_ID;
  const tok = process.env.FB_PAGE_TOKEN;
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`;

  if (buf) {
    try {
      const fd = new FormData();
      fd.append("caption", text);
      fd.append("source", new Blob([buf], { type: "image/png" }), "card.png");
      const res = await fetch(`${base}/${pid}/photos?access_token=${encodeURIComponent(tok)}`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message);
      return;
    } catch (e) {
      console.log("⚠️ نشر صورة فيسبوك فشل — بنجرب منشور نصي:", (e.message || "").slice(0, 150));
    }
  }
  const res = await fetch(`${base}/${pid}/feed?access_token=${encodeURIComponent(tok)}`, {
    method: "POST",
    body: new URLSearchParams({ message: text }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
}

async function postInstagram(caption, imageUrl) {
  const ig = process.env.IG_USER_ID;
  const tok = process.env.FB_PAGE_TOKEN;
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`;

  // 1) إنشاء الحاوية
  const c = await fetch(`${base}/${ig}/media?access_token=${encodeURIComponent(tok)}`, {
    method: "POST",
    body: new URLSearchParams({ image_url: imageUrl, caption: caption.slice(0, 2100) }),
  });
  const cj = await c.json();
  if (!cj.id) throw new Error("IG container: " + JSON.stringify(cj).slice(0, 250));

  // 2) انتظار جهوزية الحاوية
  for (let t = 0; t < 5; t++) {
    await sleep(3000);
    const s = await (await fetch(`${base}/${cj.id}?fields=status_code&access_token=${encodeURIComponent(tok)}`)).json();
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "IN_ERROR") throw new Error("IG: الصورة مرفوضة");
  }

  // 3) النشر
  const p = await fetch(`${base}/${ig}/media_publish?access_token=${encodeURIComponent(tok)}`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: cj.id }),
  });
  const pj = await p.json();
  if (!pj.id) throw new Error("IG publish: " + JSON.stringify(pj).slice(0, 250));
}

// ============================================================
// 7) سجل النشر — post-log.md (بتشوفه على GitHub مباشرة)
// ============================================================
function appendLog(entry) {
  const jsonPath = path.join(ROOT, "post-log.json");
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(jsonPath, "utf8")); } catch { /* أول مرة */ }
  arr.push(entry);
  arr = arr.slice(-300);
  fs.writeFileSync(jsonPath, JSON.stringify(arr, null, 2));

  const rows = [...arr].reverse().map((e) =>
    `| ${e.t} | ${["الصبح", "الظهر", "المغرب"][e.slot] || e.slot} | ${e.i + 1} | ${(e.hook || "").slice(0, 32)} | ${e.telegram || "-"} | ${e.x || "-"} | ${e.facebook || "-"} | ${e.instagram || "-"} |`
  ).join("\n");
  fs.writeFileSync(
    path.join(ROOT, "post-log.md"),
    "# 📋 سجل النشر التلقائي (الأحدث أولاً)\n\n" +
      "| التوقيت UTC | الفترة | البوست | العنوان | تليجرام | X | فيسبوك | انستجرام |\n" +
      "|---|---|---|---|---|---|---|---|\n" + rows + "\n"
  );
}

// ============================================================
// 8) التشغيل الرئيسي
// ============================================================
async function tryRun(name, fn) {
  try { await fn(); console.log(`✅ ${name}: اتنشر`); return "✅"; }
  catch (e) { const m = (e.message || "خطأ").slice(0, 120); console.log(`❌ ${name}: ${m}`); return "❌ " + m; }
}

async function main() {
  const p = pickPost();
  const texts = buildTexts(p);
  const variant = p.dayIndex % 2;

  console.log("════════════════════════════════════");
  console.log(DRY ? "🧪 وضع التجربة — بدون أي نشر" : "🚀 نشر حقيقي");
  console.log(`الفترة: ${["الصبح", "الظهر", "المغرب"][p.slot]} | البوست رقم ${p.i + 1}/${TEMPLATES.length}`);
  console.log(`العنوان: ${p.hook}`);
  console.log("════════════════════════════════════");

  // توليد بطاقة الصورة
  let card = null;
  try {
    card = await renderCard(buildCardSvg(scrub(p.hook), variant));
    console.log(`✅ بطاقة الصورة جاهزة (${Math.round(card.length / 1024)}KB)`);
    if (DRY) {
      fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
      fs.writeFileSync(path.join(ROOT, "out", "card.png"), card);
      console.log("💾 البطاقة اتحفظت في out/card.png");
    }
  } catch (e) {
    console.log("⚠️ فشل توليد البطاقة — النشر هيبقى نص فقط:", (e.message || "").slice(0, 200));
  }

  // رفع الصورة لمستضيف عام (لأنستجرام)
  let publicUrl = null;
  if (!DRY && card) {
    try { publicUrl = await uploadTelegraph(card); console.log("✅ الصورة اترفعت للاستضافة العامة"); }
    catch (e) { console.log("⚠️ فشل رفع الصورة — انستجرام هي اتتخطى:", (e.message || "").slice(0, 150)); }
  }

  if (DRY) {
    console.log("\n──────── نص X ────────\n" + texts.x);
    console.log("\n──────── نص تليجرام/فيسبوك ────────\n" + texts.full);
    console.log("\n──────── نص انستجرام ────────\n" + texts.ig);
    console.log("\n🧪 كل حاجة جاهزة. للنشر الحقيقي شيل --dry");
    return;
  }

  const enabled = [tgOk(), xOk(), fbOk(), igOk()].filter(Boolean).length;
  console.log(`🔌 منصات مربوطة: ${enabled}`);
  if (enabled === 0) {
    console.log("⚠️ مفيش أي منصة مربوطة — حط المفاتيح في Secrets (شوف SETUP.md)");
    return;
  }

  const R = { t: new Date().toISOString().slice(0, 16), slot: p.slot, i: p.i, hook: p.hook };
  if (tgOk()) R.telegram = await tryRun("تليجرام", () => postTelegram(texts.full, card));
  if (xOk()) R.x = await tryRun("X", () => postX(texts.x, card));
  if (fbOk()) R.facebook = await tryRun("فيسبوك", () => postFacebook(texts.full, card));
  if (igOk()) {
    if (publicUrl) R.instagram = await tryRun("انستجرام", () => postInstagram(texts.ig, publicUrl));
    else R.instagram = "⏭️ اتتخطى (الصورة مش مرفوعة)";
  }

  appendLog(R);
  const values = Object.values(R).filter((v) => typeof v === "string" && v.startsWith("❌")).length;
  console.log("\n══════════ النتيجة ══════════");
  console.log(JSON.stringify(R, null, 2));
  if (values === enabled) {
    console.error("❌ كل المنصات فشلت — راجع SETUP.md قسم حل المشاكل");
    process.exit(1);
  }
}

// التشغيل المباشر فقط (مش عند الاستيراد من سكربت تاني)
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error("❌ فشل عام:", e); process.exit(1); });
}

export { TEMPLATES, TAGS, pickPost, buildTexts, buildCardSvg, renderCard, scrub, wrapWords };
