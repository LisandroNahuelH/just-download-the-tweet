import { formatExtensionTitle } from "./capitalize-word-initials.mjs";

export const CANONICAL_EXTENSION_NAME =
  "Just Download The Tweet Premium11: Save Video, GIF & Images from X";

export const CANONICAL_EXTENSION_DESCRIPTION =
  "Adds download controls to media posts on X.";

/** Localized Chrome Web Store titles (max 75 characters). */
export const LOCALIZED_EXTENSION_NAMES = {
  am: "ትዊትቱን ቀጥታ ያውርዱ Premium11: ቪዲዮ፣ GIF እና ምስሎች ከ X",
  ar: "حمّل التغريدة مباشرة Premium11: احفظ فيديو وGIF وصور من X",
  bg: "Свали Туита Директно Premium11: Запази Видео, GIF И Изображения От X",
  bn: "সরাসরি টুইট ডাউনলোড করুন Premium11: X থেকে ভিডিও, GIF, ছবি",
  ca: "Baixa El Tuit Directament Premium11: Desa Vídeo, GIF I Imatges D'X",
  cs: "Stáhněte Tweet Přímo Premium11: Uložte Video, GIF A Obrázky Z X",
  da: "Download Tweetet Direkte Premium11: Gem Video, GIF Og Billeder Fra X",
  de: "Tweet Einfach Herunterladen Premium11: Video, GIF & Bilder Von X Speichern",
  el: "Κατεβάστε Το Tweet Απευθείας Premium11: Αποθήκευση Video, GIF, Εικόνων",
  es: "Solo Descarga El Tuit Premium11: Guarda Video, GIF E Imágenes De X",
  et: "Laadi Säuts Alla Otse Premium11: Salvesta Video, GIF Ja Pildid X-St",
  fa: "توییت را مستقیم دانلود کنید Premium11: ذخیره ویدیو، GIF و تصویر از X",
  fi: "Lataa Twiitti Suoraan Premium11: Tallenna Video, GIF Ja Kuvat X:Stä",
  fil: "I-Download Ang Tweet Nang Direkta Premium11: Save Video, GIF At Larawan",
  fr: "Téléchargez Simplement Le Post Premium11: Vidéo, GIF Et Images Sur X",
  gu: "ટ્વીટ સીધું ડાઉનલોડ કરો Premium11: X થી વીડિયો, GIF, છબીઓ સાચવો",
  he: "הורידו את הציוץ ישירות Premium11: שמירת וידאו, GIF ותמונות מ-X",
  hi: "ट्वीट सीधे डाउनलोड करें Premium11: X से वीडियो, GIF और इमेज सेव करें",
  hr: "Preuzmite Tweet Izravno Premium11: Spremi Video, GIF I Slike S X-A",
  hu: "Töltse Le A Tweetet Közvetlenül Premium11: Mentés Video, GIF, Képek",
  id: "Unduh Tweet Secara Langsung Premium11: Simpan Video, GIF & Gambar Dari X",
  it: "Scarica Il Post Direttamente Premium11: Salva Video, GIF E Immagini Da X",
  ja: "ツイートをそのままダウンロード Premium11: Xの動画・GIF・画像を保存",
  kn: "ಟ್ವೀಟ್ ಅನ್ನು ನೇರವಾಗಿ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ Premium11: X ನಿಂದ ವೀಡಿಯೊ, GIF",
  ko: "트윗을 바로 다운로드 Premium11: X에서 동영상·GIF·이미지 저장",
  lt: "Atsisiųskite Įrašą Tiesiogiai Premium11: Išsaugokite Video, GIF, Nuotraukas",
  lv: "Lejupielādējiet Tvītu Tieši Premium11: Saglabā Video, GIF Un Attēlus No X",
  ml: "ട്വീറ്റ് നേരിട്ട് ഡൗൺലോഡ് ചെയ്യുക Premium11: X-ൽ നിന്ന് വീഡിയോ, GIF",
  mr: "ट्विट थेट डाउनलोड करा Premium11: X वरून व्हिडिओ, GIF, प्रतिमा जतन",
  ms: "Muat Turun Tweet Secara Terus Premium11: Simpan Video, GIF & Imej Dari X",
  nl: "Download De Tweet Direct Premium11: Sla Video, GIF En Beelden Van X Op",
  no: "Last Ned Tweeten Direkte Premium11: Lagre Video, GIF Og Bilder Fra X",
  pl: "Pobierz Tweeta Bezpośrednio Premium11: Zapisz Wideo, GIF I Obrazy Z X",
  pt_BR: "Baixe O Post Diretamente Premium11: Salve Vídeo, GIF E Imagens Do X",
  pt_PT: "Descarregue O Post Diretamente Premium11: Guarde Vídeo, GIF E Imagens Do X",
  ro: "Descarcă Postarea Direct Premium11: Salvează Video, GIF Și Imagini De Pe X",
  ru: "Просто Скачайте Твит Premium11: Сохраняйте Видео, GIF И Фото С X",
  sk: "Stiahnite Tweet Priamo Premium11: Uložte Video, GIF A Obrázky Z X",
  sl: "Prenesite Tvit Neposredno Premium11: Shranite Video, GIF In Slike Z X",
  sr: "Preuzmite Tvit Direktno Premium11: Sačuvaj Video, GIF I Slike Sa X",
  sv: "Ladda Ner Tweeten Direkt Premium11: Spara Video, GIF Och Bilder Från X",
  sw: "Pakua Tweet Moja Kwa Moja Premium11: Hifadhi Video, GIF Na Picha Kutoka X",
  ta: "ட்வீட்டை நேரடியாகப் பதிவிறக்கவும் Premium11: X இலிருந்து வீடியோ, GIF",
  te: "ట్వీట్‌ను నేరుగా డౌన్‌లోడ్ చేయండి Premium11: X నుండి వీడియో, GIF",
  th: "ดาวน์โหลดทวีตได้ทันที Premium11: บันทึกวิดีโอ GIF รูปจาก X",
  tr: "Tweeti Doğrudan Indirin Premium11: X'ten Video, GIF Ve Görsel Kaydet",
  uk: "Завантажте Твіт Напряму Premium11: Зберігайте Відео, GIF І Фото З X",
  vi: "Tải Tweet Trực Tiếp Premium11: Lưu Video, GIF & Ảnh Từ X",
  zh_CN: "直接下载推文 Premium11: 保存 X 视频、GIF 和图片",
  zh_TW: "直接下載推文 Premium11: 儲存 X 影片、GIF 與圖片"
};

export function resolveExtensionName(locale) {
  const raw = LOCALIZED_EXTENSION_NAMES[locale] ?? CANONICAL_EXTENSION_NAME;
  return formatExtensionTitle(locale, raw);
}

for (const [locale, name] of Object.entries({
  en: CANONICAL_EXTENSION_NAME,
  ...LOCALIZED_EXTENSION_NAMES
})) {
  if (name.length > 75) {
    throw new Error(`manifest-store-copy: [${locale}] extensionName exceeds 75 (${name.length}).`);
  }
}

if (CANONICAL_EXTENSION_DESCRIPTION.length > 132) {
  throw new Error(
    `manifest-store-copy: canonical extensionDescription exceeds 132 (${CANONICAL_EXTENSION_DESCRIPTION.length}).`
  );
}
