# ACK高级书签管理器 - 项目概况

这是一个基于 Chrome Extension Manifest V3 架构开发的高级书签管理器。它不仅接管并增强了浏览器原生的书签管理功能，还引入了 AI 知识图谱分析能力，能够智能分析书签之间的关联性。

## 核心文件与目录结构

```text
d:\github\ack\
├── manifest.json        # 扩展的配置文件（声明了书签、通知、存储权限，以及各类 AI API 的主机权限）
├── README.md            # 项目说明文档
├── popup.html           # 扩展弹窗界面，管理书签的入口
├── settings.html        # 设置页面，可能用于配置 AI 接口的 API Key 和模型参数
├── graph.html           # 知识图谱可视化界面
├── js/                  # 核心前端与后台逻辑
│   ├── background.js    # Service Worker 后台脚本，用于监听书签事件和处理跨页面通信
│   ├── popup.js         # 弹窗 UI 交互逻辑
│   ├── settings.js      # 设置页功能逻辑
│   ├── graph.js         # 渲染与控制图谱页面的逻辑
│   ├── ai-service.js    # AI 服务模块：用于请求 Anthropic, OpenAI, DeepSeek, 阿里云等大模型接口分析书签
│   ├── d3.v7.min.js     # D3.js 库，用于在 graph.html 中绘制可视化知识图谱
│   └── tailwind.js      # 用于界面样式的 Tailwind CSS 脚本
├── css/                 # 样式目录
│   └── font-awesome.min.css # Font Awesome 字体图标库样式
├── icons/               # 扩展的各尺寸 Logo 图标
└── webfonts/            # 字体库文件存放目录
```

## 核心功能亮点

1. **基础书签管理**：以清晰的树状或者列表格式进行书签展示、快速搜索及一键收藏当前页。
2. **AI 服务集成**：配置了多源大模型的 API 端点（如 OpenAI, DeepSeek, 阿里通义千问等），其核心创新点是通过 `ai-service.js` 结合大模型对收藏的内容进行打标、分类以及关联。
3. **知识图谱展示**：使用 `d3.js`，通过 `graph.js` 和 `graph.html` 将书签数据以生动直观的网络节点流向图或者知识图谱呈现出来，帮助直观理解储备知识的结构。
4. **现代化 UI 提供**：结合了 Tailwind CSS 的按需响应式设计，以及 Font Awesome 支持的丰富图标展现，整体界面偏向目前主流的蓝色系现代卡片式设计。

总体来说，这是一个在传统书签功能上做加法，深度引入了 AI 分析和数据可视化（D3知识图谱）的创新型浏览器插件项目。
