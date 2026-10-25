# 架构与技术方案

## 1. 框架选型

选择 **Tauri 2 + React + TypeScript + Rust**。

理由：

- 安装包和运行内存显著低于 Electron。
- Rust 后端可同时承载 SQLite、系统凭据库与网络请求，形成明确的安全边界。
- Windows 优先开发，同时保留 macOS、Linux 的原生构建路径。
- React 适合实现多轮对话状态机、工作台布局和即时反馈。

代价：

- 原生层调试比纯 Node.js 稍复杂。
- 三端依赖各自的系统凭据服务与 Tauri 系统库。

## 2. 架构图

```text
┌──────────────────────────────────────────────────────────┐
│ React / TypeScript                                       │
│                                                          │
│  App 状态机 ── PromptWorkspace ── Clarification Cards   │
│      │                │                                  │
│      ├──────── ResultPanel                               │
│      ├──────── SettingsDialog                            │
│      └──────── Sidebar / History                         │
│                        │                                 │
│                  bridge.ts (invoke)                      │
└────────────────────────┼─────────────────────────────────┘
                         │ Tauri IPC
┌────────────────────────▼─────────────────────────────────┐
│ Rust commands                                             │
│                                                          │
│  settings ── keyring ── OS Credential Store               │
│     │                                                     │
│  history  ── SQLite (WAL)                                │
│     │                                                     │
│  analyze ── reqwest ── /chat/completions                 │
│     │            ├─ OpenAI                               │
│     │            ├─ DeepSeek                             │
│     │            ├─ Claude compatible gateway            │
│     │            └─ Ollama                               │
│     └─ JSON decision normalizer                          │
└──────────────────────────────────────────────────────────┘
```

## 3. 信任边界

- React 只能看到 `hasApiKey` 布尔值，永远看不到 Key 明文。
- API Key 由 Rust `keyring` 写入系统凭据服务。
- 模型请求从 Rust 发出，避免 WebView CORS 问题并减少 Key 暴露面。
- 原始提示词、模型配置、历史和导出数据默认只存在本机。
- 用户提示词作为数据处理；系统提示词明确禁止其中的指令覆盖访谈规则。
- 文件通过 WebView File API 读取，不申请任意本地路径访问权限；模型只接收文件名、提取文本或 Data URL。
- CSP 仅允许应用自身资源、内联样式和 Tauri IPC。
- PDF.js Worker 的资源来源限制为应用自身与 Blob。

## 4. 多轮状态机

```text
idle
  └─ start ─────────────► analyzing
analyzing
  ├─ complete ──────────► complete
  ├─ clarify ───────────► clarifying
  └─ error ─────────────► idle
clarifying
  ├─ submit answers ────► analyzing
  └─ error ─────────────► clarifying
complete
  ├─ regenerate ────────► generating
  ├─ new task ──────────► idle
  └─ history restore ───► complete
generating
  ├─ success ───────────► complete
  └─ error ─────────────► complete
```

前端保存 `rounds[]`，每轮包含问题、WHY 和答案。每次请求将完整问答记录发送给模型。后端再执行以下约束：

1. 每轮只接受 1–5 个问题。
2. 缺省 WHY 会补上明确解释。
3. 第五轮结束后强制进入生成。
4. 模型响应允许 Markdown 代码围栏，但内部必须解析出有效 JSON 对象。

## 5. 模型接口

请求：

```http
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json
```

核心字段为 `model`、`messages`、`temperature`、`max_tokens` 和 `stream: false`。

模型被要求返回两种 JSON 之一：

```json
{
  "action": "clarify",
  "rationale": "信息缺口说明",
  "questions": [
    {
      "id": "q1",
      "question": "具体问题",
      "why": "该问题对最终结果的影响"
    }
  ]
}
```

```json
{
  "action": "complete",
  "rationale": "信息已足够的原因",
  "questions": [],
  "optimizedPrompt": "完整专业提示词"
}
```

不依赖厂商专有的结构化输出参数，以扩大兼容范围；后端负责提取和校验 JSON。

## 6. 本地数据

SQLite 使用 WAL 模式，主要表：

```sql
settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);

history(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_prompt TEXT NOT NULL,
  template_id TEXT NOT NULL,
  optimized_prompt TEXT NOT NULL,
  transcript_json TEXT NOT NULL,
  model TEXT NOT NULL,
  project_id TEXT,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  source_history_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

projects(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  style TEXT NOT NULL,
  characters TEXT NOT NULL,
  history_context TEXT NOT NULL,
  materials TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

custom_templates(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  focus TEXT NOT NULL,
  accent TEXT NOT NULL,
  example TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

variable_templates(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  role TEXT NOT NULL,
  task TEXT NOT NULL,
  skeleton TEXT NOT NULL,
  variables_json TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  examples_json TEXT NOT NULL,
  output_format TEXT NOT NULL,
  quality_check TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  source_history_ids_json TEXT NOT NULL DEFAULT '[]',
  source_mappings_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

project_history_summaries(
  cache_key TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  history_ids_json TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  summary_version INTEGER NOT NULL,
  model TEXT NOT NULL,
  summaries_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

历史记录保留原始输入、完整问答、模板、模型和优化结果，并通过可选
`project_id` 关联项目。已有数据库启动时会自动补充该字段。项目上下文在生成
请求中以 `project_context` 传入，删除项目不会删除历史。自定义场景单独保存在
`custom_templates` 表中，删除场景不会删除历史。通用场景不注入特定领域假设；
自定义场景的 `focus` 作为领域上下文传给系统提示词，但不覆盖核心系统规则。
变量模板保存在 `variable_templates` 表中；有序章节保存在 `sections_json`，
变量定义保存在 `variables_json`。旧版固定字段保留用于迁移和兼容读取。
导出格式为带版本号的 JSON，不包含 API Key。
附件内容保存在 `attachments_json` 中，但普通历史列表只返回 `[]`；用户打开
某条历史时再通过 `get_history_attachments` 按需读取，避免启动时把大量图片
Data URL 一次性载入前端。导出历史时包含完整附件数据。

## 7. 上下文附件

```text
click / drop / paste
        ↓
Web File API（不读取任意路径）
        ├─ 图片：校验格式与大小 → Data URL 预览
        ├─ TXT / MD：File.text()
        ├─ PDF：pdfjs-dist → 逐页提取文本
        └─ DOCX：mammoth → extractRawText()
        ↓
attachments[] + 历史 attachments_json
        ↓ Tauri IPC（仅在有 API 调用时）
Rust 校验
        ├─ 文档：以 [附件内容开始] / [附件内容结束] 注入用户消息
        └─ 图片：OpenAI 兼容 image_url content part
```

限制为每次最多 6 个文件、总计 20 MB；图片单文件 6 MB，PDF 15 MB，DOCX
10 MB，TXT/MD 2 MB。提取文本总计上限 60000 字符，超出部分标记为已截断。
扫描件 PDF 不含文字层时会提示先执行 OCR，不会把空内容发送给模型。

视觉能力根据服务类型与模型标识判断。已知不支持的模型会在前端阻止提交，
Rust 端再次校验，确保图片不会被静默丢弃。未知模型同样要求用户切换为可识别
的视觉模型或移除图片。

## 8. 外观主题

`ThemeContext` 维护已保存主题和临时预览主题。输入变化时先应用到根节点，
点击保存后才写入 `localStorage`；关闭弹窗或取消预览会恢复已保存主题。

```css
:root {
  --bg-color: #080a0e;
  --text-color: #e8edf2;
  --accent-color: #70e1b6;
  --base-font-size: 14px;
}
```

内部颜色令牌由这三个基础变量组合生成，面板、边框、弱化文字和按钮保持协调。
大字号使用 `rem` 令牌与根字号联动，避免只放大部分文本。独立的
`public/theme-bootstrap.js` 在 React 挂载前读取已保存主题，减少启动闪烁。

主题支持 `dark`、`light`、`custom` 三种模式。组件使用
`src/design-system.css` 中的语义颜色、间距、圆角、阴影和字号 Token；
切换主题只更新根变量。主窗口通过 ResizeObserver 写入布局状态，并在容器宽度
不足时使用 Container Queries 将结果区下沉。`Ctrl/⌘ K` 命令面板复用同一组
业务动作，不复制业务逻辑。

## 9. 变量实例执行

```text
模板库（内置 / 自定义）
  ├─ 固定流程骨架 {{variable_key}}
  ├─ 变量定义（key、名称、说明、默认值）
  ├─ 规则
  └─ 示例
       ↓ 使用时只填写本次候选值
  ├─ 每个变量收集候选值（每行一个）
  ├─ 计算笛卡尔积，限制 12 个实例
  ├─ 文本替换生成每个实例的 sourcePrompt
  ├─ 附加项目上下文与变量元数据
  ├─ 顺序调用模型并记录进度
  └─ 每个实例独立保存历史、提供切换与复制
```

变量替换完全在前端完成；模型接收替换后的提示词，以及模板规则和风格示例。
模板规则与示例用于约束本次结果，但模板内容不能覆盖系统规则。项目上下文和
变量上下文位于明确的 XML 风格数据边界。
已知 IP、品牌或真实人物会触发授权与平台政策提示，但不作为阻断条件。

模板以有序 `sections_json` 章节数组为核心，每章包含稳定 ID、可编辑名称、
章节类型和正文。默认章节为角色、任务、上下文、变量说明、规则、示例、输出
格式和质量检查，用户可增加自定义章节并调整顺序。纯文本导出会保留
`{{variable_key}}` 占位符与填写说明；填写变量后可导出或复制替换完成的版本。
旧版自定义模板的固定字段会自动转换为章节结构。

## 10. 回复助手

回复助手使用独立的 `analyze_reply` 命令和 JSON 合同，但与现有模型配置、
系统凭据库及项目上下文共用基础设施。

```text
收到消息 + 发送者身份 + 项目上下文
  ├─ 首轮必须返回 1–5 个背景问题（含 WHY）
  ├─ 用户回答，后端最多接收 5 轮
  ├─ 信息足够后返回 3–4 条策略不同的回复
  └─ 前端逐条展示，复制按钮写入剪贴板
```

后端在首轮拒绝 `complete` 结果，确保“先提问、再回复”的产品约束。回复文本
保持可直接发送，不使用“你可以说……”等包裹性语言。

同一个 `analyze_reply` 命令根据 `conversationMode` 切换两种模式：

- `reply`：分析收到的消息与发送者身份，生成回复。
- `compose`：分析用户主动沟通目的，补问角色、对象、背景、语气与格式。

提示词请求和回复请求均可携带 `backgroundContext`。修订时还会携带
`revisionContext`，其中包含上一版输出和具体反馈；后端要求模型返回完整替换
结果。该闭环可重复执行，前端记录当前迭代次数。

## 11. 项目交互上下文

`history.source_history_ids_json` 保存新结果实际引用的来源记录 ID。
`project_history_summaries` 以来源 ID 集合和摘要版本生成缓存键，并额外保存
来源 `updated_at` 指纹；任一来源更新后，旧摘要不会被复用。生成请求只携带
结构化摘要、来源 ID、项目固定设定、本次输入和附件元数据，不发送所有历史
原文。

前端根据所选模型估算保守上下文预算，默认取模型窗口的 60%，允许用户调整。
摘要按更新时间倒序装入预算；未装入的记录会显示标题、ID 和截断数量。最终
请求与历史记录使用同一份实际引用摘要集合，确保界面展示与保存来源一致。

## 12. 项目交互转模板

提炼命令读取用户明确选择的历史记录，要求模型输出章节、变量和来源映射 JSON。
后端校验章节类型、变量唯一性、来源 ID 和映射目标；任何来源没有被映射时拒绝
结果。提炼只返回草稿，前端复用变量模板编辑器展示和修改，用户确认保存后才
写入 `variable_templates`，并保留 `source_history_ids_json` 与
`source_mappings_json`。
