# Prompt Forge v0.10.4 - Windows x64

本版本增加可选的 Codex 本机上下文接入、增量会话索引和 skill 路由建议。

## 新增

- 只读发现 Codex 项目、会话、skills 与已启用插件。
- 选择 Codex 项目后，会话列表按项目归属过滤，并显示归属置信度和来源依据。
- 流式读取 JSONL 和 Zstandard 会话文件；损坏行与未知事件类型会跳过并显示诊断。
- 使用文件大小、mtime、SHA-256 和 rollout 字节偏移增量更新索引。
- 支持会话搜索、日期筛选、归档过滤与 compaction 摘要。
- 项目归属结合 project ID、项目根路径和 cwd，并展示可解释置信度。
- 对本地召回的前 5–8 个 skills 可选模型重排；失败时自动回退本地评分。
- 角色证据与执行指导分离；上下文冲突保留双方和来源引用。
- skills 指令使用独立可移除区块，不会被当作角色背景。
- 收藏只保存项目、会话和 skill 引用，不复制正文。
- 文件监视默认关闭，仅在用户显式开启时运行，关闭后释放线程。

## 修复

- 优化结果现在同时显示用户原始提示词和带来源标记的 Codex 上下文注入正文。
- 修复 Windows 扩展路径 `\\?\D:\...` 与项目根无法匹配的问题。
- 修复 Codex global-state 旧项目 ID 与当前状态数据库项目 ID 未归一的关联问题。
- skill 指令仍位于独立可移除区块；移除后原始提示词和 Codex 上下文保持不变。

## 安全与兼容

- Codex 内容默认只读取 user/assistant 消息；reasoning、工具输出、凭据、日志和二进制默认排除。
- Prompt Forge 不启动 Codex、不写 Codex 数据库，也不执行任何 skill。
- Codex 内部格式变化会降级为可用路径并显示诊断，不会阻止普通提示词生成。
- 现有历史记录、项目关联、API Key、数据目录和导出行为保持兼容。

## 已知限制

- Codex 内部 SQLite 与 rollout 格式没有稳定 API 承诺。
- Codex skill 执行仍由 Codex 决定；Prompt Forge 只生成建议文本。
- 真实云模型调用需要用户自己的 API Key；跨平台实机行为仍需后续验证。

## 发布资产与校验

| 资产 | 大小 | SHA-256 |
|---|---:|---|
| `prompt-forge.exe` | 17,228,288 | `f95f25e1a45bb8b529dbc18263a73d09563948383c2eef254bcded87a8302ec1` |
| `Prompt.Forge_0.10.4_x64-setup.exe` | 5,197,531 | `6c9c85676ce19f72ad6ae74811cf7468a4c093bbbdadb1e816ce3f8b7f00093c` |
| `PromptForge-0.10.4-Windows-x64.zip` | 12,146,107 | `051c8718144138e52817dbcf55e5a4f66819ff42ce7008df230d0def15b29793` |

`SHA256SUMS-v0.10.4.txt` 覆盖以上三个二进制资产。
