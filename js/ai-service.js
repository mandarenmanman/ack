// ai-service.js - AI 服务模块

const AI_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    defaultEndpoint: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    chatPath: '/v1/chat/completions'
  },
  siliconflow: {
    name: '硅基流动',
    defaultEndpoint: 'https://api.siliconflow.cn',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    chatPath: '/v1/chat/completions'
  },
  openai: {
    name: 'OpenAI',
    defaultEndpoint: 'https://api.openai.com',
    defaultModel: 'gpt-4o-mini',
    chatPath: '/v1/chat/completions'
  },
  anthropic: {
    name: 'Anthropic',
    defaultEndpoint: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    chatPath: '/v1/messages'
  },
  custom: {
    name: '自定义',
    defaultEndpoint: '',
    defaultModel: '',
    chatPath: '/v1/chat/completions'
  }
};

class AIService {
  constructor() {
    this.config = null;
    // 缓存：书签ID -> 所在文件夹路径（用于 @文件夹 范围筛选）
    this._bookmarkFolderIndex = null; // Map<string, string[]>
    this._bookmarkFolderIndexAt = 0;
  }

  // 加载配置
  async loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['aiProvider', 'apiKey', 'apiEndpoint', 'modelName', 'batchSize'], (result) => {
        this.config = result;
        resolve(result);
      });
    });
  }

  // 获取提供商配置
  getProviderConfig(providerName) {
    const provider = AI_PROVIDERS[providerName] || AI_PROVIDERS.deepseek;
    return {
      ...provider,
      endpoint: this.config.apiEndpoint || provider.defaultEndpoint,
      model: this.config.modelName || provider.defaultModel
    };
  }

  // 分析书签数据
  async analyzeBookmarks(bookmarks) {
    await this.loadConfig();

    const { apiKey, aiProvider } = this.config;
    if (!apiKey) {
      throw new Error('请先配置 API Key');
    }

    const providerConfig = this.getProviderConfig(aiProvider);

    // 构建书签数据摘要，格式为：书签ID|标题 - URL
    const bookmarkSummary = bookmarks.map((b) =>
      `${b.id}|${b.title || '无标题'} - ${b.url || '无 URL'}`
    ).join('\n');

    // 建立 ID → 原始书签的映射，用于合并 AI 返回的语义字段
    const bookmarkMap = new Map(bookmarks.map(b => [String(b.id), b]));


    const prompt = `你是一个知识图谱构建专家。请阅读以下书签列表，利用“宏观分类+微观标签”的结构提取其语义属性，以便后续生成网状关联。

书签列表：
${bookmarkSummary}

请完成以下任务：
1. 核心分类 (category)：识别宏观领域（如：前端开发、人工智能、商业、设计、效率工具等）。尽量将相似的书签归为同一个大类。
2. 子领域 (sub_domain)：提取1-2个词的细分领域（例如分类是"前端开发"，子领域可能是"React"或"性能优化"）。
3. 核心实体标签 (tags)：提取3-5个专有名词或核心技术概念（如：LangChain, 知识图谱, SVG动画）。

请严格返回以下 JSON 格式（绝对不要输出任何 markdown 标记、\`\`\`json 或其他说明文字，只输出合法的纯 JSON 字符串）：
{
  "nodes":[
    {
      "id": "书签的ID（即每行第一个 | 符号前的数字，原样返回，只返回数字部分）",
      "category": "分类名称",
      "sub_domain": "子领域",
      "tags":["标签1", "标签2", "标签3"]
    }
  ]
}

注意：
- nodes 数组中的每个节点代表一个书签。
- 只需返回上述推导出的分类和标签字段，严禁在结果中包含标题、URL或摘要等冗余信息。
- 你生成的 tags 数组必须精准，后续系统将基于重叠的 tags 自动连接节点。`;

    const messages = [
      { role: 'system', content: '你是一个专业的书签分类引擎，擅长将零散信息聚合到统一的主题下。请严格返回 JSON 格式，不要有任何额外说明。' },
      { role: 'user', content: prompt }
    ];

    let content;
    if (aiProvider === 'anthropic') {
      content = await this.callAnthropic(messages, providerConfig, apiKey);
    } else {
      content = await this.callOpenAICompatible(messages, providerConfig, apiKey);
    }

    const result = this.parseAIResponse(content);

    // 将 AI 返回的语义字段（category/sub_domain/tags）与原始书签数据合并
    // 确保每个节点都有 label 和 url，以支持图谱显示与点击打开
    if (result && result.nodes) {
      result.nodes = result.nodes.map(node => {
        // 容错处理：AI 可能返回“ID:3”、“[ID:3]”等格式，统一裁削成纯数字
        const cleanId = String(node.id).replace(/^\[?ID:?\]?/i, '').replace(/\|.*/, '').trim();
        const original = bookmarkMap.get(cleanId);
        return {
          ...node,
          id: cleanId,  // 将 ID 差异化回原始格式
          label: original ? (original.title || '未命名') : (node.label || cleanId),
          url: original ? (original.url || '') : (node.url || '')
        };
      });
    }

    return result;
  }

  // 统一解析 AI 返回的 JSON 字符串
  parseAIResponse(content) {
    if (!content) {
      throw new Error('AI 返回内容为空');
    }

    try {
      // 清理可能的 markdown 代码块标记
      const jsonStr = content.replace(/```json\s*|\s*```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('解析 AI 响应失败:', content);
      throw new Error('AI 返回的数据格式不正确，无法解析为 JSON');
    }
  }

  // 调用 OpenAI 兼容接口（DeepSeek、SiliconFlow、OpenAI）
  async callOpenAICompatible(messages, providerConfig, apiKey) {
    const url = providerConfig.endpoint + providerConfig.chatPath;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: providerConfig.model,
        messages: messages,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败：${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // 调用 Anthropic 接口
  async callAnthropic(messages, providerConfig, apiKey) {
    const url = providerConfig.endpoint + providerConfig.chatPath;

    // 转换为 Anthropic 格式
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: providerConfig.model,
        max_tokens: 4096,
        thinking: { type: 'disabled' },
        system: systemMessage?.content || '',
        messages: userMessages.map(m => {
          // Anthropic /v1/messages 仅支持 user/assistant 角色
          // 暂将 tool 结果特殊转换为 user 文本，以保证请求合法
          if (m.role === 'tool') {
            return {
              role: 'user',
              content: `工具 [${m.name}] 返回结果: ${m.content}`
            };
          }
          return {
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          };
        })
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败：${response.status} - ${error}`);
    }

    const data = await response.json();

    // 兼容两种响应格式：
    // 1. Anthropic 原生格式: data.content[].text（注意要跳过 thinking 类型块）
    // 2. OpenAI 兼容格式（阳云或其他代理可能返回）: data.choices[].message.content
    let content;
    if (data.content && data.content.length > 0) {
      // 找第一个 type === 'text' 的块（跳过 thinking、tool_use 等其他类型）
      for (let i = 0; i < data.content.length; i++) {
        if (data.content[i].type === 'text' && data.content[i].text) {
          content = data.content[i].text;
          break;
        }
      }
    } else if (data.choices && data.choices.length > 0) {
      content = data.choices[0].message.content;
    }

    if (!content) {
      console.error('未能解析的 API 响应内容:', JSON.stringify(data));
      throw new Error('API 响应内容为空或格式不支持');
    }

    return content;
  }

  // 测试连接
  async testConnection() {
    await this.loadConfig();

    const { apiKey, aiProvider } = this.config;
    if (!apiKey) {
      throw new Error('请先配置 API Key');
    }

    const providerConfig = this.getProviderConfig(aiProvider);

    const messages = [
      { role: 'user', content: '请回答"OK"，这是一个连接测试。' }
    ];

    if (aiProvider === 'anthropic') {
      await this.callAnthropic(messages, providerConfig, apiKey);
    } else {
      await this.callOpenAICompatible(messages, providerConfig, apiKey);
    }

    return true;
  }

  // 从 Chrome 书签 API 获取书签
  async fetchBookmarks() {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        const bookmarks = [];

        function traverse(nodes, depth = 0) {
          for (const node of nodes) {
            if (node.url) {
              bookmarks.push({
                id: node.id,
                title: node.title,
                url: node.url,
                parentId: node.parentId
              });
            }
            if (node.children) {
              traverse(node.children, depth + 1);
            }
          }
        }

        traverse(bookmarkTreeNodes);
        resolve(bookmarks);
      });
    });
  }
  // --- 龙虾助手 (AI Agent) 核心扩展 ---

  // 1. 定义可用工具 (Skills)
  getAvailableTools() {
    return [
      {
        name: 'search_bookmarks',
        description: '在用户的书签图谱中搜索相关书签（可选按 @文件夹 或 #分类 限定范围）',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索关键词' },
            folder: { type: 'string', description: '可选：限定在某个文件夹范围内（来自用户输入的 @文件夹名）' },
            category: { type: 'string', description: '可选：限定在某个分类范围内（来自用户输入的 #分类名）' }
          },
          required: ['keyword']
        }
      },
      {
        name: 'get_graph_stats',
        description: '获取当前知识图谱的统计信息（可选按 @文件夹 或 #分类 限定范围）',
        parameters: {
          type: 'object',
          properties: {
            folder: { type: 'string', description: '可选：限定在某个文件夹范围内（来自用户输入的 @文件夹名）' },
            category: { type: 'string', description: '可选：限定在某个分类范围内（来自用户输入的 #分类名）' }
          }
        }
      },
      {
        name: 'open_url',
        description: '在浏览器新标签页中打开指定的 URL',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '要打开的完整 URL' }
          },
          required: ['url']
        }
      }
    ];
  }

  // 2. 执行工具调用
  /**
   * 执行一次「模型发起的工具调用」并返回工具结果。
   *
   * 这个方法充当 AI 工具链的“本地执行器”：把模型输出的 tool call（函数名 + 参数）
   * 映射到扩展内允许的操作（白名单），并将结果序列化后回传给模型继续生成最终回复。
   *
   * 兼容点：
   * - `toolCall.arguments` 既可能是 JSON 字符串（OpenAI 常见），也可能是对象（部分实现/代理）。
   * - 返回值统一为可 JSON.stringify 的对象，供上层拼成 `role: "tool"` 消息回灌。
   *
   * 安全边界：
   * - 只允许执行 `getAvailableTools()` 中声明的工具；未知工具直接返回错误。
   * - 依赖已加载的 `graphData`（来自本地存储/页面上下文），若缺失则拒绝执行，避免空跑或误操作。
   *
   * @param {{name: string, arguments: (string|object)}} toolCall 模型请求调用的工具信息
   * @param {{nodes?: Array, edges?: Array}|null} graphData 当前图谱数据（用于搜索/统计/打开链接等）
   * @returns {Promise<object>} 工具执行结果（成功/失败信息）
   */
  async executeTool(toolCall, graphData) {
    const { name, arguments: argsString } = toolCall;
    let args;
    try {
      args = typeof argsString === 'string' ? JSON.parse(argsString) : argsString;
    } catch (e) {
      console.error('解析工具参数失败:', e);
      return { error: '参数解析失败' };
    }

    console.log(`执行工具: ${name}`, args);

    if (!graphData || !graphData.nodes) {
      return { error: '未加载图谱数据' };
    }

    // 统一解析范围限定：@文件夹 / #分类
    const folderQuery = (args && args.folder ? String(args.folder).trim() : '');
    const categoryQuery = (args && args.category ? String(args.category).trim() : '');

    // 先按范围把候选节点缩小，再做关键词匹配（避免大图谱全量扫）
    let scopedNodes = Array.isArray(graphData.nodes) ? graphData.nodes.slice() : [];

    if (categoryQuery) {
      const catLower = categoryQuery.toLowerCase();
      scopedNodes = scopedNodes.filter(n => {
        const c = (n && n.category) ? String(n.category) : '';
        // 优先精确匹配；其次包含匹配（兼容用户输入不完整）
        return c === categoryQuery || c.toLowerCase().includes(catLower);
      });
    }

    if (folderQuery) {
      const folderLower = folderQuery.toLowerCase();
      const folderIndex = await this.getBookmarkFolderIndex();
      scopedNodes = scopedNodes.filter(n => {
        const id = n && n.id != null ? String(n.id) : '';
        const path = folderIndex.get(id);
        if (!path || path.length === 0) return false;
        // 路径任意一段包含匹配即可（@xxx 往往是目录名片段）
        return path.some(seg => String(seg).toLowerCase().includes(folderLower));
      });
    }

    switch (name) {
      case 'search_bookmarks': {
        const keyword = String(args.keyword || '').toLowerCase();
        if (!keyword) return { error: 'keyword 不能为空' };

        const results = scopedNodes.filter(n =>
          (n.label && String(n.label).toLowerCase().includes(keyword)) ||
          (n.tags && n.tags.some(t => String(t).toLowerCase().includes(keyword))) ||
          (n.category && String(n.category).toLowerCase().includes(keyword))
        ).slice(0, 5);

        return {
          success: true,
          scope: { folder: folderQuery || null, category: categoryQuery || null },
          matched: results.length,
          results: results.map(r => ({ title: r.label, url: r.url, category: r.category }))
        };
      }

      case 'get_graph_stats': {
        const nodes = scopedNodes;
        const edges = Array.isArray(graphData.edges) ? graphData.edges : [];
        const nodeIdSet = new Set(nodes.map(n => String(n.id)));
        const scopedEdges = edges.filter(e => {
          const s = e && e.source != null ? String(typeof e.source === 'object' ? e.source.id : e.source) : '';
          const t = e && e.target != null ? String(typeof e.target === 'object' ? e.target.id : e.target) : '';
          return nodeIdSet.has(s) && nodeIdSet.has(t);
        });

        return {
          scope: { folder: folderQuery || null, category: categoryQuery || null },
          total_nodes: nodes.length,
          total_edges: scopedEdges.length,
          categories: Array.from(new Set(nodes.map(n => n.category))).filter(Boolean)
        };
      }

      case 'open_url': {
        chrome.tabs.create({ url: args.url });
        return { success: true, message: `已为您打开：${args.url}` };
      }

      default:
        return { error: `未知工具: ${name}` };
    }
  }

  /**
   * 构建并缓存书签「ID -> 文件夹路径」索引，用于 @文件夹 范围筛选。
   * - 路径为从根到当前书签父目录的标题数组（包含父目录本身）。
   * - 为避免每次工具调用都遍历全量书签树，默认缓存 5 分钟。
   *
   * @returns {Promise<Map<string, string[]>>}
   */
  async getBookmarkFolderIndex() {
    const TTL_MS = 5 * 60 * 1000;
    const now = Date.now();
    if (this._bookmarkFolderIndex && (now - this._bookmarkFolderIndexAt) < TTL_MS) {
      return this._bookmarkFolderIndex;
    }

    const index = new Map();
    const tree = await new Promise((resolve) => chrome.bookmarks.getTree(resolve));

    const traverse = (nodes, path) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (!node) continue;
        if (node.children && Array.isArray(node.children)) {
          const title = node.title || '';
          // root 节点 title 可能为空或 "root"，不强行加入；但仍继续向下遍历
          const nextPath = title ? [...path, title] : path;
          traverse(node.children, nextPath);
        } else if (node.url) {
          // node 为书签：记录它所属的文件夹路径（即当前 path）
          index.set(String(node.id), path);
        }
      }
    };

    traverse(tree, []);

    this._bookmarkFolderIndex = index;
    this._bookmarkFolderIndexAt = now;
    return index;
  }

  // 3. 智能助手聊天接口
  async chatWithAgent(userMessage, chatHistory = [], graphData = null) {
    await this.loadConfig();
    const { apiKey, aiProvider } = this.config;
    if (!apiKey) throw new Error('请先配置 API Key');

    const providerConfig = this.getProviderConfig(aiProvider);
    const tools = this.getAvailableTools();

    const messages = [
      {
        role: 'system',
        content: `你是一个集成在书签管理器中的 AI 助手。
        你可以通过调用工具来查看、搜索和操作用户的书签知识图谱。
        内容包含 ${graphData ? graphData.nodes.length : 0} 个分析过的书签。
        用户输入中可能会使用 @文件夹名 或 #分类名（通过联想输入插入）。
        - @文件夹：指代浏览器中的某个目录。
        - #分类名：指代图谱中的某个核心分类。
        如果用户提到这些标记，请在回答或调用搜索工具时优先考虑对应范围。
        工具参数约定：
        - 当用户提到 @文件夹 或 #分类 时，请在 search_bookmarks / get_graph_stats 的参数中携带 folder / category 来限定范围。
        你的回答应该专业、简洁且优雅。
        尽量利用搜索工具为用户提供有价值的建议。`
      },
      ...chatHistory,
      { role: 'user', content: userMessage }
    ];

    const response = await this.callWithTools(messages, tools, providerConfig, apiKey);

    // 处理工具调用
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolResults = [];
      const assistantMessage = response.message;

      for (const call of response.tool_calls) {
        const result = await this.executeTool(call.function, graphData);

        // 统一工具结果格式 (OpenAI 格式，会在 callOpenAICompatible 中被自动适配)
        toolResults.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result)
        });
      }

      const finalMessages = [...messages, assistantMessage, ...toolResults];

      // 最终回复调用
      if (providerConfig.chatPath === '/v1/messages') {
        // 如果是 Anthropic，我们调用专用的 callAnthropic 处理系统消息分离
        return await this.callAnthropic(finalMessages, providerConfig, apiKey);
      } else {
        return await this.callOpenAICompatible(finalMessages, providerConfig, apiKey);
      }
    }

    return response.content;
  }

  async callWithTools(messages, tools, providerConfig, apiKey) {
    const url = providerConfig.endpoint + providerConfig.chatPath;
    const isAnthropicProtocol = providerConfig.chatPath === '/v1/messages';

    let body;
    if (isAnthropicProtocol) {
      // 适配 Anthropic (Claude) 协议格式
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      body = {
        model: providerConfig.model,
        max_tokens: 4096,
        system: systemMessage ? systemMessage.content : '',
        messages: userMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters
        }))
      };
    } else {
      // 标准 OpenAI 协议格式
      body = {
        model: providerConfig.model,
        messages: messages,
        tools: tools.map(t => ({ type: 'function', function: t })),
        tool_choice: 'auto'
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-api-key': apiKey, // 兼容原生 Anthropic
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败：${response.status} - ${error}`);
    }

    const data = await response.json();

    // 统一化响应格式
    if (isAnthropicProtocol) {
      // 解析 Anthropic 响应
      const contentBlocks = data.content || [];
      const textBlock = contentBlocks.find(b => b.type === 'text');
      const toolBlocks = contentBlocks.filter(b => b.type === 'tool_use');

      return {
        message: { role: 'assistant', content: textBlock ? textBlock.text : '' },
        content: textBlock ? textBlock.text : '',
        tool_calls: toolBlocks.map(b => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: b.input }
        }))
      };
    } else {
      // 解析 OpenAI 响应
      const message = data.choices[0].message;
      return {
        message: message,
        content: message.content,
        tool_calls: message.tool_calls
      };
    }
  }
}

// 导出单例
window.aiService = new AIService();
