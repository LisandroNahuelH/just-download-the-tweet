const NO_CASE_LOCALES = new Set([
  "am",
  "ar",
  "bn",
  "fa",
  "gu",
  "he",
  "hi",
  "ja",
  "kn",
  "ko",
  "ml",
  "mr",
  "ta",
  "te",
  "th",
  "zh"
]);

export function shouldApplyTitleCase(locale) {
  return !NO_CASE_LOCALES.has(locale.split("_")[0]);
}

export function capitalizeWordInitials(text) {
  return text.replace(/(?:^|[\s:/\-',])(\p{Ll})/gu, (match, letter) =>
    match.slice(0, -1) + letter.toUpperCase()
  );
}

export function formatExtensionTitle(locale, title) {
  if (!shouldApplyTitleCase(locale)) {
    return title;
  }
  return capitalizeWordInitials(title);
}
