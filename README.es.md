<p align="center">
  <img src="assets/branding/dsh-banner-en.webp" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **Administra skills locales y de proyectos de forma unificada, instala desde GitHub, previsualiza actualizaciones y restaura copias de seguridad**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [Registro de cambios](CHANGELOG.md) · [Licencia](LICENSE)

  [![Licencia: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm descargas](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![Compatible hasta DSH 0.2.2-rc.1](https://img.shields.io/badge/DSH-up%20to%200.2.2--rc.1-2563eb.svg)](#instalación)
</div>

> DSH Skills Manager es un complemento de DeepSeek Harness (DSH) mantenido por la comunidad y no es un producto oficial de DeepSeek AI.

## Características

Reúne tus skills locales y de proyectos en DSH sin tener que cambiar constantemente entre carpetas de diferentes agentes.

- **Gestión unificada multivisualización**: Explora Skills globales, Skills del proyecto, Descubrir y Papelera con búsqueda instantánea, filtrado de estado y grupos de origen plegables.
- **Navegación por repositorio de origen**: Cambia entre la vista de carpetas y la de repositorios. Las fuentes se reconocen mediante registros de instalación, archivos de bloqueo y metadatos.
- **Amplia compatibilidad del ecosistema**: Soporte completo para más de 20 herramientas y entornos CLI, incluyendo DSH, Shared Agent, Codex, Claude Code, Copilot, Cursor, Google Antigravity, Windsurf, Qoder y Trae.
- **Categorías y arrastrar y soltar**: Crea carpetas de categorías dentro de las fuentes, arrastra las tarjetas de skills (`⋮⋮`) para organizarlas y activa o desactiva categorías completas con un solo interruptor.
- **Mercados públicos y suscripciones de repositorios**: Centro «Descubrir» integrado para explorar tendencias de ClawHub y skills.sh, o suscribirse a repositorios públicos de GitHub con vista previa de diferencias (diff) y copias de seguridad.
- **Creación e importación flexible**: Crea nuevos skills o importa archivos ZIP, carpetas y archivos `SKILL.md` directamente en tu carpeta de usuario global o en proyectos registrados.
- **Lectura en pantalla ancha**: Ventana modal adaptable de 760px con resaltado de código monoespaciado y copia de contenido en un clic.
- **Papelera y recuperación segura**: Los skills eliminados de DSH pasan primero a la papelera, permitiendo su restauración completa con historial intacto.
- **Carpetas de origen personalizadas**: Apunta fuentes de agentes externos a otras rutas sin mover archivos físicos.

## Instalación

### Solicitar a un agente que lo instale

En una conversación de DSH, indica al agente:

```text
Instala el plugin @michengai/dsh-skills-manager
```

### Instalación manual

Ejecuta en tu terminal:

```bash
dsh plugin add @michengai/dsh-skills-manager
```

## Configuración del complemento

Sigue las convenciones estándar de configuración de DSH:
> **Barra lateral → Plugins → Clic en `Skills Manager`** (`plugins.bundle.config`).

### 1. Entrada en la barra lateral (`sidebarEntry`)
- **Predeterminado**: Desactivado (`false`)
- **Descripción**: Muestra un icono permanente de **Skills** directamente debajo de **Plugins** en la barra lateral principal izquierda.
- **Efecto**: Abre el administrador en un contenedor centrado de 960px en el espacio de trabajo principal.

## Licencia

[Apache-2.0](LICENSE) © MichengAI
