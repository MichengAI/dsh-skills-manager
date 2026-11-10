<p align="center">
  <img src="assets/branding/dsh-banner-en.webp" alt="DSH Skills Manager" width="100%">
</p>

<div align="center">

# DSH Skills Manager

  **ローカルおよびプロジェクトのスキルを一元管理、GitHub からのインストール、更新プレビュー、バックアップ復元に対応**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [更新履歴](CHANGELOG.md) · [ライセンス](LICENSE)

  [![ライセンス: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-skills-manager.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![npm ダウンロード数](https://img.shields.io/npm/dt/%40michengai%2Fdsh-skills-manager.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-skills-manager)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-skills-manager)
  [![DSH 対応バージョン 0.2.2-rc.1](https://img.shields.io/badge/DSH-up%20to%200.2.2--rc.1-2563eb.svg)](#インストール)
</div>

> DSH Skills Manager はコミュニティによって保守されている DeepSeek Harness (DSH) プラグインであり、DeepSeek AI の公式製品ではありません。

## 機能概要

PC やプロジェクト内に分散しているスキルを DSH に集約し、複数のエージェントフォルダを行き来する手間を省きます。

- **統合マルチビュー管理**：「グローバルスキル」「プロジェクトスキル」「発見」「ゴミ箱」の4つのタブを提供。インクリメンタル検索、呼び出し状態フィルタリング、折りたたみ可能なソースグループを完備。
- **リポジトリ別ブラウズ**：ディレクトリビューとリポジトリビューをワンクリックで切り替え。インストール履歴、ロックファイル、スキルメタデータからソースを正確に識別。
- **幅広いエコシステム互換性**：DSH、Shared Agent、Codex、Claude Code、Copilot、Cursor、Google Antigravity、Windsurf、Qoder、Trae など 20 以上のツール環境をサポート。サードパーティのファイルには一切干渉しません。
- **カテゴリ分類とドラッグ＆ドロップ**：ソース内にカスタムカテゴリを作成し、ハンドル（`⋮⋮`）で直感的にドラッグ移動・並び替え。カテゴリ単位の一括有効/無効化に対応。
- **パブリックマーケットとリポジトリ購読**：統合された「発見」ハブで ClawHub や skills.sh の人気スキルを検索・プレビュー。公開 GitHub リポジトリの購読、差分確認、自動バックアップ付き更新に対応。
- **新規作成と柔軟なインポート**：新規スキルの作成、または ZIP アーカイブ・フォルダ・`SKILL.md` の直接インポート。グローバルユーザー領域またはプロジェクトワークスペースへ安全に配置。
- **ワイドスクリーン詳細表示**：760px のレスポンシブモーダル、等幅コードハイライト、ワンクリックでの Markdown 本文コピー。
- **ゴミ箱と安全なロールバック**：DSH スキルを削除してもソフトデリートとしてゴミ箱に退避され、メタデータと更新履歴を保持したまま完全復元可能。
- **カスタムソースディレクトリ**：外部エージェントの読み込みパスをパネル上で安全に変更可能（ファイルは移動せず読み取り専用を維持）。

## スクリーンショット

グローバルスキル管理画面:

![グローバルスキル管理画面](assets/screenshots/skills-manager-v2-preview.webp)

プロジェクトスキル管理画面（ワークスペース別）:

![プロジェクトスキル管理画面](assets/screenshots/skills-manager-project-scope-preview.webp)

## インストール

### エージェントに依頼してインストール

DSH 会話内でエージェントに以下のように指示してください:

```text
@michengai/dsh-skills-manager プラグインをインストールしてください
```

エージェントが自動的に最新バージョンを取得し、依存関係を検証して適用します。

### 手動インストール

DSH 設定ディレクトリまたはプロファイルディレクトリで実行します:

```bash
dsh plugin add @michengai/dsh-skills-manager
```

Windows PowerShell 環境の場合:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/
```

DSH を再起動し、ページをリロードして **設定 → スキル** を開いて使用します。プラグイン本体の更新は、宿主のプラグイン管理画面から行うか、インストールコマンドを再実行してください。

## プラグイン設定

本プラグインは標準の DSH バンドル設定仕様に準拠しています。設定場所:
> **サイドバー → プラグイン → `Skills Manager` をクリック**（ホストの `plugins.bundle.config` スロット）。

利用可能な設定項目:

### 1. サイドバーエントリ (`sidebarEntry`)
- **デフォルト**: 無効 (`false`)
- **説明**: DSH ホストの左側メインナビゲーションバーの「プラグイン」直下に「スキル」常駐アイコンを表示します。
- **効果**:
  - 有効にすると、サイドバーアイコンをクリックするだけでメインワークスペースに **960px センタリングレイアウト** でスキル管理センターを展開できます。
  - 無効にすると、サイドバーのスロットをクリーンに解放します。
  - いずれの設定でも「設定 → スキル」のエントリは常に利用可能で、両者の状態はリアルタイムに同期されます。


## 利用ガイド

| 操作 | 手順 |
| --- | --- |
| **スキルを探す** | 「グローバルスキル」または「プロジェクトスキル」タブを切り替え、ソースグループを展開/折りたたみ、または検索バーと状態フィルターを使用します。 |
| **詳細を確認** | スキル行の「詳細を見る」をクリックし、760px モーダルで `SKILL.md` の本文と診断情報を確認。「本文をコピー」も可能です。 |
| **有効/無効の切り替え** | スキル行右側のスイッチを切り替えます。DSH 内の呼び出し状態のみが変更され、外部ファイルは一切変更されません。 |
| **外部ソースフォルダの変更** | ヘッダーの ➕ メニューから「ソースディレクトリ…」を選択、またはソース行で「スキルフォルダを変更」をクリックしてパスを入力・保存します。 |
| **カテゴリの整理と並び替え** | ソース内で「新規カテゴリ」をクリックし、ハンドル（`⋮⋮`）をドラッグしてスキルを移動・並び替えます。 |
| **新規作成とインポート** | ヘッダーの ➕ メニューから「スキル作成…」または「スキルをインポート…」を選択し、保存先を指定します。 |
| **発見とインストール** | 「発見」タブに切り替え、ClawHub や skills.sh のスキルを閲覧、または「リポジトリを追加」で GitHub リポジトリを購読します。 |
| **スキルの更新** | 「更新」をクリックして差分をプレビューし、確認後にローカルバックアップを作成して更新します。 |
| **バージョン復元** | バックアップがあるスキルで「前のバージョンに戻す」をクリックし、差分を確認して復元します。 |
| **ゴミ箱と安全な削除** | 削除した DSH スキルはゴミ箱に移動し、いつでも復元または完全削除が可能です。 |

### リポジトリ別ブラウズ

スキルリストは「ソースディレクトリ別」と「リポジトリ別」を切り替え可能です。リポジトリビューでは、インストール記録、ロックファイル、スキルメタデータに基づいてソースを識別します。

### 4つのメインタブ

- **グローバルスキル (`scope: "user"`)**: ユーザーのホームディレクトリに配置された、すべてのプロジェクトで横断的に利用可能なスキル。
- **プロジェクトスキル (`scope: "project"`)**: 現在登録されているワークスペースに固有のプロジェクトスキル。
- **発見 (`scope: "discover"`)**: ClawHub、skills.sh、GitHub リポジトリからスキルを検索・インストール。
- **ゴミ箱 (`scope: "trash"`)**: 削除された DSH スキルの安全な保管場所。

### スキル命名規則と Frontmatter 要件

DSH の仕様に準拠するため、スキルは以下のルールに従う必要があります:

- **名前形式**: 小文字の英数字とハイフンのみ（例: `code-review-helper`）。
- **`SKILL.md` 要件**: フォルダ直下に `SKILL.md` が存在し、先頭に有効な YAML frontmatter（`name` と `description`）が含まれている必要があります。

```markdown
---
name: code-review-helper
description: コードの品質とセキュリティを自動レビューするスキル
---

# 手順
...
```

- **インテリジェント診断**: 英語の `name` が欠落しているスキルには明確な診断警告が表示され、安全に無効化または整理できます。

### リポジトリとインストールの境界

- リポジトリリストの **「更新」** は購読リポジトリの内容確認のみを行い、ローカルファイルを自動上書きしません。プラグイン自体の更新は宿主のプラグイン管理で行ってください。
- リポジトリからのインストールは、ユーザーの DSH skills、Shared Agent（`~/.agents/skills`）、または登録済みワークスペースの `.dsh/skills` を対象にできます。
- すべてのリポジトリは Git のオンデマンドチェックアウトを使用し、`SKILL.md` を含むディレクトリのみをダウンロードします。
- 更新前にはローカルの変更を自動検出し、ロールバック用のバックアップ履歴が保持されます。

## 対応エージェントディレクトリ

| エージェント | グローバルパス | プロジェクト相対パス |
| --- | --- | --- |
| **DeepSeek Harness** | `~/.dsh/skills` | `.dsh/skills` |
| **Shared Agent** | `~/.agents/skills` | `.agents/skills` |
| **Codex** | `~/.codex/skills` | `.codex/skills` |
| **Claude Code** | `~/.claude/skills` | `.claude/skills` |
| **GitHub Copilot** | `~/.copilot/skills` | `.copilot/skills` |
| **Cursor** | `~/.cursor/skills` | `.cursor/skills` |
| **Google Antigravity** | `~/.gemini/skills` | `.gemini/skills` |
| **Windsurf** | `~/.windsurf/skills` | `.windsurf/skills` |
| **Qoder** | `~/.qoder/skills` | `.qoder/skills` |
| **Trae** | `~/.trae/skills` | `.trae/skills` |

### カスタムソース

リストにないエージェントをお使いの場合は、ヘッダーの ➕ メニューから「ソースディレクトリ…」を選択して追加できます。

## DSH プロダクトエコシステム

| プラグイン | 説明 |
| --- | --- |
| **[dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager)** | ローカルおよびプロジェクトのスキルを一元管理、GitHub 連携・バックアップ対応。 |
| **[dsh-im-connect](https://github.com/MichengAI/dsh-im-connect)** | Feishu、DingTalk、WeChat、QQ、Telegram、Discord、Slack 連携。 |
| **[dsh-codex-ui](https://github.com/MichengAI/dsh-codex-ui)** | DSH デスクトップ向けの洗練された UI テーマ。 |

## フィードバックと貢献

- Issue 報告: [GitHub Issues](https://github.com/MichengAI/dsh-skills-manager/issues)
- プルリクエストを歓迎します。

## ライセンス

[Apache-2.0](LICENSE) © MichengAI
