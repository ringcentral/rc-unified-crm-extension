---
name: docs-site-writing
description: Use this skill when writing or revising content inside `rc-unified-crm-extension/docs` for the App Connect MkDocs site. Follow the existing public docs style used across user, developer, solution, and support pages, while applying modern documentation best practices for clarity, structure, scannability, and correctness.
---

# Docs Site Writing

Use this skill for pages that live inside `rc-unified-crm-extension/docs`.

This skill is for the public-facing docs site, not the repo-level internal docs in the monorepo root `docs/` folder.

## Goal

Write pages that feel native to the existing App Connect docs site:

- polished but practical,
- confident without sounding corporate,
- feature- and workflow-oriented,
- easy to scan,
- friendly to both end users and developers.

Absorb the current site voice first, then improve structure and readability without making the page feel like it came from a different documentation system.

## Existing House Style

The current docs site tends to:

- lead with a direct title and a short orientation paragraph,
- explain real product behavior before edge cases,
- use second person when guiding the reader,
- favor concrete examples over abstract framing,
- mix prose with tables, admonitions, cards, figures, and screenshots,
- use MkDocs Material features for navigation and visual emphasis,
- keep the tone approachable even in technical docs.

When editing, preserve that voice. Improve wording, sequence, and accuracy, but do not flatten the page into sterile generic documentation.

## First Step

Before drafting a new page or heavily revising an existing one, inspect 2 to 3 nearby pages from the same docs area when possible.

Match the local section style:

- `docs/users/`: task-oriented, feature-focused, helpful, light product framing
- `docs/developers/`: instructional, interface-aware, more precise, still approachable
- `docs/solutions/`: more persuasive and benefit-led, but still concrete
- root/support pages: concise, troubleshooting-oriented, action-first

## Writing Rules

### Preserve site-native structure

Prefer this order unless the page clearly needs something else:

1. Title
2. Short orientation or summary
3. Core concepts, steps, or capability breakdown
4. Warnings, caveats, or special cases
5. Examples, screenshots, or references

### Keep introductions short

Open with 1 to 2 short paragraphs. Tell the reader what the feature, guide, or page is about before diving into details.

### Prefer scannable sections

Use short headings that help a reader skim:

- `Authentication`
- `Call logging sequence`
- `Common questions and issues`

Avoid vague headings like:

- `Overview of concepts`
- `Important details`

### Use the right tone for the page type

For user docs:

- explain outcomes and common actions,
- minimize unnecessary implementation detail,
- use friendly guidance,
- mention caveats where they affect user success.

For developer docs:

- be precise about interfaces, parameters, routes, and constraints,
- include request and response examples where useful,
- link to related developer pages instead of duplicating content.

For solution pages:

- lead with business value,
- keep claims concrete,
- anchor benefits in actual App Connect capabilities.

## MkDocs Material Patterns

Use the site's existing formatting patterns when they help:

- admonitions such as `!!! tip`, `!!! info`, `!!! warning`, `!!! note`
- tables for properties, comparisons, and capability summaries
- figures for screenshots and UI references
- card grids for solution or navigation-heavy pages
- markdown buttons for important CTAs when appropriate

Do not add formatting for decoration alone. Every visual element should make the page easier to use.

## Organic Best Practices

Blend these best practices into the existing style:

- Put the reader's likely question first.
- Define terms before using them repeatedly.
- Put prerequisites before steps.
- State limitations and failure conditions near the relevant step.
- Use consistent terminology for App Connect, connector, plugin, manifest, CRM, and server-side logging.
- Prefer examples with realistic values over placeholders when safe to do so.
- Link outward to deeper docs rather than restating long background sections.

## Admonition Guidance

Use admonitions intentionally:

- `tip` for shortcuts, recommendations, and best practices
- `info` for context that helps interpretation
- `warning` for data loss, policy, or configuration risk
- `note` for side information that matters but is not risky

Keep admonitions short. If the content is the main point of the section, use a normal paragraph instead.

## Images and Figures

When a screenshot materially helps:

- place it close to the relevant section,
- use a direct caption,
- describe what the reader should notice,
- avoid repeating the full paragraph in the caption.

## API and Interface Pages

For endpoint and interface docs, prefer:

1. What the endpoint does
2. When it is called
3. Request example
4. Response shape
5. Important properties or caveats

If the page already has a lightweight style, keep it lightweight. Improve clarity without forcing a full reference-manual template.

When documenting a request or response contract, keep the example format consistent within the section:

- If you are showing JSON payloads or response bodies, use one code fence language consistently, preferably `json`.
- Do not mix an `http` block that embeds a JSON body with separate `js` or `json` blocks for nearly identical payloads in the same section.
- If the HTTP method and path matter, state them in prose or a short standalone line, then show the body separately as `json`.

## Things to Avoid

- sounding more formal than the surrounding docs,
- overusing internal engineering terminology in user docs,
- long blocks of theory before the reader can act,
- repeating the same explanation across multiple pages,
- rewriting neighboring pages' style just to make one page "cleaner",
- introducing repo-internal documentation conventions into the public docs site.

## Review Checklist

Before finishing, verify:

- the page matches the surrounding docs section's style,
- the title reflects the reader's real task or topic,
- the first paragraphs orient the reader quickly,
- headings are specific and easy to scan,
- examples and screenshots match the current product or interface,
- links are relative and fit the existing docs structure,
- best practices improved the page without erasing its existing voice.
