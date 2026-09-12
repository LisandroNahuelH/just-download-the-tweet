type MessageEntry = {
  message: string;
  placeholders?: Record<string, { content: string; example?: string }>;
};

type MessageCatalog = Record<string, MessageEntry>;

function applySubstitutions(entry: MessageEntry, substitutions: string[]): string {
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

export function formatMessage(catalog: MessageCatalog, key: string, ...substitutions: string[]): string {
  const entry = catalog[key];
  if (!entry) {
    return key;
  }

  return substitutions.length > 0 ? applySubstitutions(entry, substitutions) : entry.message;
}

export function createChromeI18nMock(
  catalog: MessageCatalog,
  locale: string,
): typeof chrome {
  return {
    i18n: {
      getMessage: (key: string, ...substitutions: string[]) =>
        formatMessage(catalog, key, ...substitutions),
      getUILanguage: () => locale,
    },
    runtime: {
      sendMessage: () => undefined,
    },
  } as unknown as typeof chrome;
}