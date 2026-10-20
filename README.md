<p align="center">
  <img src="docs/assets/evolvera-hero.svg" alt="Evolvera Coding Agent — purple, lilac, and coral pixel-art landscape with the Evolvera ship and flag" width="100%">
</p>

<p align="center">
  <strong>A coding agent workspace. In your terminal.</strong><br>
  Models, specialized agents, skills, and tools working in the same workflow.
</p>

<p align="center">
  <a href="#get-started">Install</a> ·
  <a href="#from-request-to-delivery">How it works</a> ·
  <a href="docs/setup.md">Documentation</a> ·
  <a href="docs/terminal-art.md">Design</a>
</p>

---

## Your way to build

**Evolvera Coding Agent** brings together a development harness built on the [PI Coding Agent](https://github.com/badlogic/pi): working instructions, specialized agents, skills, and extensions versioned together.

You describe the outcome. The main agent chooses whether to act directly or delegate, follows the work, and assembles the delivery with evidence of what worked. Code, tools, and configuration stay in your environment.

| One foundation, multiple paths | What it offers |
| :--- | :--- |
| **Terminal first** | Work in the terminal or the VS Code integrated terminal. |
| **Specialized agents** | Research, planning, implementation, design, and review with distinct responsibilities. |
| **Configurable models** | Providers and models are configured explicitly; each agent can have its own route. |
| **On-demand skills** | Procedures for specific tasks, loaded when needed. |
| **Extensions and MCP** | Commands, hooks, and tools to connect the agent to your workflow. |
| **Orchestration with Orca** | Optional issues, worktrees, and workers workflow, with a conductor coordinating delivery. |

## Get started

You need **Git**, **Node.js ≥22.19.0**, **npm**, and access to at least one AI provider. The default installed runtime is **`@earendil-works/pi-coding-agent@1.3.0`**.

> Repository publication is still pending secret revocation and scope separation. The commands below use the current repository address; **Evolvera Coding Agent** is the proposed publication identity.

### macOS / Linux

```bash
git clone https://github.com/Evolvera/evolvera.git
cd evolvera
./install.sh
pi
```

### Windows · PowerShell

```powershell
git clone https://github.com/Evolvera/evolvera.git
Set-Location evolvera
.\install.ps1
pi
```

In your first session, use **`/login`** to authenticate with your provider.

The [installation guide](docs/setup.md#quick-start) covers Node/fnm, Windows, WSL, and setup verification. It also explains what the installers update and preserve.

## From request to delivery

```text
Your request
    ↓
Main agent + project context
    ├── direct action for simple work
    └── specialized agents when useful
             ↓
        code + validation
             ↓
         integrated delivery
```

A request can be as simple as:

```text
Fix the authentication error and run the affected test.
```

Or it can involve parallel work:

```text
Plan the integration, split out independent work, and validate the delivery.
```

Configuration is explicit. Explore [the agents](agents/), [the skills](skills/), and [the extensions](extensions/) to adapt the harness to your project. The main agent's rules are in [`SYSTEM.md`](SYSTEM.md).

## Beyond the terminal

- **VS Code:** selection, open files, and diagnostics through the extension bridge. [Setup and compatibility →](docs/setup.md#use-with-vs-code)
- **Conductor:** coordination of workers in Orca worktrees. [Flow Orca workflow →](skills/flow-orca/SKILL.md)

Optional Orca integrations remain part of the harness. **The publication scope is only the terminal Coding Agent harness—not PI Studio or the Orca application.**

## A distinctive identity

The opening landscape translates Kevin's **Acid Shellscape** into native terminal pixel art: a purple and coral sky, layered mountains, reflections, and the Evolvera ship.

The banner above was rendered from this repository's implementation. Kevin's private reference retains its own rights; its code and screenshots are not redistributed here. [Composition, credits, and usage limits →](docs/terminal-art.md)

Want to see the artwork without accessing accounts or starting a work session?

```bash
node scripts/preview-terminal-art.mjs --select
```

Account selection in the actual launcher has a separate activation process from the installers. [Accounts and sessions →](docs/auth-only-accounts.md)

## Documentation

| Guide | Contents |
| :--- | :--- |
| [Installation and operation](docs/setup.md) | Full setup, updates, daily use, compatibility, and troubleshooting. |
| [Accounts and sessions](docs/auth-only-accounts.md) | Managed launcher, credentials, and per-session account binding. |
| [Terminal artwork](docs/terminal-art.md) | Visual identity, rendering, and preview. |
| [Engineering principles](ENGINEERING.md) | Project technical conventions. |

## Publication and licensing

Publication is pending secret revocation and scope separation. This presentation **does not grant an open-source license** or change the licenses of third-party components. No license is asserted here.

<p align="center"><sub>Built by Evolvera on the PI ecosystem.</sub></p>
