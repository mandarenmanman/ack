// settings.js - 纯原生 JavaScript 实现

// 状态变量
var aiProvider = 'deepseek';
var apiKey = '';
var apiEndpoint = '';
var modelName = '';
var batchSize = 50;
var testing = false;

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
  elements.viewGraph = document.getElementById('viewGraph');
}

// 绑定事件
function bindEvents() {
  elements.aiProvider.addEventListener('change', onProviderChange);
  elements.testConnection.addEventListener('click', testConnection);
  elements.saveSettings.addEventListener('click', saveSettings);
  elements.viewGraph.addEventListener('click', viewGraph);
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

  // 保存刚刚输入的最新配置，保证测试的是当前填写的
  chrome.storage.sync.set({
    apiEndpoint: endpoint,
    modelName: model,
    apiKey: apiKey
  }, function() {
    // 强制前端的 AIService 重新 loadConfig 并且测试连接
    if (window.aiService) {
      window.aiService.testConnection().then(function() {
        showStatus('连接成功！API 配置正确', 'success');
        testing = false;
        updateTestButton();
      }).catch(function(error) {
        showStatus('连接失败：' + error.message, 'error');
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
