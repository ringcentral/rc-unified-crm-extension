# App Connect MCP Server

!!! warning "The App Connect MCP server is currently in alpha. Feedback welcome."

App Connect provides a hosted [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives AI assistants and LLMs direct access to the CRM you are connected to via your App Connect installation. Through this access one can perform a number of actions within your CRM based upon what is supported by your CRM's connector. Use cases include:

* Lookup contacts in your CRM
* Attach a note to a contact record in your CRM
* Query your call/activity history 

## Available Tools

| Tool                  | Description |
|-----------------------|-------------|
| `getHelp`             | Returns a static and generalized help method. The intent is to provide the LLM with content and context so that it can guide users more successfully in using the MCP server. |
| `getPublicConnectors` | Return a list of CRMs with additional context to assist users in establishing a connection to one of the CRMs in the list.            |
| `logout`              | Logs the MCP server's session out of the CRM.             |
| `findContactByPhone`  | Looks up and returns a list of contacts and their types from the connected CRM using a phone number as the search key. |
| `findContactByName`   | Looks up and returns a list of contacts and their types from the connected CRM using a person's name as the search key. |
| `createCallLog`       | Instructs the MCP server to create a call/activity record for the specified phone call. |
| `rcGetCallLogs`       | Retrieves from RingCentral recent calls. |
| `createContact`       | Creates a contact recording in the connected CRM. |

## MCP Server URLs

| Region | URL                                                       |
|--------|-----------------------------------------------------------|
| US     | `https://unified-crm-extension.labs.ringcentral.com/mcp` |

## Setup

While App Connect's MCP server has the ability to connect independently to the CRMs within the App Connect ecosystem, the experience is hit-or-miss. The more reliable way to connect to your CRM is to [download](../getting-started.md) App Connect and connect to your CRM via the Chrome/Edge extension. Once connected, App Connect will use that connection to talk to your CRM rather than the session you might create by engaging the `getPublicConnectors` tool. 
