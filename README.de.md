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

## Installation

In einer DSH-Konversation:
```text
Installiere das Plugin @michengai/dsh-skills-manager
```

Oder manuell im Terminal:
```bash
dsh plugin add @michengai/dsh-skills-manager
```

## Lizenz

[Apache-2.0](LICENSE) © MichengAI
