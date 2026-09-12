import enMessages from "../../../public/_locales/en/messages.json";

type MessageEntry = {
  message: string;
  placeholders?: Record<string, { content: string; example?: string }>;
};

type MessageCatalog = Record<string, MessageEntry>;

const FALLBACK_CATALOG = enMessages as MessageCatalog;

function applyFallbackSubstitutions(entry: MessageEntry, substitutions: string[]): string {
  let result = substitutions.reduce(
    (current, value, index) => current.replaceAll(`$${index + 1}`, value),
    entry.message,
  );

  for (const [name, placeholder] of Object.entries(entry.placeholders ?? {})) {
    const index = placeholder.content.match(/^\$(\d+)$/)?.[1];
    const value = index ? substitutions[Number(index) - 1] : undefined;
    if (value === undefined) {
      continue;
    }

    result = result.replaceAll(`$${name}$`, value).replaceAll(`$${name.toUpperCase()}$`, value);
  }

  return result;
}

export function getMessage(key: string, ...substitutions: string[]): string {
  try {
    const translated = globalThis.chrome?.i18n?.getMessage(key, substitutions);

    if (translated) {
      return translated;
    }
  } catch {
    // Fall through to the bundled English catalog.
  }

  const fallback = FALLBACK_CATALOG[key];

  if (!fallback) {
    return key;
  }

  return substitutions.length > 0 ? applyFallbackSubstitutions(fallback, substitutions) : fallback.message;
}
