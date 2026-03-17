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
        // 阳云兼容接口同时接受两种认证
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: providerConfig.model,
        max_tokens: 4096,
        thinking: { type: 'disabled' },
        system: systemMessage?.content || '',
        messages: userMessages
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
        description: '在用户的书签图谱中根据关键词语义搜索相关的书签',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索关键词' }
          },
          required: ['keyword']
        }
      },
      {
        name: 'get_graph_stats',
        description: '获取当前知识图谱的统计信息（节点数、分类数等）',
        parameters: { type: 'object', properties: {} }
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

    switch (name) {
      case 'search_bookmarks': {
        const keyword = args.keyword.toLowerCase();
        const results = graphData.nodes.filter(n =>
          (n.label && n.label.toLowerCase().includes(keyword)) ||
          (n.tags && n.tags.some(t => t.toLowerCase().includes(keyword))) ||
          (n.category && n.category.toLowerCase().includes(keyword))
        ).slice(0, 5);
        return { success: true, results: results.map(r => ({ title: r.label, url: r.url, category: r.category })) };
      }

      case 'get_graph_stats': {
        return {
          total_nodes: graphData.nodes.length,
          total_edges: graphData.edges.length,
          categories: Array.from(new Set(graphData.nodes.map(n => n.category))).filter(Boolean)
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
        目前的知识图谱包含 ${graphData ? graphData.nodes.length : 0} 个书签。
        你的回答应该专业、简洁且优雅。
        尽量利用搜索工具为用户提供有价值的建议。`
      },
      ...chatHistory,
      { role: 'user', content: userMessage }
    ];

    const response = await this.callWithTools(messages, tools, providerConfig, apiKey);

    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolResults = [];
      const updatedMessages = [...messages, response.message];
      
      for (const call of response.tool_calls) {
        const result = await this.executeTool(call.function, graphData);
        toolResults.push({
          tool_call_id: call.id,
          role: 'tool',
          name: call.function.name,
          content: JSON.stringify(result)
        });
      }

      const finalMessages = [...updatedMessages, ...toolResults];
      return await this.callOpenAICompatible(finalMessages, providerConfig, apiKey);
    }

    return response.content;
  }

  async callWithTools(messages, tools, providerConfig, apiKey) {
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
        tools: tools.map(t => ({ type: 'function', function: t })),
        tool_choice: 'auto'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败：${response.status} - ${error}`);
    }

    const data = await response.json();
    const message = data.choices[0].message;

    return {
      message: message,
      content: message.content,
      tool_calls: message.tool_calls
    };
  }
}

// 导出单例
window.aiService = new AIService();
