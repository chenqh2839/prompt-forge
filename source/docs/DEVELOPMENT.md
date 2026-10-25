# 开发与发布指引

## 1. 依赖

通用依赖：

- Node.js 24 或更高版本（`pdfjs-dist` 6 的构建环境要求）
- pnpm 10 或更高版本
- Rust stable
- Tauri 2 CLI（项目 devDependency 已包含）
- `pdfjs-dist`：本地解析 PDF 文本，仅在选择 PDF 时动态加载
- `mammoth`：本地提取 DOCX 正文，仅在选择 Word 文件时动态加载

Windows：

- Microsoft C++ Build Tools
- 工作负载 `Desktop development with C++`
- Windows 10/11 SDK
- WebView2 Runtime

macOS：

- Xcode Command Line Tools

Ubuntu/Debian：

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl wget file \
  libxdo-dev libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libdbus-1-dev libsecret-1-dev
```

## 2. 首次安装

```powershell
pnpm install
```

开发运行：

```powershell
pnpm desktop:dev
```

只运行前端：

```powershell
pnpm dev
```

注意：前端浏览器模式无法使用 Tauri 命令，模型配置、历史和生成功能需在桌面窗口中运行。

## 3. 检查

```powershell
pnpm build
Set-Location src-tauri
cargo test
cargo check
```

## 4. Windows 安装包

```powershell
pnpm desktop:build
```

Tauri 会执行：

1. `tsc -b && vite build`
2. Rust release 编译
3. NSIS 安装包打包

输出目录：

```text
src-tauri/target/release/bundle/nsis/
```

当前安装范围为当前用户，不要求管理员权限。安装包默认使用 WebView2 下载引导模式。

## 5. API 配置

### OpenAI

- Base URL：`https://api.openai.com/v1`
- 模型：填写账号可用的模型 ID
- API Key：在设置页录入

### DeepSeek

- Base URL：`https://api.deepseek.com/v1`
- 模型：填写平台提供的模型 ID
- API Key：在设置页录入

### Claude 兼容网关

Claude 原生 API 的请求结构与 OpenAI Chat Completions 不同。本应用中的“Claude 兼容网关”指由用户提供、暴露 OpenAI 兼容 `/chat/completions` 的网关。

- Base URL：网关提供的 `/v1` 地址
- 模型：网关映射后的模型 ID

### Ollama

- Base URL：`http://localhost:11434/v1`
- 模型：本地已拉取的模型 ID
- API Key：通常可留空

## 6. 凭据与数据

应用标识为 `com.promptforge.desktop`：

- Keyring service：`com.promptforge.desktop`
- Keyring account：`api-key:<provider>`
- SQLite 文件：`prompt-forge.sqlite3`

卸载应用不会自动删除系统凭据或应用数据。如需彻底清除，可在应用内删除 Key、清空历史，再手动删除应用数据目录。

## 7. 三端构建

`.github/workflows/build.yml` 提供三端矩阵：

- `windows-latest`：NSIS
- `macos-latest`：DMG / App
- `ubuntu-22.04`：AppImage / DEB

首次在目标平台构建前，请安装对应系统依赖。由于签名证书不属于源码提交内容，发布版签名需在 CI Secrets 或本机环境中单独配置。

## 8. Token 成本

每次“开始分析”或“提交本轮回答”会发起一次模型请求，每次“重新生成”也会发起一次。历史通常随轮次增长，因此后续请求的输入 Token 会逐步增加。建议：

- 首轮只输入必要背景，不要把大量无关材料塞入原始提示词。
- 当信息已足够时直接生成，避免无意义的追加轮次。
- 在模型服务商控制台设置用量提醒或预算上限。
- 图片会显著增加多模态请求的输入 Token；文档附件也会重复计入每轮上下文。
- PDF 扫描件没有文字层时需先 OCR，本应用不会把空白提取结果发送给模型。
