# Build Connectors with the App Connect Claude Plugin

<div class="solution-header" markdown>

<p class="solution-header__eyebrow">Developer tools</p>

### <span class="solution-header__lead">Skip the boilerplate.</span> <span class="solution-header__punch">Ship a connector today.</span>

The App Connect Claude Plugin is a set of Claude skills that scaffold, wire up, and test a standalone App Connect connector for you — from `npx @app-connect/cli init` all the way through auth, contact matching, call logging, and deploy. What used to take days of reading interface docs now takes a conversation.

</div>

<!--
Maintenance note: this page bundles a copy of appconnect-connector-skills.zip
for direct download. Whenever that plugin's version is bumped (per the "ask
before regenerating the zip" project rule), re-copy the new zip over the one
in this folder so the download link stays current.
-->

<div class="bld-cta" markdown>
<div markdown>

**Download the Claude Plugin**
{: .bld-cta__title }

A single zip — install it in Claude Code or Cowork and start building.
{: .bld-cta__desc }

</div>

[Download Plugin →](appconnect-connector-skills.zip){ .bld-cta__btn }

</div>

## What it does

Instead of hand-rolling a connector interface by interface, you describe the CRM you want to support and the plugin's skills take it from there: they read the CRM's OpenAPI spec where one exists, ask you the handful of questions a spec can't answer, and generate manifest wiring and server code that follows the same patterns as App Connect's reference connectors. Each skill below can also run on its own if you only need to touch one part of an existing connector.

## Installing it

1. Download the zip using the button above.
2. In Claude Code or Cowork, open **Plugins** and install from the downloaded file.
3. Say something like *"build an App Connect connector for Zendesk"*, or invoke `appconnect-build-connector` directly, and follow the prompts.

## The skills, in build order

The plugin ships 14 skills. `appconnect-build-connector` is the orchestrator most people start with — it runs the rest of these in sequence, pausing for your confirmation between steps. Steps marked **Optional** only run if you ask for that capability or select it in scope.

<div class="acp-skills" markdown>

<div class="acp-skill" id="appconnect-readiness" markdown>
<span class="acp-skill__num">1</span>
<div class="acp-skill__body" markdown>

**Is my CRM ready?** — `appconnect-readiness`
{: .acp-skill__title }

Feeds a CRM's OpenAPI/Swagger spec (or its docs) into a readiness check and reports which App Connect capabilities it can support — auth, contact lookup, call and message logging, appointments, admin settings. Run it before committing to a build to catch API gaps early. Optional and standalone; it never scaffolds anything.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-build-connector" markdown>
<span class="acp-skill__num">2</span>
<div class="acp-skill__body" markdown>

**Orchestrate the build** — `appconnect-build-connector`
{: .acp-skill__title }

The entry point. Interviews you once about which features you need, then sequences setup, auth, local testing, and every feature skill you selected in the right order — pausing for confirmation between steps and tracking progress in a `PROGRESS.md` file.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-setup" markdown>
<span class="acp-skill__num">3</span>
<div class="acp-skill__body" markdown>

**Scaffold the project** — `appconnect-setup`
{: .acp-skill__title }

Creates a new standalone connector project from the official `@app-connect/cli` template, names it after your target CRM, initializes git and a GitHub repo, installs dependencies, and prepares your local `.env`.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-auth" markdown>
<span class="acp-skill__num">4</span>
<div class="acp-skill__body" markdown>

**Wire up authentication** — `appconnect-auth`
{: .acp-skill__title }

Works out OAuth vs. static-credential auth from the CRM's spec (or by asking you directly), collects secrets into a git-ignored `.env`, wires the manifest's auth block, and implements every auth interface function — `getAuthType`, `getOauthInfo`, `getUserInfo`, `unAuthorize`, and the rest — plus a test.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-local-testing" markdown>
<span class="acp-skill__num">5</span>
<div class="acp-skill__body" markdown>

**Prove login works** — `appconnect-local-testing`
{: .acp-skill__title }

Runs your connector locally, tunnels it with ngrok, registers it in the Developer Console, verifies that the Console's complete Unique Identifier matches the server's `registerConnector()` key, and confirms the auth flow actually logs in from a real App Connect client — before any further interface work gets built on top of it. See [Troubleshoot A Platform Lookup Failure](getting-started.md#troubleshoot-a-platform-lookup-failure) if `/implementedInterfaces` returns HTTP 400.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-contact-matching" markdown>
<span class="acp-skill__num">6</span>
<div class="acp-skill__body" markdown>

**Look up contacts** — `appconnect-contact-matching`
{: .acp-skill__title }

Implements phone-to-contact lookup (`findContact`), optional name search and contact creation, the additional-info pattern that links a call to related CRM records like deals or matters, and the call-pop URLs used when no match is found.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-custom-fields" markdown>
<span class="acp-skill__num">7</span>
<div class="acp-skill__body" markdown>

**Add custom log fields** — `appconnect-custom-fields`
{: .acp-skill__title }

Wires up dropdowns on the call log, message log, or new-contact form — note type, activity type, outcome — and connects a call or message to a related record such as a deal or ticket.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-call-logging" markdown>
<span class="acp-skill__num">8</span>
<div class="acp-skill__body" markdown>

**Log calls to the CRM** — `appconnect-call-logging`
{: .acp-skill__title }

Implements `createCallLog` and `updateCallLog`, plus optional disposition tracking and log retrieval, so every RingEX call lands in the CRM as an activity, note, or ticket comment — including rich-text formatting and deep links back to the call.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-sms-logging" markdown>
<span class="acp-skill__num">9</span>
<div class="acp-skill__body" markdown>

**Log texts to the CRM** <span class="acp-skill__optional">Optional</span> — `appconnect-sms-logging`
{: .acp-skill__title }

Implements SMS/message logging, grouped by conversation rather than one row per message. The same interface also covers fax and voicemail.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-appointments" markdown>
<span class="acp-skill__num">10</span>
<div class="acp-skill__body" markdown>

**Sync appointments** <span class="acp-skill__optional">Optional</span> — `appconnect-appointments`
{: .acp-skill__title }

Adds calendar sync between RingEX and the CRM — listing, creating, updating, confirming, and canceling appointments. Useful for verticals with a scheduling concept, like legal or automotive.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-server-logging" markdown>
<span class="acp-skill__num">11</span>
<div class="acp-skill__body" markdown>

**Log calls account-wide** <span class="acp-skill__optional">Optional</span> — `appconnect-server-logging`
{: .acp-skill__title }

Adds server-side call logging, so an admin can turn on logging for an entire organization from the backend without any user having the extension open — including mapping RingEX extensions to the right CRM user.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-settings-admin" markdown>
<span class="acp-skill__num">12</span>
<div class="acp-skill__body" markdown>

**Add settings &amp; licensing** <span class="acp-skill__optional">Optional</span> — `appconnect-settings-admin`
{: .acp-skill__title }

Implements custom per-user or per-account settings, per-seat license gating before an operation proceeds, and searchable admin-managed auth fields.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-deploy" markdown>
<span class="acp-skill__num">13</span>
<div class="acp-skill__body" markdown>

**Choose where it runs** — `appconnect-deploy`
{: .acp-skill__title }

Picks a hosting target — AWS Lambda, Azure App Service, or Heroku — and trims the scaffolded project down to just that path, authoring Heroku deploy files from scratch since the template doesn't ship them.
{: .acp-skill__desc }

</div>
</div>

<div class="acp-skill" id="appconnect-code-review" markdown>
<span class="acp-skill__num">14</span>
<div class="acp-skill__body" markdown>

**Final review pass** <span class="acp-skill__optional">Optional</span> — `appconnect-code-review`
{: .acp-skill__title }

A focused review of the generated connector code — security, performance, idiomatic patterns, and naming. It produces a findings report first and only edits files once you confirm what to fix.
{: .acp-skill__desc }

</div>
</div>

</div>

## Next steps

Not sure your CRM is a fit yet? Start with the [readiness check](proprietary-crm.md) before you scaffold anything. Ready to go deeper on a specific interface instead of the full build? The [connector interface reference](interfaces/index.md) is the source of truth every skill above is built against.
