<p align="center">
  <img src="assets/branding/dsh-banner-en.webp" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **Gerencie skills locais e de projeto de forma unificada, instale do GitHub, visualize atualizações e restaure backups**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [Notas de versão](CHANGELOG.md) · [Licença](LICENSE)

  [![Licença: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm downloads](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![Compatível até DSH 0.2.2-rc.1](https://img.shields.io/badge/DSH-up%20to%200.2.2--rc.1-2563eb.svg)](#instalação)
</div>

> DSH Skills Manager é um plugin do DeepSeek Harness (DSH) mantido pela comunidade e não é um produto oficial da DeepSeek AI.

## Funcionalidades

Centralize suas skills locais e de projeto no DSH sem precisar alternar entre pastas de diferentes agentes.

- **Gerenciamento unificado multiview**: Abas de Skills Globais, Skills do Projeto, Descobrir e Lixeira com busca instantânea e filtros de status.
- **Navegação por repositório de origem**: Alterne entre a exibição de pastas e de repositórios com identificação precisa da procedência.
- **Ampla compatibilidade com o ecossistema**: Suporte a mais de 20 ferramentas e ambientes CLI (DSH, Shared Agent, Codex, Claude Code, Copilot, Cursor, Google Antigravity, Windsurf, Qoder, Trae).
- **Categorização e arrastar e soltar**: Crie pastas de categorias, organize skills arrastando (`⋮⋮`) e ative/desative categorias inteiras com um único interruptor.
- **Mercados públicos e repositórios GitHub**: Central «Descobrir» integrada para explorar ClawHub e skills.sh, ou assinar repositórios GitHub públicos com backups automáticos.
- **Criação e importação flexível**: Crie novas skills ou importe arquivos ZIP, pastas e arquivos `SKILL.md`.
- **Visualização em tela ampla**: Janela modal responsiva de 760px com destaque de sintaxe e cópia do Markdown em um clique.
- **Lixeira e restauração segura**: Skills removidas vão primeiro para a lixeira, permitindo restauração completa a qualquer momento.

## Instalação

Em uma conversa do DSH:
```text
Instale o plugin @michengai/dsh-skills-manager
```

Ou manualmente pelo terminal:
```bash
dsh plugin add @michengai/dsh-skills-manager
```

## Licença

[Apache-2.0](LICENSE) © MichengAI
