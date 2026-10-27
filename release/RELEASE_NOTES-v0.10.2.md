# Prompt Forge v0.10.2 - Windows x64

## 数据目录

- 新增可配置的数据存储位置。
- Windows 上优先使用 `D:\PromptForge-Data` 作为托管数据根目录；不可用时回退到原有 AppData 目录。
- SQLite、WAL/SHM、WebView 配置统一存入数据根目录。
- 旧版数据在首次启动时自动迁移，逐文件校验成功后清理源文件。
- 可在 `设置 → 数据位置` 更改目录，重启后生效。

## 安全

- 远程模型 Base URL 必须使用 HTTPS。
- 明文 HTTP 仅允许本机 loopback 地址。
- 拒绝带用户名、密码、query 或 fragment 的 Base URL。
- API Key 仍由系统凭据库保存，不随文件迁移。

## 提示词生成

- 项目设定和手动背景会合并、去重后一起提供给模型。
- 背景已明确且与任务匹配的角色、专业领域或技术栈会被复用，不再机械重复角色声明。
- 最终结果区单独显示一行角色判断理由，该理由不进入提示词正文。
- 背景为空、与任务无关或超过长度上限时，回退到常规角色设定。
- 该能力默认开启，可在“模型连接”设置中关闭。

## 验证边界

- Windows 安装和升级场景需要在本版本构建后重新执行实机验证。
- macOS/Linux 仍需分别验证 WebView 数据目录行为和系统凭据。
- 尚未使用真实云服务 API Key 完成联网调用验证。

## 许可证

Source code and documentation authored for Prompt Forge are licensed under
the Apache License 2.0. See `LICENSE`, `NOTICE`, and
`THIRD-PARTY-NOTICES.md`.
