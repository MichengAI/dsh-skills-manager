<p align="center">
  <img src="assets/branding/dsh-banner-en.webp" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **Единое управление локальными и проектными навыками, установка из GitHub, предварительный просмотр обновлений и восстановление резервных копий**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [История изменений](CHANGELOG.md) · [Лицензия](LICENSE)

  [![Лицензия: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm скачивания](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![Поддерживается до DSH 0.2.2-rc.1](https://img.shields.io/badge/DSH-up%20to%200.2.2--rc.1-2563eb.svg)](#установка)
</div>

> DSH Skills Manager — это плагин для DeepSeek Harness (DSH), поддерживаемый сообществом, и не является официальным продуктом DeepSeek AI.

## Возможности

Объедините локальные и проектные навыки в одном месте в DSH без необходимости переключаться между каталогами различных агентов.

- **Единое мультипанельное управление**: Вкладки «Глобальные навыки», «Навыки проекта», «Обзор» и «Корзина» со мгновенным поиском и фильтрацией.
- **Просмотр по исходным репозиториям**: Переключение между структурой папок и репозиториями с точным определением источника.
- **Широкая совместимость с экосистемой**: Поддержка более 20 инструментов и CLI-сред (DSH, Shared Agent, Codex, Claude Code, Copilot, Cursor, Google Antigravity, Windsurf, Qoder, Trae).
- **Категории и Drag & Drop**: Создание категорий, перемещение карточек навыков перетаскиванием (`⋮⋮`) и включение/отключение целых категорий одним переключателем.
- **Каталоги и репозитории GitHub**: Встроенный центр обзора для поиска навыков в ClawHub и skills.sh, а также синхронизация с GitHub с автоматическим резервным копированием.
- **Создание и удобный импорт**: Создание новых навыков или импорт ZIP-архивов, папок и файлов `SKILL.md`.
- **Широкоформатный просмотр**: Адаптивное модальное окно 760px с подсветкой синтаксиса и копированием Markdown в один клик.
- **Корзина и безопасное восстановление**: Удаленные навыки DSH отправляются в корзину и могут быть полностью восстановлены в любое время.

## Установка

В диалоге с агентом DSH:
```text
Установи плагин @michengai/dsh-skills-manager
```

Либо вручную в терминале:
```bash
dsh plugin add @michengai/dsh-skills-manager
```

## Лицензия

[Apache-2.0](LICENSE) © MichengAI
