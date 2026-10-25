# Prompt Forge v0.10.1 - Windows x64

Prompt Forge 是一款本地优先的提示词优化桌面应用。本版本以 Windows 10/11
x64 为发布目标，源码基于 Tauri 2、React、TypeScript、Rust 和本地 SQLite。

## Release 资产

- `PromptForge-0.10.1-Windows-x64.zip`
- ZIP 内包含 NSIS 安装版、便携版、安装说明和内部 SHA256 校验文件。

## 安装

1. 下载并解压 `PromptForge-0.10.1-Windows-x64.zip`。
2. 推荐打开“安装版”，双击
   `Prompt Forge_0.10.1_x64-setup.exe`。
3. 如使用便携版，保持 `Prompt Forge.exe` 与
   `WebView2Loader.dll` 在同一目录。

系统要求：Windows 10/11 x64 和 Microsoft Edge WebView2 Runtime。

## 主要变化

- 优化 Tauri 原生窗口、HTML 启动层和持久化主题的启动顺序，减少首帧颜色跳变。
- 延续多轮提示词澄清、结果迭代、项目交互上下文和摘要能力。
- 支持项目交互提炼提示词模板，以及带章节和变量的可复用模板。
- 支持图片和文档附件；附件具有数量、大小、格式和提取文本长度限制。

## 验证状态

- 前端生产构建通过。
- Rust 测试已有通过记录；最终发布前应由 CI 或干净环境重新确认。
- Windows 安装、启动和卸载烟雾测试已有通过记录。
- 尚未使用真实 API Key 完成云服务联网模型调用；模型交互主要以模拟接口验证。
- 仅完成 Windows 实机验证；macOS/Linux 仅有源码兼容与 CI 构建覆盖，不提供已验证的安装包。

## 隐私与数据

- API Key 由 Windows Credential Manager、macOS Keychain 或 Linux Secret Service 保存。
- SQLite 数据库位于 `%APPDATA%\com.promptforge.desktop\prompt-forge.sqlite3`。
- WebView 主题与本地配置位于 `%LOCALAPPDATA%\com.promptforge.desktop`。
- 卸载应用不会自动删除数据库、WebView 数据或系统凭据；如需彻底清除，请先在应用内清除 Key 和历史，再手动删除相关数据。
- 模型调用期间，用户选择的提示词、项目上下文和附件内容会发送到用户配置的模型 endpoint。
- Token 费用由用户与模型服务商结算，本应用不提供 API Key 或额度。

## Windows SmartScreen

本安装包未使用商业 Authenticode 代码签名。Windows SmartScreen 可能显示
“未知发布者”。请只从本仓库的 Releases 页面下载，并使用附带的
`SHA256SUMS.txt` 核对文件。若组织策略禁止未签名软件，请等待签名版本或自行
从源码构建。

## 第三方名称、知识产权与平台政策

Prompt Forge 是独立项目，与 OpenAI、DeepSeek、Anthropic、Claude、Ollama
及其关联主体不存在官方关联、认证或赞助关系。相关产品名称和商标归各自权利人
所有。

下载使用者应自行核查其输入内容、内置或导出模板、第三方名称、品牌、真实人物、
受版权保护素材及目标平台政策所涉及的授权、商标权、肖像权和再分发许可。出现
第三方名称不构成自动禁止使用，但不应暗示官方授权或合作关系。

## 许可证

Project code and documentation authored for Prompt Forge are licensed under
the Apache License 2.0. Third-party packages remain under their respective
licenses. See the repository's `LICENSE`, `NOTICE`, and
`THIRD-PARTY-NOTICES.md`.

The application uses Lucide interface icons under the ISC License. The release
notices cover frontend production dependencies and the complete locked Rust
dependency graph, including target-specific transitive dependencies.

The Apache-2.0 license does not grant trademark rights. Open-source materials
and project assets remain subject to the provenance and authorization checks
described in `ASSET_PROVENANCE.md`.

## 已知限制

- 真实云模型服务仍需使用用户自己的低额度 Key 完成联网验证。
- macOS/Linux 的构建通过不等同于安装、运行、系统凭据和卸载行为已验证。
- 扫描版 PDF 没有文字层时需要先使用 OCR。
- 当前安装包未签名，SmartScreen 信誉不能通过 SHA-256 校验替代。

## 校验

外部校验文件：`SHA256SUMS.txt`

```text
5afef73743eceaceaf5d0262d5e80a40439c3fa5853b18cc0f51f8e6fd5208a1  PromptForge-0.10.1-Windows-x64.zip
```
