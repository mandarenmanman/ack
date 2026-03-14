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

    // 构建书签数据摘要
    const bookmarkSummary = bookmarks.map((b, i) =>
      `${i + 1}. ${b.title || '无标题'} - ${b.url || '无 URL'}${b.description ? ' - ' + b.description : ''}`
    ).join('\n');

    const prompt = `你是一个知识图谱分析专家。请分析以下书签列表，提取主题分类和关联关系。

书签列表：
${bookmarkSummary}

请完成以下任务：
1. 识别每个书签的主要主题分类（如：技术、新闻、娱乐、购物、学习等）
2. 找出书签之间的关联关系（如：同一主题、相关技术、互补资源等）
3. 生成知识图谱的节点和边数据

请严格返回以下 JSON 格式（不要有其他说明文字）：
{
  "nodes": [
    {"id": "书签 ID 或 URL", "label": "显示名称", "category": "分类名称", "url": "原始 URL"}
  ],
  "edges": [
    {"source": "源节点 ID", "target": "目标节点 ID", "relation": "关系描述"}
  ],
  "categories": [
    {"name": "分类名", "color": "十六进制颜色值"}
  ]
}

注意：
- nodes 数组中的每个节点代表一个书签
- edges 数组描述节点间的关系，只连接有明确关联的节点
- categories 定义分类及其显示颜色
- 如果两个书签属于同一主题或有关联，就建立一条边
- 关系类型包括："同一主题"、"相关技术"、"互补资源"、"上下游"、"替代品"`;

    const messages = [
      { role: 'system', content: '你是一个专业的知识图谱构建助手，擅长从信息中提取结构化的关系数据。请严格返回 JSON 格式，不要有任何额外说明。' },
      { role: 'user', content: prompt }
    ];

    if (aiProvider === 'anthropic') {
      return this.callAnthropic(messages, providerConfig, apiKey);
    } else {
      return this.callOpenAICompatible(messages, providerConfig, apiKey);
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
    const content = data.choices[0].message.content;

    // 解析 JSON 响应
    try {
      // 清理可能的 markdown 代码块标记
      const jsonStr = content.replace(/```json\s*|\s*```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('解析 AI 响应失败:', content);
      throw new Error('AI 返回的数据格式不正确，无法解析为 JSON');
    }
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
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: providerConfig.model,
        max_tokens: 4096,
        system: systemMessage?.content || '',
        messages: userMessages
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败：${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    try {
      const jsonStr = content.replace(/```json\s*|\s*```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('解析 AI 响应失败:', content);
      throw new Error('AI 返回的数据格式不正确，无法解析为 JSON');
    }
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
}

// 导出单例
window.aiService = new AIService();
