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

// =========================
// MCP Bridge (Native Host)
// =========================

var MCP_NATIVE_HOST_NAME = 'ack_mcp_native_host';
var nativePort = null;
var nativeDisconnected = false;
var pendingNative = {}; // id -> {resolve, reject}

function ensureNativePort() {
  return new Promise(function(resolve, reject) {
    if (nativePort && !nativeDisconnected) return resolve(nativePort);

    nativeDisconnected = false;
    try {
      nativePort = chrome.runtime.connectNative(MCP_NATIVE_HOST_NAME);
    } catch (e) {
      nativePort = null;
      reject(e);
      return;
    }

    nativePort.onMessage.addListener(function(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'pong' && msg.id != null) {
        var p = pendingNative[msg.id];
        if (p) {
          delete pendingNative[msg.id];
          p.resolve(msg.result || { success: true });
        }
        return;
      }

      if (msg.type === 'tool_call' && msg.id != null && msg.name) {
        handleNativeToolCall(msg).then(function(result) {
          try {
            nativePort.postMessage({ type: 'tool_result', id: msg.id, result: result });
          } catch (e) {}
        }).catch(function(err) {
          try {
            nativePort.postMessage({ type: 'tool_result', id: msg.id, result: { error: err.message } });
          } catch (e2) {}
        });
      }
    });

    nativePort.onDisconnect.addListener(function() {
      nativeDisconnected = true;
      nativePort = null;
    });

    resolve(nativePort);
  });
}

function getGraphData() {
  return new Promise(function(resolve) {
    chrome.storage.local.get(['graphData'], function(res) {
      resolve(res && res.graphData ? res.graphData : null);
    });
  });
}

var _bookmarkFolderIndex = null; // Map<string, string[]>
var _bookmarkFolderIndexAt = 0;
var BOOKMARK_INDEX_TTL_MS = 5 * 60 * 1000;

function getBookmarkFolderIndex() {
  var now = Date.now();
  if (_bookmarkFolderIndex && (now - _bookmarkFolderIndexAt) < BOOKMARK_INDEX_TTL_MS) {
    return Promise.resolve(_bookmarkFolderIndex);
  }

  return new Promise(function(resolve) {
    chrome.bookmarks.getTree(function(treeNodes) {
      var index = new Map();

      function traverse(nodes, path) {
        if (!Array.isArray(nodes)) return;
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (!node) continue;
          if (node.children && Array.isArray(node.children)) {
            var title = node.title || '';
            var nextPath = title ? path.concat([title]) : path;
            traverse(node.children, nextPath);
          } else if (node.url) {
            index.set(String(node.id), path);
          }
        }
      }

      traverse(treeNodes, []);
      _bookmarkFolderIndex = index;
      _bookmarkFolderIndexAt = now;
      resolve(index);
    });
  });
}

function scopedNodesByArgs(graphData, args) {
  args = args || {};
  var nodes = Array.isArray(graphData.nodes) ? graphData.nodes.slice() : [];

  var folderQuery = args.folder ? String(args.folder).trim() : '';
  var categoryQuery = args.category ? String(args.category).trim() : '';

  // 兼容上层可能传入的 "@xxx" / "#xxx"
  folderQuery = folderQuery.replace(/^@/, '');
  categoryQuery = categoryQuery.replace(/^#/, '');

  if (categoryQuery) {
    var catLower = categoryQuery.toLowerCase();
    nodes = nodes.filter(function(n) {
      var c = n && n.category ? String(n.category) : '';
      return c === categoryQuery || c.toLowerCase().includes(catLower);
    });
  }

  if (folderQuery) {
    // 按文件夹路径片段包含匹配（例如目录名 “JARVIS”）
    var folderLower = folderQuery.toLowerCase();
    return getBookmarkFolderIndex().then(function(folderIndex) {
      return nodes.filter(function(n) {
        var id = n && n.id != null ? String(n.id) : '';
        var path = folderIndex.get(id);
        if (!path || path.length === 0) return false;
        for (var i = 0; i < path.length; i++) {
          if (String(path[i]).toLowerCase().includes(folderLower)) return true;
        }
        return false;
      });
    });
  }

  return Promise.resolve(nodes);
}

function normalizeEdgeId(x) {
  if (x == null) return '';
  if (typeof x === 'object' && x.id != null) return String(x.id);
  return String(x);
}

async function handleNativeToolCall(msg) {
  var name = msg.name;
  var args = msg.arguments || {};
  var graphData = await getGraphData();
  if (!graphData || !graphData.nodes) {
    return { error: '未加载图谱数据' };
  }

  // 先做范围裁剪，再执行具体工具
  var scoped = await scopedNodesByArgs(graphData, args);

  if (name === 'search_bookmarks') {
    var keywordRaw = args.keyword != null ? String(args.keyword) : '';
    var keyword = keywordRaw.trim().toLowerCase();
    var limit = Math.max(1, Math.min(parseInt(args.limit, 10) || 10, 50));

    var results;
    if (!keyword) {
      results = scoped;
    } else {
      results = scoped.filter(function(n) {
        var label = n && n.label ? String(n.label).toLowerCase() : '';
        if (label.includes(keyword)) return true;
        var tags = n && n.tags ? n.tags : [];
        for (var i = 0; i < tags.length; i++) {
          if (String(tags[i]).toLowerCase().includes(keyword)) return true;
        }
        var cat = n && n.category ? String(n.category).toLowerCase() : '';
        if (cat.includes(keyword)) return true;
        return false;
      }).slice(0, limit);
    }

    return {
      success: true,
      scope: { folder: args.folder || null, category: args.category || null },
      matched: results.length,
      results: results.map(function(r) {
        return { title: r.label, url: r.url, category: r.category };
      })
    };
  }

  if (name === 'get_graph_stats') {
    var nodes = scoped;
    var nodeIdSet = new Set(nodes.map(function(n) { return String(n.id); }));
    var edges = Array.isArray(graphData.edges) ? graphData.edges : [];
    var scopedEdges = edges.filter(function(e) {
      var s = normalizeEdgeId(e.source);
      var t = normalizeEdgeId(e.target);
      return nodeIdSet.has(s) && nodeIdSet.has(t);
    });

    return {
      success: true,
      scope: { folder: args.folder || null, category: args.category || null },
      total_nodes: nodes.length,
      total_edges: scopedEdges.length,
      categories: Array.from(new Set(nodes.map(function(n) { return n.category; }))).filter(Boolean)
    };
  }

  if (name === 'open_url') {
    if (!args || !args.url) return { error: 'url 不能为空' };
    chrome.tabs.create({ url: args.url });
    return { success: true, message: 'opened: ' + args.url };
  }

  return { error: '未知工具: ' + name };
}

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

  if (request.action === 'setMcpBridgeEnabled') {
    var enabled = !!request.enabled;
    if (!enabled) {
      if (nativePort) {
        try { nativePort.disconnect(); } catch (e) {}
      }
      nativePort = null;
      sendResponse({ success: true });
      return false;
    }

    ensureNativePort().then(function() {
      sendResponse({ success: true });
    }).catch(function(err) {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'testMcpBridge') {
    ensureNativePort().then(function(port) {
      var id = Date.now() + '_' + Math.random().toString(16).slice(2);
      return new Promise(function(resolve, reject) {
        pendingNative[id] = { resolve: resolve, reject: reject };
        try {
          port.postMessage({ type: 'ping', id: id });
          setTimeout(function() {
            if (pendingNative[id]) {
              delete pendingNative[id];
              reject(new Error('timeout'));
            }
          }, 3000);
        } catch (e) {
          delete pendingNative[id];
          reject(e);
        }
      });
    }).then(function(result) {
      sendResponse({ success: true, result: result });
    }).catch(function(err) {
      sendResponse({ success: false, error: err.message });
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
