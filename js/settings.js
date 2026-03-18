// settings.js - 纯原生 JavaScript 实现

// 状态变量
var aiProvider = 'deepseek';
var apiKey = '';
var apiEndpoint = '';
var modelName = '';
var batchSize = 50;
var testing = false;
var language = 'auto';
var mcpEnabled = false;

var MCP_NATIVE_HOST = 'ack_mcp_native_host';

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
  elements.language = document.getElementById('language');
  elements.enableMcpBridge = document.getElementById('enableMcpBridge');
  elements.testMcpBridge = document.getElementById('testMcpBridge');
  elements.aiProvider = document.getElementById('aiProvider');
  elements.apiKey = document.getElementById('apiKey');
  elements.apiEndpoint = document.getElementById('apiEndpoint');
  elements.modelName = document.getElementById('modelName');
  elements.batchSize = document.getElementById('batchSize');
  elements.testConnection = document.getElementById('testConnection');
  elements.saveSettings = document.getElementById('saveSettings');
  elements.statusMessage = document.getElementById('statusMessage');
  elements.viewGraph = document.getElementById('viewGraph');
}

// 绑定事件
function bindEvents() {
  if (elements.language) {
    elements.language.addEventListener('change', onLanguageChange);
  }
  if (elements.enableMcpBridge) {
    elements.enableMcpBridge.addEventListener('change', onMcpToggle);
  }
  if (elements.testMcpBridge) {
    elements.testMcpBridge.addEventListener('click', testMcpBridge);
  }
  elements.aiProvider.addEventListener('change', onProviderChange);
  elements.testConnection.addEventListener('click', testConnection);
  elements.saveSettings.addEventListener('click', saveSettings);
  elements.viewGraph.addEventListener('click', viewGraph);
}

function onMcpToggle() {
  if (!elements.enableMcpBridge) return;
  mcpEnabled = !!elements.enableMcpBridge.checked;
  chrome.storage.sync.set({ mcpEnabled: mcpEnabled }, function() {
    chrome.runtime.sendMessage({ action: 'setMcpBridgeEnabled', enabled: mcpEnabled });
  });
}

function onLanguageChange() {
  if (!elements.language) return;
  language = elements.language.value || 'auto';
  chrome.storage.sync.set({ language: language }, function() {
    try { window.location.reload(); } catch (e) {}
  });
}

// 加载设置
function loadSettings() {
  chrome.storage.sync.get(['language', 'mcpEnabled', 'aiProvider', 'apiKey', 'apiEndpoint', 'modelName', 'batchSize'], function(result) {
    if (result.language && elements.language) {
      language = result.language;
      elements.language.value = language;
    } else if (elements.language) {
      elements.language.value = 'auto';
    }
    if (typeof result.mcpEnabled === 'boolean') {
      mcpEnabled = result.mcpEnabled;
    } else {
      mcpEnabled = false;
    }
    if (elements.enableMcpBridge) {
      elements.enableMcpBridge.checked = mcpEnabled;
    }
    if (mcpEnabled) {
      chrome.runtime.sendMessage({ action: 'setMcpBridgeEnabled', enabled: true });
    }
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

function testMcpBridge() {
  // 只做连接性检查：让后台尝试与 native host 建链并返回状态
  showStatus(t('settings.mcp.test'), 'info');
  chrome.runtime.sendMessage({ action: 'testMcpBridge' }, function(res) {
    if (chrome.runtime.lastError) {
      showStatus(chrome.runtime.lastError.message, 'error');
      return;
    }
    if (res && res.success) {
      showStatus('MCP bridge OK', 'success');
    } else {
      showStatus((res && res.error) ? res.error : 'MCP bridge failed', 'error');
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
  if (elements.language) {
    language = elements.language.value || 'auto';
  }
  aiProvider = elements.aiProvider.value;
  apiKey = elements.apiKey.value;
  apiEndpoint = elements.apiEndpoint.value;
  modelName = elements.modelName.value;
  batchSize = parseInt(elements.batchSize.value, 10);

  chrome.storage.sync.set({
    language: language,
    aiProvider: aiProvider,
    apiKey: apiKey,
    apiEndpoint: apiEndpoint,
    modelName: modelName,
    batchSize: batchSize
  }, function() {
    showStatus(t('settings.saved', 'Settings saved!'), 'success');
  });
}

// 测试连接
function testConnection() {
  apiKey = elements.apiKey.value.trim();
  if (!apiKey) {
    showStatus(t('settings.enterApiKey', 'Please enter API Key first'), 'error');
    return;
  }

  testing = true;
  updateTestButton();
  showStatus(t('settings.testingConnection', 'Testing connection...'), 'info');

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

  // 保存刚刚输入的最新配置，保证测试的是当前填写的
  chrome.storage.sync.set({
    apiEndpoint: endpoint,
    modelName: model,
    apiKey: apiKey
  }, function() {
    // 强制前端的 AIService 重新 loadConfig 并且测试连接
    if (window.aiService) {
      window.aiService.testConnection().then(function() {
        showStatus(t('settings.testOk', 'Connection OK'), 'success');
        testing = false;
        updateTestButton();
      }).catch(function(error) {
        showStatus(t('settings.testFail', 'Connection failed: ') + error.message, 'error');
        testing = false;
        updateTestButton();
      });
    } else {
      showStatus('连接失败：AI服务组件未加载', 'error');
      testing = false;
      updateTestButton();
    }
  });
}

function t(key, fallback) {
  try {
    if (window.__ACK_T) return window.__ACK_T(key, fallback);
  } catch (e) {}
  return fallback != null ? String(fallback) : '';
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
