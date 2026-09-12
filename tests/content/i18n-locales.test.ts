import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import arCatalog from "../../public/_locales/ar/messages.json";
import deCatalog from "../../public/_locales/de/messages.json";
import enCatalog from "../../public/_locales/en/messages.json";
import esCatalog from "../../public/_locales/es/messages.json";
import jaCatalog from "../../public/_locales/ja/messages.json";
import { JustDownloadTheTweetApp } from "../../src/content/ui";
import {
  createChromeI18nMock,
  formatMessage,
} from "../test-support/create-chrome-i18n-mock";

function loadFixture(name: "x-home.html"): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");
}

const LOCALE_CASES = [
  { locale: "en", catalog: enCatalog },
  { locale: "es", catalog: esCatalog },
  { locale: "de", catalog: deCatalog },
  { locale: "ja", catalog: jaCatalog },
  { locale: "ar", catalog: arCatalog },
] as const;

describe("content i18n locales", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  for (const localeCase of LOCALE_CASES) {
    it(`renders localized popover copy for ${localeCase.locale}`, async () => {
      document.body.innerHTML = loadFixture("x-home.html");
      vi.stubGlobal("location", { pathname: "/home", origin: "https://x.com" } as Location);
      vi.stubGlobal(
        "chrome",
        createChromeI18nMock(localeCase.catalog, localeCase.locale),
      );

      const app = new JustDownloadTheTweetApp();
      app.scanNow();

      const host = document.querySelector("[data-just-download-the-tweet-host]") as HTMLDivElement;
      expect(host).not.toBeNull();

      const trigger = host.shadowRoot?.querySelector("button") as HTMLButtonElement;
      expect(trigger.getAttribute("aria-label")).toBe(
        formatMessage(localeCase.catalog, "downloadOptionsTitle"),
      );

      trigger.click();
      await Promise.resolve();

      const popover = host.shadowRoot?.querySelector('[role="menu"]') as HTMLDivElement;
      const popoverText = popover.textContent ?? "";

      expect(popoverText).toContain(formatMessage(localeCase.catalog, "postMediaTitle"));
      expect(popoverText).toContain(formatMessage(localeCase.catalog, "itemMedia", "1"));
      expect(popoverText).toContain(formatMessage(localeCase.catalog, "itemMedia", "2"));
      expect(popoverText).toContain(formatMessage(localeCase.catalog, "downloadAll"));
      expect(popoverText).toContain(formatMessage(localeCase.catalog, "downloadZip"));

      const styleText = host.shadowRoot?.querySelector("style")?.textContent ?? "";
      expect(styleText).toContain("text-align: start");

      if (localeCase.locale !== "en") {
        expect(popoverText).not.toContain(enCatalog.postMediaTitle.message);
        expect(popoverText).not.toContain(enCatalog.downloadZip.message);
        expect(popoverText).not.toContain(formatMessage(enCatalog, "itemMedia", "1"));
      }
    });
  }
});