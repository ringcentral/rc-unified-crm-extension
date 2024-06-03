# Getting started building a custom CRM adapter

{! docs/developers/beta_notice.inc !}

Every CRM adapter requires a manifest file which provides developers a way to configure and customize the framework properly for the associated CRM. Via the adapter's manifest, developers can:

* Provide CRM connectivity and authorization details
* Define custom fields for:
    * call logging and disposition forms
    * SMS and messagig logging forms
* Customize the "Connect to CRM" or authorization screen
* Define custom contact record types/categories
* Customize the welcome screen for a given CRM

## Prepare your development environment

The fastest way to get started, is to customize a sample adapter that comes bundled with the framework. Begin by cloning the Unified CRM adapter Github repository:

    > git clone https://github.com/ringcentral/rc-unified-crm-extension.git
    > cd rc-unified-crm-extension

Next, copy the contents of the test CRM adapter to a new folder where your adapter will be placed.

    > cp src/adapters/testCRM src/adapters/my-crm-adatper

## Next step: edit your manifest file

With this step complete, you now have a shell of an adapter in place and you are ready to begin development. Let's start by customizing your adapter's manifest file. 

[Customize manifest file](manifest.md){.md-button}

