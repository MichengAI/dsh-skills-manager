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

## Installation

Dans une conversation DSH :
```text
Installe le plugin @michengai/dsh-skills-manager
```

Ou manuellement via le terminal :
```bash
dsh plugin add @michengai/dsh-skills-manager
```

## Licence

[Apache-2.0](LICENSE) © MichengAI
