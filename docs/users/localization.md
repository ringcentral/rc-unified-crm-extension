# Language & Localization — User Guide

App Connect can show its interface in your preferred language. This guide explains what that means, how the app decides which language to show, and how you can change it.

---

## What is it?

Localization simply means the App Connect extension displays its buttons, labels, menus, and messages in a supported language instead of only English. When a language is active, text such as **Save**, **Cancel**, **Connect**, and notification messages appear translated.

### Supported languages

| | | |
| --- | --- | --- |
| English (US) | English (UK) | English (Canada) |
| English (Australia) | Deutsch (German) | Français (France) |
| Français (Canada) | Español (España) | Español (Latinoamérica) |
| Italiano | Nederlands (Dutch) | Português (Brasil) |
| Português (Portugal) | Suomi (Finnish) | 日本語 (Japanese) |
| 한국어 (Korean) | 简体中文 (Simplified Chinese) | 繁體中文 (香港) |
| 繁體中文 (台灣) | हिन्दी (Hindi) | |

If your language isn't listed, App Connect falls back to the closest match, and ultimately to **English (US)**.

---

## How it works

By default, App Connect follows your **browser's language**. So if your browser is set to German, the extension appears in German automatically — no setup needed.

You can override this by choosing a specific language in Settings. Your choice is remembered on your device and takes priority over the browser language.

The app decides which language to display in this order:

1. **A language set by your administrator** — if your admin has enforced a language for everyone, that language is used and can't be changed.
2. **Your own choice in Settings** — the language you pick (see below). Choosing **Auto** here means "follow my browser".
3. **Your browser's language** — used when no explicit choice is set.
4. **English (US)** — the final fallback.

> Your selection is saved locally in the browser, so it stays in effect even after you close and reopen the extension, and it isn't reset when your RingCentral region changes.

---

## How to change the language

1. Open the App Connect extension.
2. Go to **Settings** (the gear/menu icon).
3. Open the **Language** setting (under appearance/general settings).
4. Pick a language from the dropdown:
   - Choose a specific language (e.g. **Deutsch**, **日本語**) to force that language, or
   - Choose **Auto** to follow your browser's language.
5. Click **Save**.

The interface updates to the new language right away — labels, buttons, and settings screens re-render in your chosen language.

---

## For administrators

If you manage App Connect for your organization, the **Language** setting includes a **"Customizable by user"** toggle:

- **On (default):** each user can pick their own language.
- **Off:** the language you select is enforced for everyone and users cannot change it.

Set this from the admin settings page, choose the desired language value (or **Auto**), and click **Save**.

---

## Notes & troubleshooting

- **Region vs. language:** Your RingCentral region influences the default language, but an explicit choice in Settings always wins.
- **Some text stays in English:** Content that comes from your CRM or the server (for example, certain field names or CRM-provided values) may not be translated by App Connect. App Connect does request localized content from the server where supported, but the CRM ultimately controls that text.
- **Language didn't change after selecting it:** Make sure you clicked **Save**. If an administrator has enforced a language, the dropdown selection won't take effect.
