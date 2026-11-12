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
  [![Compatible hasta DSH 0.2.2-rc.2](https://img.shields.io/badge/DSH-up%20to%200.2.2--rc.2-2563eb.svg)](#instalación)
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

## Capturas de pantalla

Vista de gestión de skills globales:

![Vista de gestión de skills globales](assets/screenshots/skills-manager-v2-preview.webp)

Vista de skills de proyecto (por espacio de trabajo):

![Vista de skills de proyecto](assets/screenshots/skills-manager-project-scope-preview.webp)

## Instalación

### Solicitar a un agente que lo instale

En una conversación de DSH, indica al agente:

```text
Instala el plugin @michengai/dsh-skills-manager
```

El agente resolverá dependencias e instalará la versión más reciente automáticamente.

### Instalación manual

Ejecuta en tu terminal:

```bash
dsh plugin add @michengai/dsh-skills-manager
```

En entornos Windows PowerShell:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
```

Reinicia DSH, recarga la página y accede a **Ajustes → Skills**. Para actualizar el plugin, hazlo desde la gestión de plugins del host o vuelve a ejecutar el comando de instalación.

## Configuración del complemento

Sigue las convenciones estándar de configuración de DSH:
> **Barra lateral → Plugins → Clic en `Skills Manager`** (`plugins.bundle.config`).

Opciones de configuración disponibles:

### 1. Entrada en la barra lateral (`sidebarEntry`)
- **Predeterminado**: Desactivado (`false`)
- **Descripción**: Muestra un icono permanente de **Skills** directamente debajo de **Plugins** en la barra lateral principal izquierda.
- **Efecto**: Abre el administrador en un contenedor centrado de 960px en el espacio de trabajo principal sin restricciones de scroll.


## Guía de uso

| Acción | Cómo realizarla |
| --- | --- |
| **Buscar skills** | Alterna entre las pestañas Globales y Proyecto, expande/contrae grupos de fuentes o usa la barra de búsqueda y filtros. |
| **Ver detalles** | Haz clic en «Ver detalles» en cualquier fila para inspeccionar el archivo `SKILL.md` en el modal de 760px con «Copiar contenido». |
| **Activar / Desactivar** | Cambia el interruptor en la fila del skill; solo modifica el estado dentro de DSH sin alterar archivos externos. |
| **Cambiar carpeta de origen** | Haz clic en el menú ➕ en «Carpetas de origen…» para redirigir la lectura de skills externos. |
| **Organizar categorías** | Crea categorías y arrastra filas (`⋮⋮`) para ordenar y agrupar skills. |
| **Crear e importar** | Usa las opciones del menú ➕ para crear skills o importar archivos ZIP y carpetas. |
| **Descubrir e instalar** | Cambia a la pestaña «Descubrir» para explorar ClawHub o suscribirte a repositorios de GitHub. |
| **Actualizar skills** | Haz clic en «Actualizar» para previsualizar diferencias y crear copias de seguridad automáticas. |
| **Restaurar versiones** | Usa «Restaurar versión anterior» para volver a un estado previo con respaldo. |
| **Papelera** | Recupera o elimina definitivamente skills de DSH en la papelera integrada. |

### Navegación por repositorio de origen

El listado permite alternar entre vista por directorios y vista por repositorios, reconociendo la procedencia de cada skill.

### Cuatro pestañas principales

- **Skills globales (`scope: "user"`)**: Disponibles en todos los proyectos desde tu directorio de usuario.
- **Skills del proyecto (`scope: "project"`)**: Específicos para cada espacio de trabajo registrado.
- **Descubrir (`scope: "discover"`)**: Catálogo público y suscripción a repositorios de GitHub.
- **Papelera (`scope: "trash"`)**: Almacén seguro para skills eliminados de DSH.

### Requisitos de formato y Frontmatter

- **Formato de nombre**: Letras minúsculas, números y guiones (ej. `code-review-helper`).
- **Archivo `SKILL.md`**: Debe contener encabezado YAML con `name` y `description`.

```markdown
---
name: code-review-helper
description: Ayuda para revisar código de forma sistemática
---

# Instrucciones
...
```

### Límites de repositorios e instalación

- **Refrescar repositorio**: La acción «Refrescar» en la lista de repositorios solo comprueba si hay nuevas versiones de los skills suscritos y no sobreescribe archivos locales. Para actualizar el plugin en sí, utiliza la gestión de plugins del host.
- **Destinos seguros**: La instalación de repositorios puede dirigirse a los skills de usuario de DSH, Shared Agent (`~/.agents/skills`) o al espacio de trabajo `.dsh/skills`.
- **Descarga selectiva Git**: Solo se descargan los directorios que contienen `SKILL.md`.

## Directorios de agentes compatibles

| Agente | Directorio global | Variable de entorno | Directorio de proyecto |
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

### Fuentes personalizadas

Si usas un agente que no figure en la lista anterior, puedes registrarlo mediante el menú ➕ seleccionando «Carpetas de origen…».

### Preajustes de Agente (Agent Presets)

Skills Manager detecta automáticamente los preajustes de agente configurados en DSH con directorios dedicados y los muestra al final de la lista global:
- **Preajustes oficiales integrados** (como Modo Creador): las habilidades integradas son de solo lectura para consulta e inspección, sin interruptores engañosos;
- **Preajustes personalizados**: tus propios preajustes con `customSkillDirs` ofrecen paridad completa con los skills globales — activar o desactivar skills o el origen completo, organizar categorías y notas, creación, importación, instalación y desinstalación desde repositorios, envío a la Papelera y restauración en su carpeta original. Las rutas que se solapan con directorios globales se bloquean de forma segura, y las rutas relativas permanecen de solo lectura por seguridad (usa una ruta absoluta para habilitar la gestión completa).

## Ecosistema de productos DSH

| Plugin | Descripción |
| --- | --- |
| **[dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager)** | Gestión unificada de skills locales y de proyectos con respaldo y GitHub. |
| **[dsh-im-connect](https://github.com/MichengAI/dsh-im-connect)** | Conecta DSH a Feishu, DingTalk, WeChat, QQ, Telegram, Discord y Slack. |
| **[dsh-codex-ui](https://github.com/MichengAI/dsh-codex-ui)** | Tema de interfaz refinado para el cliente de escritorio DSH. |

## Comentarios y contribuciones

- Informar problemas: [GitHub Issues](https://github.com/MichengAI/dsh-skills-manager/issues)
- Las solicitudes de extracción (Pull Requests) son bienvenidas.

## Licencia

[Apache-2.0](LICENSE) © MichengAI
