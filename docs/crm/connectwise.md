# Setting up App Connect for ConnectWise

!!! info "Requires App Connect 2.0"
    This integration is only available in [App Connect 2.0](../2.0/index.md). Make sure you have the latest version installed before getting started.

[ConnectWise](https://www.connectwise.com) (ConnectWise PSA) is the leading professional services automation platform for IT solution providers and managed service providers, covering ticketing, service boards, time tracking, and billing in one system.

[Captivo Labs](https://www.captivolabs.com) connects your RingCentral account to your ConnectWise account. When you receive a call, our system looks up the matching company or contact in ConnectWise and displays it to you before answering the actual call. When a call ends, it's logged as an activity against the right company, contact, and ticket, along with notes, AI transcription summaries, tasks, and call duration.

<iframe width="825" height="464" src="https://www.youtube.com/embed/mNUL_Kc82rs?si=NcUEBRYeI79FuqGA" title="Ring Central + Odoo by Captivo Labs" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

!!! money "As a third-party integration, the ConnectWise integration comes at an additional cost"

## What it does

- Surfaces the matching ConnectWise company or contact when a call comes in or goes out
- Automatically logs call activities against the correct ticket or record, including duration and notes
- Lets you add call notes from directly within the RingCentral dialer
- Uses AI transcriptions to summarise conversations and extract tasks
- Outbound calls directly from ConnectWise
- Screen pop for inbound calls so agents open the right ticket before they even answer

## Register an app in ConnectWise

Before installing the extension, generate API credentials from within ConnectWise:

1. Log into your ConnectWise PSA (Manage) environment with administrator rights.
2. Navigate to **System > Members** (or **My Account / API Members**).
3. Create or select a dedicated API member and open their user record.
4. Select the **API Keys** tab and click the **+** or **New** icon to generate a new key pair.
5. Copy and securely save the **Public Key** and **Private Key** immediately — the private key is only shown once.

Also make a note of your **Company ID** and which environment you're on (North America, Australia, EU, or ConnectWise Sandbox), as you'll need these during setup.

## Install the extension

If you have not already done so, begin by [installing App Connect](https://appconnect.labs.ringcentral.com/2.0/) from the Chrome Web Store.

## Setup the extension

Once the extension has been installed, follow these steps to setup and configure the extension for ConnectWise.

1. Launch the App Connect extension from your browser extensions. If you don't see the extension, click on the extensions button in your browser and pin the App Connect extension so it's always visible.

2. Login with your RingCentral account.

3. Navigate to the Settings screen in App Connect, and find the option labeled "ConnectWise."

4. Click the "Connect" button.

5. Select ConnectWise PSA from the list of connectors.

6. Select your region or environment — one of North America, Australia, EU, or ConnectWise Sandbox.

7. Enter your Company ID.

8. Enter the Private Key and Public Key for the API member you registered earlier.

When you login successfully, the browser extension will automatically update to show you are connected to ConnectWise. If you are connected, the button next to ConnectWise will say, "logout."

## ConnectWise Settings

Navigate to the ConnectWise options under App Connect's Settings area and enter your ConnectWise email address — this is especially important if it differs from your RingCentral email address, since it's used to match your identity between the two systems.

And with that, you will be connected to ConnectWise and ready to begin using the integration.

## Usage Instructions

For more detailed installation and usage instructions, please visit the [integration documentation](https://docs.captivolabs.com/connectwise).
