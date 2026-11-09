<p align="center">
  <img src="assets/branding/dsh-banner-en.webp" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **Gérez les skills locaux et de projet de manière unifiée, installez depuis GitHub, prévisualisez les mises à jour et restaurez les sauvegardes**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [Journal des modifications](CHANGELOG.md) · [Licence](LICENSE)

  [![Licence : Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm téléchargements](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![Compatible jusqu'à DSH 0.2.2-rc.1](https://img.shields.io/badge/DSH-up%20to%200.2.2--rc.1-2563eb.svg)](#installation)
</div>

> DSH Skills Manager est un plugin DeepSeek Harness (DSH) maintenu par la communauté et n'est pas un produit officiel de DeepSeek AI.

## Fonctionnalités

Rassemblez tous vos skills locaux et de projet dans DSH sans avoir à basculer constamment entre les dossiers d'agents.

- **Gestion multi-vues unifiée** : Onglets Skills globaux, Skills de projet, Découvrir et Corbeille avec recherche instantanée et filtres d'état.
- **Navigation par dépôt source** : Basculez entre vue répertoire et vue dépôt avec détection automatique de la provenance.
- **Large compatibilité de l'écosystème** : Prise en charge de 20+ outils et environnements CLI (DSH, Shared Agent, Codex, Claude Code, Copilot, Cursor, Google Antigravity, Windsurf, Qoder, Trae).
- **Catégorisation et glisser-déposer** : Créez des catégories personnalisées, organisez vos skills à l'aide des poignées de glisser-déposer (`⋮⋮`) et activez/désactivez des catégories entières.
- **Marchés publics et dépôts GitHub** : Hub « Découvrir » intégré pour explorer ClawHub et skills.sh ou synchroniser des dépôts GitHub publics avec sauvegardes automatiques.
- **Création et importation flexible** : Créez de nouveaux skills ou importez des archives ZIP, des dossiers et des fichiers `SKILL.md`.
- **Lecture grand écran** : Fenêtre modale responsive de 760px avec coloration syntaxique et copie du contenu Markdown en un clic.
- **Corbeille et restauration sécurisée** : Les skills DSH supprimés sont d'abord placés dans la corbeille avec historique complet conservé.
- **Dossiers sources personnalisés** : Pointez des sources d'agents externes vers d'autres chemins sans déplacer les fichiers physiques.

## Captures d'écran

Vue de gestion des skills globaux :

![Vue de gestion des skills globaux](assets/screenshots/skills-manager-v2-preview.webp)

Vue des skills de projet (par espace de travail) :

![Vue des skills de projet](assets/screenshots/skills-manager-project-scope-preview.webp)

## Installation

### Demander à un agent de l'installer

Dans une conversation DSH, demandez simplement à l'agent :

```text
Installe le plugin @michengai/dsh-skills-manager
```

### Installation manuelle

Exécutez dans votre terminal :

```bash
dsh plugin add @michengai/dsh-skills-manager
```

En environnement Windows PowerShell :

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
```

Redémarrez DSH, rafraîchissez la page et ouvrez **Paramètres → Skills**. Pour mettre à jour le plugin, utilisez le gestionnaire de plugins de l'hôte ou relancez la commande d'installation.

## Configuration du plugin

Le plugin respecte les conventions standards de configuration de bundles DSH :
> **Barre latérale → Plugins → Cliquez sur `Skills Manager`** (`plugins.bundle.config`).

Options disponibles :

### 1. Entrée dans la barre latérale (`sidebarEntry`)
- **Par défaut** : Désactivé (`false`)
- **Description** : Affiche une icône permanente **Skills** directement sous **Plugins** dans la barre latérale principale de l'hôte.
- **Effet** : Ouvre le gestionnaire dans un conteneur centré de 960px dans l'espace de travail principal.

## Guide d'utilisation

| Action | Procédure |
| --- | --- |
| **Trouver des skills** | Basculez entre les onglets Globaux et Projet, développez/réduisez les sources ou utilisez la recherche. |
| **Consulter les détails** | Cliquez sur « Voir les détails » sur une ligne pour lire le fichier `SKILL.md` avec option de copie. |
| **Activer / Désactiver** | Basculez l'interrupteur à droite de la ligne pour modifier l'état d'invocation dans DSH. |
| **Changer de dossier source** | Utilisez le menu ➕ pour modifier le répertoire de lecture des agents externes. |
| **Gérer les catégories** | Créez des catégories et glissez-déposez (`⋮⋮`) pour réorganiser les skills. |
| **Créer et importer** | Utilisez le menu ➕ pour créer un skill ou importer des fichiers ZIP et dossiers. |
| **Découvrir et installer** | Parcourez l'onglet Découvrir pour explorer ClawHub ou des dépôts GitHub. |
| **Mettre à jour** | Prévisualisez les différences avant d'appliquer une mise à jour avec sauvegarde. |
| **Restaurer** | Revenez à une version précédente à l'aide de l'historique de sauvegarde. |
| **Corbeille** | Restaurez ou supprimez définitivement des skills supprimés. |

### Répertoires d'agents pris en charge

| Agent | Répertoire global | Variable d'environnement | Répertoire de projet |
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

## Écosystème DSH

| Plugin | Description |
| --- | --- |
| **[dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager)** | Gestion unifiée des skills locaux et de projets avec sauvegardes et intégration GitHub. |
| **[dsh-im-connect](https://github.com/MichengAI/dsh-im-connect)** | Intégration de messageries d'entreprise (Feishu, DingTalk, WeChat, Telegram, Slack). |
| **[dsh-codex-ui](https://github.com/MichengAI/dsh-codex-ui)** | Thème d'interface raffiné pour le client de bureau DSH. |

## Licence

[Apache-2.0](LICENSE) © MichengAI
