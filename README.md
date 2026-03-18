# ACK Advanced Bookmark Manager

[English](#english) | [中文](#中文)

---

## English

ACK (Advanced Chrome Knowledge) is a next‑gen Chrome bookmark manager extension. It upgrades your bookmarks from a plain list into an **AI-powered personal knowledge graph**.

### Key features

#### AI knowledge graph
- **Full analysis**: analyze hundreds/thousands of bookmarks in one click, extract categories and semantic signals.
- **Graph visualization**: an interactive force-directed graph built with **D3.js**.
- **Incremental updates**: detect newly added/changed bookmarks and update the graph quickly.
- **Auto categorization**: assign categories/tags and a consistent color scheme.

#### Reliable large-scale analysis
- **Resume support**: batch processing for large collections (1000+). If interrupted (browser closed / API error), you can continue later.
- **Realtime rendering**: nodes appear during analysis for instant progress feedback.
- **Multi-provider**: supports **DeepSeek**, **SiliconFlow**, **OpenAI**, and **Anthropic** (Claude).
- **Long-running stability**: frontend direct-to-API requests to avoid MV3 background timeouts.

#### Basic bookmark management
- **Tree view**: browse native bookmark folders.
- **One-click save**: save current tab quickly.
- **Fast search**: quick lookup experience.
- **Stats panel**: growth by year/folder.

### Install (Developer Mode)
1. Download/clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the project folder.

### Quick setup
1. Click the extension icon → open **Settings**.
2. Choose an AI provider.
3. Paste your **API Key**.
4. Click **Test connection**.
5. Open **Knowledge Graph** → click **Full re-analysis**.

### Project structure

```text
ack/
├── js/
│   ├── ai-service.js     # Unified AI client (multi-provider)
│   ├── graph.js          # Graph logic, batching, D3 rendering
│   ├── background.js     # Background event listeners & notifications
│   └── settings.js       # Settings page logic
├── css/
│   └── ...               # Styles (Tailwind injection, etc.)
├── graph.html            # Knowledge graph view
├── settings.html         # Settings page
├── manifest.json         # Extension manifest (unlimitedStorage enabled)
└── README.md
```

### Permissions & privacy
- **unlimitedStorage**: store large graph data (nodes/edges).
- **bookmarks**: read/manage bookmarks.
- **AI privacy**: only bookmark titles and domains are sent for analysis (no page content). API keys are stored locally in `chrome.storage.sync`.

### Contributing / feedback
Issues and PRs are welcome. If you hit format/compatibility problems, please file an issue with request/response logs.

---

## 中文

ACK (Advanced Chrome Knowledge) 是一个下一代的 Chrome 书签管理扩展：它不只是书签列表，更是一个 **AI 驱动的个人知识图谱系统**。

### 🌟 核心功能

#### 🧠 AI 驱动的知识图谱
- **全量自动分析**：一键将成百上千个书签交由 AI 分析，提取主题分类并建立语义关联。
- **可视化宇宙**：基于 **D3.js** 的动态力导向图，让书签像繁星一样连接成片。
- **实时增量更新**：识别最新添加或修改的书签，秒级补全图谱。
- **自动分类系统**：自动分类/打标签，并分配一致的色彩方案。

#### 🚀 工业级分析引擎
- **断点续传机制**：支持超大规模书签库（1000+）分批分析；中断后可继续。
- **实时渲染技术**：分析过程中节点动态出现，所见即所得。
- **多模型支持**：支持 **DeepSeek**、**硅基流动 (SiliconFlow)**、**OpenAI**、**Anthropic (Claude)**。
- **极致稳定性**：前端直连 API，绕过 MV3 Background 超时限制。

#### 📂 基础管理功能
- **树形视图**：清晰展示原生书签目录结构。
- **一键收藏**：快速收藏当前页面。
- **智能搜索**：快速检索体验。
- **统计面板**：按年份、按目录统计趋势。

### 🛠️ 安装方法（开发者模式）
1. 下载本项目代码。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 开启右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择本项目文件夹。

### ⚙️ 快速配置
1. 点击扩展图标进入 **设置**。
2. 在 **AI 接口配置** 中选择服务商。
3. 输入 **API Key**。
4. 点击 **测试连接**。
5. 前往 **知识图谱** 页面，点击 **全量重新分析**。

### 🔒 权限与安全
- **unlimitedStorage**：用于存储大规模图谱数据（nodes/edges）。
- **bookmarks**：用于管理原生书签交互。
- **AI 隐私**：仅发送书签标题与域名用于分析，不发送页面内容；API Key 存在本地 `chrome.storage.sync`。

### 🤝 贡献与反馈
欢迎提交 Issue/PR。如遇到格式不匹配或连接异常，建议附上请求/响应日志便于定位。