// background.js - Service Worker for BookmarkManager Extension

// 监听书签创建事件
chrome.bookmarks.onCreated.addListener(function(id, bookmark) {
  console.log('新书签已创建!');
  console.log('ID: ' + id);
  console.log('标题：' + bookmark.title);
  console.log('URL: ' + bookmark.url);

  // 发送通知
  if (bookmark.url) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '书签已添加',
      message: '成功收藏页面：' + (bookmark.title || '未命名页面')
    });
  }
});

// 监听书签被删除的事件
chrome.bookmarks.onRemoved.addListener(function(id, removeInfo) {
  console.log('书签 (ID: ' + id + ') 已被删除');

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: '书签已删除',
    message: '一个书签已从收藏夹中移除'
  });
});

// 监听书签被移动的事件
chrome.bookmarks.onMoved.addListener(function(id, moveInfo) {
  console.log('书签 (ID: ' + id + ') 已被移动');
});

// 监听书签被修改的事件
chrome.bookmarks.onChanged.addListener(function(id, changeInfo) {
  console.log('书签 (ID: ' + id + ') 已被修改');

  if (changeInfo.title || changeInfo.url) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '书签已更新',
      message: '书签信息已更新：' + (changeInfo.title || '标题未变')
    });
  }
});

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    console.log('BookmarkManager 扩展已安装');

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '欢迎使用高级书签管理器',
      message: '点击工具栏图标开始管理您的书签！'
    });
  } else if (details.reason === 'update') {
    console.log('BookmarkManager 扩展已更新');
  }
});

// 监听通知点击事件
chrome.notifications.onClicked.addListener(function(notificationId) {
  console.log('通知被点击:', notificationId);
  chrome.notifications.clear(notificationId);
});

// 监听扩展图标点击事件
chrome.action.onClicked.addListener(function(tab) {
  console.log('扩展图标被点击，当前标签页:', tab.title);
});

// 处理来自 settings 和 popup 的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('收到消息:', request);

  if (request.action === 'testAIConnection') {
    testConnection(request.data).then(function(result) {
      sendResponse(result);
    }).catch(function(error) {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'analyzeBookmarksAI') {
    analyzeBookmarks(request.data).then(function(result) {
      sendResponse(result);
    }).catch(function(error) {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'getBookmarkStats') {
    chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
      var stats = calculateBookmarkStats(bookmarkTreeNodes);
      sendResponse(stats);
    });
    return true;
  }
});

// 测试 AI 连接
function testConnection(data) {
  var endpoint = data.endpoint;
  var apiKey = data.apiKey;
  var model = data.model;
  var provider = data.provider;

  var url, body, headers;

  if (provider === 'anthropic' || provider === 'custom') {
    url = endpoint + '/v1/messages';
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
    body = JSON.stringify({
      model: model,
      max_tokens: 100,
      system: '你是一个测试助手。',
      messages: [{ role: 'user', content: '请回答 OK' }]
    });
  } else {
    url = endpoint + '/v1/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    };
    body = JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: '请回答"OK"，这是一个连接测试。' }],
      temperature: 0.3
    });
  }

  return fetch(url, {
    method: 'POST',
    headers: headers,
    body: body
  }).then(function(response) {
    if (response.ok) {
      return { success: true };
    } else {
      return response.text().then(function(errorText) {
        throw new Error(response.status + ' - ' + errorText);
      });
    }
  });
}

// 分析书签生成图谱
function analyzeBookmarks(data) {
  var endpoint = data.endpoint;
  var apiKey = data.apiKey;
  var model = data.model;
  var provider = data.provider;
  var bookmarks = data.bookmarks;
  var batchSize = data.batchSize || 50;

  // 根据 batchSize 限制分析数量
  var bookmarksToAnalyze = bookmarks.slice(0, batchSize);

  // 精简格式：只保留必要信息
  var bookmarkSummary = '';
  for (var i = 0; i < bookmarksToAnalyze.length; i++) {
    var b = bookmarksToAnalyze[i];
    // 缩短 URL，只保留域名
    var domain = '';
    if (b.url) {
      var match = b.url.match(/^https?:\/\/([^\/]+)/);
      domain = match ? match[1] : b.url;
    }
    bookmarkSummary += (i + 1) + '. [' + (b.title || '无标题') + '](' + domain + ')\n';
  }

  var truncatedInfo = bookmarksToAnalyze.length < bookmarks.length
    ? '\n... 还有 ' + (bookmarks.length - batchSize) + ' 个书签未分析（根据批量设置）\n'
    : '';

  var prompt = '分析以下书签列表，生成知识图谱数据。\n\n' +
    '书签列表：\n' + bookmarkSummary + '\n\n' +
    '返回 JSON 格式：\n' +
    '{\n' +
    '  "nodes": [{"id": "书签 ID", "label": "名称", "category": "分类", "url": "完整 URL"}],\n' +
    '  "edges": [{"source": "源 ID", "target": "目标 ID", "relation": "关系"}],\n' +
    '  "categories": [{"name": "分类名", "color": "#颜色"}]\n' +
    '}\n\n' +
    '要求：\n' +
    '1. 根据书签主题自动分类\n' +
    '2. 相关书签之间建立连接关系\n' +
    '3. 只返回 JSON，不要其他说明';

  var url, body, headers;

  if (provider === 'anthropic' || provider === 'custom') {
    url = endpoint + '/v1/messages';
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
    body = JSON.stringify({
      model: model,
      max_tokens: 4096,
      system: '你是知识图谱分析专家，返回结构化 JSON 数据。',
      messages: [{ role: 'user', content: prompt }]
    });
  } else {
    url = endpoint + '/v1/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    };
    body = JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });
  }

  return fetch(url, {
    method: 'POST',
    headers: headers,
    body: body
  }).then(function(response) {
    if (!response.ok) {
      return response.text().then(function(error) {
        throw new Error('API 请求失败：' + response.status + ' - ' + error);
      });
    }
    return response.json();
  }).then(function(result) {
    var content;
    if (result.content && result.content.length > 0) {
      // 查找 text 类型的内容（跳过 thinking 类型）
      for (var i = 0; i < result.content.length; i++) {
        if (result.content[i].type === 'text' && result.content[i].text) {
          content = result.content[i].text;
          break;
        }
      }
      // 如果没有找到 text 类型，尝试第一个元素
      if (!content && result.content[0]) {
        content = result.content[0].text || result.content[0].content;
      }
    } else if (result.choices && result.choices[0]) {
      content = result.choices[0].message.content;
    } else {
      throw new Error('无法解析 API 响应');
    }
    if (!content) {
      throw new Error('API 响应内容为空');
    }
    var jsonStr = content.replace(/```json\s*|\s*```/g, '').trim();
    return { success: true, data: JSON.parse(jsonStr) };
  });
}

// 计算书签统计信息
function calculateBookmarkStats(nodes) {
  var bookmarkCount = 0;
  var folderCount = 0;

  function traverse(nodeList) {
    for (var i = 0; i < nodeList.length; i++) {
      var node = nodeList[i];
      if (node.children) {
        folderCount++;
        traverse(node.children);
      } else if (node.url) {
        bookmarkCount++;
      }
    }
  }

  traverse(nodes);

  return {
    bookmarks: bookmarkCount,
    folders: folderCount,
    total: bookmarkCount + folderCount
  };
}
