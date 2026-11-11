<p align="center">
  <img src="assets/branding/dsh-banner-en.webp" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **Lokale und projektspezifische Skills einheitlich verwalten, von GitHub installieren, Updates vorab prüfen und Backups wiederherstellen**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [Änderungsprotokoll](CHANGELOG.md) · [Lizenz](LICENSE)

  [![Lizenz: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm Downloads](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![Kompatibel bis DSH 0.2.2-rc.1](https://img.shields.io/badge/DSH-up%20to%200.2.2--rc.1-2563eb.svg)](#installation)
</div>

> DSH Skills Manager ist ein von der Community gepflegtes DeepSeek Harness (DSH)-Plugin und kein offizielles Produkt von DeepSeek AI.

## Funktionen

Bündeln Sie Ihre lokalen und projektspezifischen Skills direkt in DSH, ohne ständig zwischen verschiedenen Agent-Ordnern wechseln zu müssen.

- **Einheitliche Multi-View-Verwaltung**: Tabs für Globale Skills, Projekt-Skills, Entdecken und Papierkorb mit Sofortsuche und Statusfiltern.
- **Navigation nach Quell-Repository**: Wechseln Sie zwischen Verzeichnis- und Repository-Ansicht mit zuverlässiger Erkennung der Herkunft.
- **Breite Ökosystem-Kompatibilität**: Unterstützung für über 20 Tools und CLI-Umgebungen (DSH, Shared Agent, Codex, Claude Code, Copilot, Cursor, Google Antigravity, Windsurf, Qoder, Trae).
- **Kategorien und Drag & Drop**: Erstellen Sie Kategorien, organisieren Sie Skills per Drag & Drop (`⋮⋮`) und schalten Sie ganze Kategorien mit einem Klick ein oder aus.
- **Öffentliche Märkte und GitHub-Repositories**: Integriertes Entdecken-Center für ClawHub und skills.sh sowie Repository-Abonnements mit automatischer Backup-Sicherung.
- **Erstellung und flexibler Import**: Neue Skills erstellen oder ZIP-Dateien, Ordner und `SKILL.md`-Dateien sicher importieren.
- **Breitbild-Detailansicht**: Responsiver 760px-Dialog mit Monospace-Code-Hervorhebung und Ein-Klick-Kopie des Markdown-Texts.
- **Papierkorb und sichere Wiederherstellung**: Gelöschte DSH-Skills werden in den Papierkorb verschoben und können vollständig wiederhergestellt werden.
- **Benutzerdefinierte Quellordner**: Externe Agent-Pfade direkt im Panel ändern, ohne Dateien zu verschieben.

## Screenshots

Globale Skill-Verwaltungsansicht:

![Globale Skill-Verwaltungsansicht](assets/screenshots/skills-manager-v2-preview.webp)

Projekt-Skill-Verwaltungsansicht:

![Projekt-Skill-Verwaltungsansicht](assets/screenshots/skills-manager-project-scope-preview.webp)

## Installation

### Installation per Agent

Weisen Sie den Agenten in einer DSH-Konversation an:

```text
Installiere das Plugin @michengai/dsh-skills-manager
```

### Manuelle Installation

Führen Sie im Terminal aus:

```bash
dsh plugin add @michengai/dsh-skills-manager
```

In Windows PowerShell:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
```

Starten Sie DSH neu, aktualisieren Sie die Seite und öffnen Sie **Einstellungen → Skills**. Aktualisierungen des Plugins erfolgen über die Plugin-Verwaltung des Hosts oder durch erneute Ausführung des Installationsbefehls.

## Plugin-Konfiguration

Das Plugin folgt den Standard-DSH-Bundle-Konventionen:
> **Seitenleiste → Plugins → Klick auf `Skills Manager`** (`plugins.bundle.config`).

Verfügbare Optionen:

### 1. Seitenleisteneintrag (`sidebarEntry`)
- **Standard**: Deaktiviert (`false`)
- **Beschreibung**: Zeigt ein dauerhaftes **Skills**-Navigationssymbol direkt unter **Plugins** in der primären Seitenleiste an.
- **Wirkung**: Öffnet den Manager direkt im Hauptarbeitsbereich in einem zentrierten 960px-Container.


## Bedienungsanleitung

| Aktion | Durchführung |
| --- | --- |
| **Skills suchen** | Zwischen Globalen und Projekt-Tabs wechseln, Quellen ein-/ausklappen oder Suche und Filter nutzen. |
| **Details anzeigen** | Auf «Details anzeigen» klicken, um `SKILL.md` im 760px-Modal mit Ein-Klick-Kopie zu lesen. |
| **Aktivieren / Deaktivieren** | Schalter in der Zeile umlegen; ändert nur den Aufrufstatus in DSH. |
| **Quellordner ändern** | Im ➕-Menü «Quellordner…» wählen, um externe Pfade sicher umzuleiten. |
| **Kategorien verwalten** | Kategorien erstellen und Skills per Drag & Drop (`⋮⋮`) anordnen. |
| **Erstellen & Importieren** | Über das ➕-Menü neue Skills anlegen oder ZIP/Ordner importieren. |
| **Entdecken & Installieren** | Im Tab «Entdecken» ClawHub oder GitHub-Repositories durchstöbern. |
| **Skills aktualisieren** | Diff-Vorschau vor dem Update prüfen, automatische Sicherung nutzen. |
| **Wiederherstellen** | Zurückrollen auf Vorversionen dank gespeicherter Backups. |
| **Papierkorb** | Gelöschte DSH-Skills jederzeit wiederherstellen oder endgültig entfernen. |

### Repository- und Installationsgrenzen

- **Aktualisieren**: «Aktualisieren» prüft lediglich den Stand abonnierter Skill-Repositories und überschreibt keine lokalen Daten. Plugin-Updates laufen über das Host-Plugin-Management.
- **Ziele**: Installationen können auf globale DSH-Skills, Shared Agent (`~/.agents/skills`) oder das Projektverzeichnis `.dsh/skills` erfolgen.
- **Selektiver Git-Download**: Es werden nur Ordner mit `SKILL.md` geladen.

## Unterstützte Agent-Verzeichnisse

| Agent | Globales Verzeichnis | Umgebungsvariable | Projektverzeichnis |
| --- | --- | --- | --- |
| **DeepSeek Harness** | `~/.dsh/skills` | — | `.dsh/skills` |
| **Shared Agent** | `~/.agents/skills` | `DSH_AGENTS_HOME` | `.agents/skills` |
| **Codex** | `~/.codex/skills` | `CODEX_HOME` | `.codex/skills` |
| **Claude Code** | `~/.claude/skills` | `CLAUDE_HOME` | `.claude/skills` |
| **GitHub Copilot** | `~/.copilot/skills` | `COPILOT_HOME` | `.copilot/skills` |
| **Cursor** | `~/.cursor/skills` | `CURSOR_HOME` | `.cursor/skills` |
| **Google Antigravity** | `~/.gemini/skills` | `GEMINI_HOME` | `.gemini/skills` |
| **Windsurf** | `~/.windsurf/skills` | `WINDSURF_HOME` | `.windsurf/skills` |
| **Qoder** | `~/.qoder/skills` | `QODER_HOME` | `.qoder/skills` |
| **Trae** | `~/.trae/skills` | `TRAE_HOME` | `.trae/skills` |

### Benutzerdefinierte Quellen

Für nicht aufgeführte Agents können Sie im ➕-Menü über «Quellordner…» eigene Pfade registrieren.

### Agent-Voreinstellungen (Agent Presets)

Skills Manager erkennt automatisch Agent-Voreinstellungen in DSH mit eigenen Skill-Ordnern und zeigt sie am Ende der globalen Liste an:
- **Offizielle Voreinstellungen** (z. B. Creator Mode): Mitgelieferte Skills bleiben strikt schreibgeschützt ohne irreführende Umschalter;
- **Benutzerdefinierte Voreinstellungen**: Ihre eigenen Presets mit `customSkillDirs` unterstützen das vollständige Skill-Lifecycle-Management — direktes Erstellen, Importieren und Installieren aus Repositories, Verschieben in den Papierkorb sowie Wiederherstellen. Pfade, die sich mit globalen Verzeichnissen überschneiden, werden sicher blockiert.

## DSH Produkt-Ökosystem

| Plugin | Beschreibung |
| --- | --- |
| **[dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager)** | Einheitliche Skill-Verwaltung mit Backup- und GitHub-Unterstützung. |
| **[dsh-im-connect](https://github.com/MichengAI/dsh-im-connect)** | Anbindung an Feishu, DingTalk, WeChat, Telegram, Slack und Discord. |
| **[dsh-codex-ui](https://github.com/MichengAI/dsh-codex-ui)** | Elegantes Desktop-Theme für DSH. |

## Feedback und Beiträge

- Problem melden: [GitHub Issues](https://github.com/MichengAI/dsh-skills-manager/issues)
- Pull Requests sind herzlich willkommen.

## Lizenz

[Apache-2.0](LICENSE) © MichengAI
