// settings.js - 纯原生 JavaScript 实现

// 状态变量
var aiProvider = 'deepseek';
var apiKey = '';
var apiEndpoint = '';
var modelName = '';
var batchSize = 50;
var testing = false;
var analyzing = false;
var analyzeStatusText = '';

// DOM 元素
var elements = {};

// 默认配置
var defaultEndpoints = {
  deepseek: 'https://api.deepseek.com',
  siliconflow: 'https://api.siliconflow.cn',
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  custom: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
};

var defaultModels = {
  deepseek: 'deepseek-chat',
  siliconflow: 'deepseek-ai/DeepSeek-V3',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  custom: 'claude-sonnet-4-20250514'
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  cacheElements();
  bindEvents();
  loadSettings();
});

// 缓存 DOM 元素
function cacheElements() {
  elements.aiProvider = document.getElementById('aiProvider');
  elements.apiKey = document.getElementById('apiKey');
  elements.apiEndpoint = document.getElementById('apiEndpoint');
  elements.modelName = document.getElementById('modelName');
  elements.batchSize = document.getElementById('batchSize');
  elements.testConnection = document.getElementById('testConnection');
  elements.saveSettings = document.getElementById('saveSettings');
  elements.statusMessage = document.getElementById('statusMessage');
  elements.analyzeBookmarks = document.getElementById('analyzeBookmarks');
  elements.analyzeStatus = document.getElementById('analyzeStatus');
  elements.viewGraph = document.getElementById('viewGraph');
  elements.clearGraph = document.getElementById('clearGraph');
}

// 绑定事件
function bindEvents() {
  elements.aiProvider.addEventListener('change', onProviderChange);
  elements.testConnection.addEventListener('click', testConnection);
  elements.saveSettings.addEventListener('click', saveSettings);
  elements.analyzeBookmarks.addEventListener('click', analyzeBookmarks);
  elements.viewGraph.addEventListener('click', viewGraph);
  elements.clearGraph.addEventListener('click', clearGraph);
}

// 加载设置
function loadSettings() {
  chrome.storage.sync.get(['aiProvider', 'apiKey', 'apiEndpoint', 'modelName', 'batchSize'], function(result) {
    if (result.aiProvider) {
      aiProvider = result.aiProvider;
      elements.aiProvider.value = aiProvider;
    }
    if (result.apiKey) {
      apiKey = result.apiKey;
      elements.apiKey.value = apiKey;
    }
    if (result.apiEndpoint) {
      apiEndpoint = result.apiEndpoint;
      elements.apiEndpoint.value = apiEndpoint;
    }
    if (result.modelName) {
      modelName = result.modelName;
      elements.modelName.value = modelName;
    }
    if (result.batchSize) {
      batchSize = result.batchSize;
      elements.batchSize.value = batchSize;
    }
  });
}

// 服务商变更
function onProviderChange() {
  aiProvider = elements.aiProvider.value;
  if (!elements.apiEndpoint.value) {
    elements.apiEndpoint.value = defaultEndpoints[aiProvider] || '';
  }
  if (!elements.modelName.value) {
    elements.modelName.value = defaultModels[aiProvider] || '';
  }
}

// 保存设置
function saveSettings() {
  aiProvider = elements.aiProvider.value;
  apiKey = elements.apiKey.value;
  apiEndpoint = elements.apiEndpoint.value;
  modelName = elements.modelName.value;
  batchSize = parseInt(elements.batchSize.value, 10);

  chrome.storage.sync.set({
    aiProvider: aiProvider,
    apiKey: apiKey,
    apiEndpoint: apiEndpoint,
    modelName: modelName,
    batchSize: batchSize
  }, function() {
    showStatus('设置已保存！', 'success');
  });
}

// 测试连接
function testConnection() {
  apiKey = elements.apiKey.value.trim();
  if (!apiKey) {
    showStatus('请先输入 API Key', 'error');
    return;
  }

  testing = true;
  updateTestButton();
  showStatus('正在测试连接...', 'info');

  var endpoint = elements.apiEndpoint.value.trim();
  var model = elements.modelName.value.trim();

  if (!endpoint) {
    var config = getProviderConfig(aiProvider);
    endpoint = config.endpoint;
  }
  if (!model) {
    var config = getProviderConfig(aiProvider);
    model = config.model;
  }

  // 使用 background script 发送请求（绕过 CORS）
  chrome.runtime.sendMessage({
    action: 'testAIConnection',
    data: {
      provider: aiProvider,
      endpoint: endpoint,
      apiKey: apiKey,
      model: model
    }
  }, function(response) {
    testing = false;
    updateTestButton();

    if (chrome.runtime.lastError) {
      showStatus('连接失败：' + chrome.runtime.lastError.message, 'error');
      return;
    }

    if (response && response.success) {
      showStatus('连接测试成功！', 'success');
    } else {
      showStatus('连接失败：' + (response ? response.error : '未知错误'), 'error');
    }
  });
}

// 更新测试按钮状态
function updateTestButton() {
  var icon = elements.testConnection.querySelector('i');
  var text = elements.testConnection.querySelector('span');
  if (testing) {
    icon.className = 'fas fa-spinner fa-spin';
    text.textContent = '测试中...';
    elements.testConnection.disabled = true;
    elements.testConnection.classList.add('opacity-50');
  } else {
    icon.className = 'fas fa-plug';
    text.textContent = '测试连接';
    elements.testConnection.disabled = false;
    elements.testConnection.classList.remove('opacity-50');
  }
}

// 分析书签
function analyzeBookmarks() {
  analyzing = true;
  analyzeStatusText = '正在获取书签数据...';
  updateAnalyzeButton();

  fetchBookmarks().then(function(bookmarks) {
    analyzeStatusText = '获取到 ' + bookmarks.length + ' 个书签，正在发送 AI 分析...';
    updateAnalyzeButton();
    return loadConfig();
  }).then(function(config) {
    var endpoint = config.apiEndpoint || getProviderConfig(config.aiProvider).endpoint;
    var model = config.modelName || getProviderConfig(config.aiProvider).model;

    chrome.runtime.sendMessage({
      action: 'analyzeBookmarksAI',
      data: {
        provider: config.aiProvider,
        endpoint: endpoint,
        apiKey: config.apiKey,
        model: model,
        bookmarks: config.bookmarks
      }
    }, function(response) {
      analyzing = false;
      updateAnalyzeButton();

      if (chrome.runtime.lastError) {
        showStatus('分析失败：' + chrome.runtime.lastError.message, 'error');
        return;
      }

      if (response && response.success) {
        saveGraphData(response.data).then(function() {
          showStatus('图谱生成成功！点击"查看知识图谱"查看结果。', 'success');
        });
      } else {
        showStatus('分析失败：' + (response ? response.error : '未知错误'), 'error');
      }
    });
  }).catch(function(error) {
    analyzing = false;
    updateAnalyzeButton();
    showStatus('分析失败：' + error.message, 'error');
  });
}

// 更新分析按钮状态
function updateAnalyzeButton() {
  var icon = elements.analyzeBookmarks.querySelector('i');
  var text = elements.analyzeBookmarks.querySelector('span');
  if (analyzing) {
    icon.className = 'fas fa-spinner fa-spin';
    text.textContent = '正在分析...';
    elements.analyzeBookmarks.disabled = true;
    elements.analyzeBookmarks.classList.add('opacity-50');
    elements.analyzeStatus.classList.add('show');
    elements.analyzeStatus.querySelector('span').textContent = analyzeStatusText;
  } else {
    icon.className = 'fas fa-wand-magic-sparkles';
    text.textContent = '开始分析书签生成图谱';
    elements.analyzeBookmarks.disabled = false;
    elements.analyzeBookmarks.classList.remove('opacity-50');
    elements.analyzeStatus.classList.remove('show');
  }
}

// 获取书签
function fetchBookmarks() {
  return new Promise(function(resolve) {
    chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
      var bookmarks = [];
      function traverse(nodes) {
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (node.url) {
            bookmarks.push({ id: node.id, title: node.title, url: node.url });
          }
          if (node.children) {
            traverse(node.children);
          }
        }
      }
      traverse(bookmarkTreeNodes);
      resolve(bookmarks);
    });
  });
}

// 加载配置
function loadConfig() {
  return new Promise(function(resolve) {
    chrome.storage.sync.get(['aiProvider', 'apiKey', 'apiEndpoint', 'modelName', 'batchSize'], function(result) {
      resolve({
        aiProvider: result.aiProvider || aiProvider,
        apiKey: result.apiKey,
        apiEndpoint: result.apiEndpoint,
        modelName: result.modelName,
        batchSize: result.batchSize
      });
    });
  });
}

// 获取服务商配置
function getProviderConfig(providerName) {
  var providers = {
    deepseek: { endpoint: 'https://api.deepseek.com', model: 'deepseek-chat' },
    siliconflow: { endpoint: 'https://api.siliconflow.cn', model: 'deepseek-ai/DeepSeek-V3' },
    openai: { endpoint: 'https://api.openai.com', model: 'gpt-4o-mini' },
    anthropic: { endpoint: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
    custom: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'claude-sonnet-4-20250514' }
  };
  return providers[providerName] || providers.deepseek;
}

// 保存图谱数据
function saveGraphData(data) {
  return new Promise(function(resolve) {
    chrome.storage.local.set({ graphData: data }, resolve);
  });
}

// 查看图谱
function viewGraph() {
  chrome.windows.create({
    url: 'graph.html',
    width: 1200,
    height: 800,
    type: 'popup'
  }, function(window) {
    if (chrome.runtime.lastError) {
      console.error('Failed to open graph view:', chrome.runtime.lastError);
      showStatus('无法打开知识图谱，请重试', 'error');
    }
  });
}

// 清除图谱
function clearGraph() {
  chrome.storage.local.remove(['graphData'], function() {
    showStatus('图谱数据已清除', 'info');
  });
}

// 显示状态消息
function showStatus(text, type) {
  var colors = {
    success: 'bg-green-100 text-green-800 border border-green-200',
    error: 'bg-red-100 text-red-800 border border-red-200',
    info: 'bg-blue-100 text-blue-800 border border-blue-200'
  };

  elements.statusMessage.textContent = text;
  elements.statusMessage.className = 'status-message show p-3 rounded-lg text-sm font-medium text-center ' + (colors[type] || colors.info);

  setTimeout(function() {
    elements.statusMessage.classList.remove('show');
  }, 3000);
}
