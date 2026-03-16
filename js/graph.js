// graph.js - D3.js 力导向图谱可视化 (ES5 兼容版本)

var graphData = null;
var simulation = null;
var svg = null;
var g = null;
var width, height;
var activeCategories = new Set();

// 颜色分配
var categoryColors = {};
var colorPalette = [
  '#00d9ff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3',
  '#f38181', '#aa96da', '#fcbad3', '#a8d8ea', '#f9ed69',
  '#6a0572', '#ab83a1', '#e84a5f', '#2a363b', '#99b898',
  '#ff847c', '#45b7d1', '#96ceb4', '#ffeead', '#ffcc5c'
];

// 空状态显示/隐藏
function showEmptyState() {
  var emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.classList.add('show');
}

function hideEmptyState() {
  var emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.classList.remove('show');
}

// 页面加载时初始化
function initPage() {
  console.log('initPage called, document.readyState:', document.readyState);

  // 绑定按钮事件
  var reloadBtn = document.getElementById('reloadGraph');
  var resetBtn = document.getElementById('resetView');
  var settingsBtn = document.getElementById('openSettings');
  var goToSettingsBtn = document.getElementById('goToSettings');
  var analyzeBtn = document.getElementById('analyzeBookmarks');

  console.log('Buttons found:', { reloadBtn: reloadBtn, resetBtn: resetBtn, settingsBtn: settingsBtn, goToSettingsBtn: goToSettingsBtn, analyzeBtn: analyzeBtn });

  if (reloadBtn) reloadBtn.addEventListener('click', function() { loadGraphData(); checkSyncStatus(); });
  if (resetBtn) resetBtn.addEventListener('click', resetViewFn);
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (goToSettingsBtn) goToSettingsBtn.addEventListener('click', openSettings);
  if (analyzeBtn) analyzeBtn.addEventListener('click', doAnalyzeFull);

  var pauseBtn = document.getElementById('pauseAnalysis');
  if (pauseBtn) pauseBtn.addEventListener('click', function() {
    analyzing = false;
    analyzeStatusText = '已暂停 — 进度已保存，再次点击分析可继续';
    updateAnalyzeButton(false, false);
    checkSyncStatus();
  });

  // 页面加载时先获取书签总数
  loadBookmarkCount();
  loadRightSidebarStats();
  loadGraphData();
  checkSyncStatus();
}

// 使用多种方式确保页面加载后执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  console.log('Document already loaded, calling initPage directly');
  initPage();
}

function openSettings() {
  chrome.tabs.create({ url: 'settings.html' }, function(tab) {
    if (chrome.runtime.lastError) {
      console.error('Failed to open settings:', chrome.runtime.lastError);
    }
  });
}

// 加载书签总数
function loadBookmarkCount() {
  chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
    var count = 0;
    function traverse(nodes) {
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.url) count++;
        if (node.children) traverse(node.children);
      }
    }
    traverse(bookmarkTreeNodes);
    var el = document.getElementById('bookmarkCount');
    if (el) el.textContent = count;
  });
}

function loadGraphData() {
  console.log('Loading graph data...');
  showLoading();

  return new Promise(function(resolve) {
    chrome.storage.local.get(['graphData'], function(result) {
      console.log('Storage result:', result);
      graphData = result.graphData;

      if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
        console.log('No graph data, showing empty state');
        showEmptyState();
      } else {
        console.log('Graph data loaded, initializing with', graphData.nodes.length, 'nodes');
        hideEmptyState();
        initGraph(graphData);
      }
      resolve();
    });
  });
}

function showLoading() {
  var graph = document.getElementById('graph');
  if (graph) {
    graph.innerHTML = '<div class="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">' +
      '<i class="fas fa-circle-notch fa-spin text-4xl text-cyan-500 mb-4"></i>' +
      '<p class="text-slate-400">正在加载图谱...</p>' +
      '</div>';
  }
}

function initGraph(data) {
  var graphContainer = document.getElementById('graph');
  graphContainer.innerHTML = '';

  var container = graphContainer.parentElement;
  width = container.clientWidth;
  height = container.clientHeight;

  assignColors(data);
  updateStats(data);
  createCategoryFilters(data);

  svg = d3.select('#graph')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height]);

  var zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', function(event) {
      g.attr('transform', event.transform);
    });

  svg.call(zoom);
  g = svg.append('g');

  // 创建箭头标记
  svg.append('defs').selectAll('marker')
    .data(['end'])
    .join('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 25)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('fill', '#475569')
    .attr('d', 'M0,-5L10,0L0,5');

  var nodes = data.nodes.map(function(node) {
    return Object.assign({}, node, {
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0
    });
  });

  var links = data.edges || [];

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(function(d) { return d.id; }).distance(150))
    .force('charge', d3.forceManyBody().strength(-500))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(30).strength(0.7));

  // 绘制连线
  var link = g.append('g')
    .attr('class', 'links')
    .selectAll('g')
    .data(links)
    .join('g')
    .attr('class', 'link');

  link.append('line')
    .attr('stroke', '#475569')
    .attr('stroke-width', 1.5)
    .attr('marker-end', 'url(#arrow)');

  link.append('text')
    .attr('class', 'link-label')
    .attr('text-anchor', 'middle')
    .attr('dy', -5)
    .attr('fill', '#64748b')
    .attr('font-size', '9px')
    .text(function(d) { return truncateText(d.relation || '', 20); });

  // 绘制节点
  var node = g.append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // 节点圆圈 - 添加光晕效果
  node.append('circle')
    .attr('r', 20)
    .attr('fill', function(d) { return categoryColors[d.category] || '#64748b'; })
    .attr('stroke', '#1e293b')
    .attr('stroke-width', 3)
    .style('filter', 'drop-shadow(0 0 8px currentColor)');

  // 节点标签
  node.append('text')
    .attr('dy', 35)
    .attr('text-anchor', 'middle')
    .attr('fill', '#e2e8f0')
    .attr('font-size', '11px')
    .attr('font-weight', '500')
    .attr('text-shadow', '0 1px 3px rgba(0,0,0,0.8)')
    .text(function(d) { return truncateText(d.label, 10); })
    .style('pointer-events', 'none');

  // 节点点击事件
  node.on('click', function(event, d) {
    if (d.url) chrome.tabs.create({ url: d.url });
  });

  // 节点悬停事件
  var tooltip = document.getElementById('nodeTooltip');
  var nodeConnections = {};
  links.forEach(function(link) {
    var sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    var targetId = typeof link.target === 'object' ? link.target.id : link.target;
    nodeConnections[sourceId] = (nodeConnections[sourceId] || 0) + 1;
    nodeConnections[targetId] = (nodeConnections[targetId] || 0) + 1;
  });

  node.on('mouseover', function(event, d) {
    var connectionCount = nodeConnections[d.id] || 0;
    tooltip.querySelector('.tooltip-title').textContent = d.label || '未命名';
    tooltip.querySelector('.tooltip-url').textContent = d.url || '无 URL';
    tooltip.querySelector('.tooltip-category').textContent = d.category || '未分类';
    tooltip.querySelector('.tooltip-connections').textContent = connectionCount;

    // Summary (if exists)
    var summaryEl = tooltip.querySelector('.tooltip-summary');
    if (d.summary) {
      summaryEl.textContent = d.summary;
      summaryEl.classList.remove('hidden');
    } else {
      summaryEl.classList.add('hidden');
    }

    // Sub-domain
    var subDomainWrap = tooltip.querySelector('.tooltip-subdomain-wrap');
    if (d.sub_domain) {
      tooltip.querySelector('.tooltip-subdomain').textContent = d.sub_domain;
      subDomainWrap.classList.remove('hidden');
    } else {
      subDomainWrap.classList.add('hidden');
    }

    // Format
    var formatWrap = tooltip.querySelector('.tooltip-format-wrap');
    if (d.format) {
      tooltip.querySelector('.tooltip-format').textContent = d.format;
      formatWrap.classList.remove('hidden');
    } else {
      formatWrap.classList.add('hidden');
    }

    // Tags
    var tagsContainer = tooltip.querySelector('.tooltip-tags-container');
    tagsContainer.innerHTML = '';
    if (d.tags && d.tags.length > 0) {
      d.tags.forEach(function(tag) {
        var badge = document.createElement('span');
        badge.className = 'px-1.5 py-0.5 bg-slate-700 text-cyan-400 rounded text-xs border border-slate-600';
        badge.textContent = tag;
        tagsContainer.appendChild(badge);
      });
      tagsContainer.classList.remove('hidden');
    } else {
      tagsContainer.classList.add('hidden');
    }

    tooltip.classList.remove('opacity-0');
    tooltip.classList.add('opacity-100');
  });

  node.on('mousemove', function(event) {
    tooltip.style.left = (event.pageX + 15) + 'px';
    tooltip.style.top = (event.pageY - 10) + 'px';
  });

  node.on('mouseout', function() {
    tooltip.classList.add('opacity-0');
    tooltip.classList.remove('opacity-100');
  });

  // 更新位置
  simulation.on('tick', function() {
    link.select('line')
      .attr('x1', function(d) { return d.source.x; })
      .attr('y1', function(d) { return d.source.y; })
      .attr('x2', function(d) { return d.target.x; })
      .attr('y2', function(d) { return d.target.y; });

    link.select('text')
      .attr('x', function(d) { return (d.source.x + d.target.x) / 2; })
      .attr('y', function(d) { return (d.source.y + d.target.y) / 2; });

    node.attr('transform', function(d) { return 'translate(' + d.x + ', ' + d.y + ')'; });
  });

  window.currentNodes = nodes;
  window.currentLinks = links;
}

function assignColors(data) {
  var categories = data.categories || [];
  var usedColors = new Set();

  categories.forEach(function(cat) {
    if (cat.color) {
      categoryColors[cat.name] = cat.color;
      usedColors.add(cat.color);
    }
  });

  var colorIndex = 0;
  data.nodes.forEach(function(node) {
    if (node.category && !categoryColors[node.category]) {
      while (usedColors.has(colorPalette[colorIndex])) {
        colorIndex = (colorIndex + 1) % colorPalette.length;
      }
      categoryColors[node.category] = colorPalette[colorIndex];
      usedColors.add(colorPalette[colorIndex]);
    }
  });
}

function updateStats(data) {
  document.getElementById('nodeCount').textContent = data.nodes.length;
  document.getElementById('edgeCount').textContent = (data.edges || []).length;
  document.getElementById('categoryCount').textContent = new Set(data.nodes.map(function(n) { return n.category; })).size;
  updateLinkStats(data);
}

// 更新链接统计
function updateLinkStats(data) {
  var linkStatsContainer = document.getElementById('linkStats');
  var nodes = data.nodes || [];
  var edges = data.edges || [];

  var connectionCount = {};
  nodes.forEach(function(node) { connectionCount[node.id] = 0; });
  edges.forEach(function(edge) {
    if (connectionCount[edge.source] !== undefined) connectionCount[edge.source]++;
    if (connectionCount[edge.target] !== undefined) connectionCount[edge.target]++;
  });

  var statsArray = Object.entries(connectionCount)
    .map(function(entry) {
      var id = entry[0];
      var count = entry[1];
      var node = nodes.find(function(n) { return n.id === id; });
      return { id: id, label: node ? node.label : '未知', category: node ? node.category : '未分类', url: node ? node.url : '', count: count };
    })
    .filter(function(item) { return item.count > 0; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 10);

  if (statsArray.length === 0) {
    linkStatsContainer.innerHTML = '<div class="text-center text-slate-500 text-xs py-4">暂无连接数据</div>';
    return;
  }

  var maxCount = statsArray[0].count;

  var html = '';
  for (var i = 0; i < statsArray.length; i++) {
    var item = statsArray[i];
    var rankClass = 'bg-slate-600 text-cyan-400';
    if (i === 0) rankClass = 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black';
    else if (i === 1) rankClass = 'bg-gradient-to-br from-gray-300 to-gray-500 text-black';
    else if (i === 2) rankClass = 'bg-gradient-to-br from-amber-600 to-amber-800 text-white';

    html += '<div class="link-stat-item flex items-center gap-2 p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg cursor-pointer transition group" data-node-id="' + item.id + '">' +
      '<div class="link-stat-rank w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ' + rankClass + '">' + (i + 1) + '</div>' +
      '<div class="flex-1 min-w-0">' +
      '<div class="link-stat-label text-xs font-medium text-slate-200 truncate group-hover:text-white">' + item.label + '</div>' +
      '<div class="link-stat-bar h-1 bg-slate-600 rounded-full mt-1 overflow-hidden">' +
      '<div class="link-stat-bar-fill h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" style="width: ' + ((item.count / maxCount) * 100) + '%"></div>' +
      '</div></div>' +
      '<div class="link-stat-count text-sm font-bold text-cyan-400">' + item.count + '</div></div>';
  }
  linkStatsContainer.innerHTML = html;

  linkStatsContainer.querySelectorAll('.link-stat-item').forEach(function(item) {
    item.addEventListener('click', function() { highlightNode(item.dataset.nodeId); });
  });
}

// 高亮指定节点
function highlightNode(nodeId) {
  g.selectAll('.node').each(function(d) {
    var isTarget = d.id === nodeId;
    d3.select(this).attr('opacity', isTarget ? 1 : 0.15);
  });
}

function createCategoryFilters(data) {
  var filtersContainer = document.getElementById('categoryFilters');
  var categories = [];
  data.nodes.forEach(function(n) {
    if (n.category && categories.indexOf(n.category) === -1) categories.push(n.category);
  });

  activeCategories = new Set(categories);

  var html = '';
  for (var i = 0; i < categories.length; i++) {
    var cat = categories[i];
    html += '<label class="category-filter inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-full text-xs cursor-pointer transition border-2 border-transparent hover:border-cyan-500" data-category="' + cat + '">' +
      '<input type="checkbox" checked class="hidden" value="' + cat + '">' +
      '<span class="category-color w-3 h-3 rounded-full" style="background: ' + (categoryColors[cat] || '#64748b') + '"></span>' +
      '<span class="category-name text-slate-300">' + cat + '</span></label>';
  }
  filtersContainer.innerHTML = html;

  filtersContainer.querySelectorAll('.category-filter').forEach(function(filter) {
    filter.addEventListener('click', function(e) {
      var checkbox = filter.querySelector('input');
      checkbox.checked = !checkbox.checked;
      if (checkbox.checked) {
        activeCategories.add(filter.dataset.category);
        filter.classList.add('border-cyan-500');
      } else {
        activeCategories.delete(filter.dataset.category);
        filter.classList.remove('border-cyan-500');
      }
      filterNodes();
    });
  });

  // 创建图例
  var legendContainer = document.getElementById('legend');
  var legendHtml = '';
  for (var i = 0; i < categories.length; i++) {
    var cat = categories[i];
    legendHtml += '<div class="legend-item flex items-center gap-2">' +
      '<span class="legend-color w-4 h-4 rounded" style="background: ' + (categoryColors[cat] || '#64748b') + '"></span>' +
      '<span class="text-sm text-slate-300">' + cat + '</span></div>';
  }
  legendContainer.innerHTML = legendHtml;
}

function filterNodes() {
  g.selectAll('.node').each(function(d) {
    var isVisible = activeCategories.has(d.category) || !d.category;
    d3.select(this).attr('opacity', isVisible ? 1 : 0.1);
  });

  g.selectAll('.link').each(function(d) {
    var sourceCat = d.source.category;
    var targetCat = d.target.category;
    var isVisible = activeCategories.has(sourceCat) && activeCategories.has(targetCat);
    d3.select(this).attr('opacity', isVisible ? 1 : 0.05);
  });
}

function resetViewFn() {
  svg.transition().duration(750).call(
    d3.zoom().transform,
    d3.zoomIdentity,
    d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
  );
}

// 拖拽事件处理
function dragstarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragended(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

window.addEventListener('resize', function() {
  if (!graphData) return;
  var container = document.getElementById('graph').parentElement;
  width = container.clientWidth;
  height = container.clientHeight;
  svg.attr('width', width).attr('height', height);
  simulation.force('center', d3.forceCenter(width / 2, height / 2));
  simulation.alpha(0.3).restart();
});

// 加载右侧边栏统计信息（一级目录创建时间和按年份统计）
function loadRightSidebarStats() {
  chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
    var firstLevelFolders = [];
    var yearCounts = {};

    function traverseForYears(nodes) {
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.url && node.dateAdded) {
          var year = new Date(node.dateAdded).getFullYear();
          yearCounts[year] = (yearCounts[year] || 0) + 1;
        }
        if (node.children) {
          traverseForYears(node.children);
        }
      }
    }

    bookmarkTreeNodes.forEach(function(rootNode) {
      if (rootNode.children) {
        rootNode.children.forEach(function(baseCategory) {
          if (baseCategory.children) {
            baseCategory.children.forEach(function(item) {
              if (!item.url) { // Identify as folder
                 firstLevelFolders.push({
                   title: item.title || '未命名',
                   dateAdded: item.dateAdded
                 });
              }
            });
          }
        });
      }
    });

    traverseForYears(bookmarkTreeNodes);

    // 渲染目录（按创建时间倒序排）
    firstLevelFolders.sort(function(a, b) { return b.dateAdded - a.dateAdded; });
    var dirHtml = '';
    if (firstLevelFolders.length === 0) {
      dirHtml = '<div class="text-slate-500 text-xs text-center py-2">无目录</div>';
    } else {
      for (var i = 0; i < firstLevelFolders.length; i++) {
        var d = firstLevelFolders[i];
        var dateStr = d.dateAdded ? new Date(d.dateAdded).toLocaleDateString() : '未知';
        dirHtml += '<div class="flex justify-between items-center py-2 border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30 -mx-2 px-2 rounded transition cursor-default">' +
          '<span class="text-slate-300 truncate pr-2 text-xs" title="' + d.title + '">' + d.title + '</span>' +
          '<span class="text-[10px] text-slate-500 whitespace-nowrap">' + dateStr + '</span>' +
          '</div>';
      }
    }
    var dirEl = document.getElementById('dirTimeStats');
    if (dirEl) dirEl.innerHTML = dirHtml;

    // 渲染年份统计
    var years = Object.keys(yearCounts).sort(function(a, b) { return b - a; });
    var yearHtml = '';
    if (years.length === 0) {
      yearHtml = '<div class="text-slate-500 text-xs text-center py-2">无收藏记录</div>';
    } else {
      var maxCount = 0;
      for (var k = 0; k < years.length; k++) {
        if (yearCounts[years[k]] > maxCount) maxCount = yearCounts[years[k]];
      }

      for (var j = 0; j < years.length; j++) {
        var y = years[j];
        var count = yearCounts[y];
        var pct = (count / maxCount) * 100;
        yearHtml += '<div class="flex items-center gap-3 py-1.5">' +
          '<span class="text-slate-400 w-8 text-xs font-medium">' + y + '</span>' +
          '<div class="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">' +
          '<div class="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" style="width: ' + pct + '%"></div>' +
          '</div>' +
          '<span class="text-cyan-400 text-xs w-6 text-right font-bold">' + count + '</span>' +
          '</div>';
      }
    }
    var yearEl = document.getElementById('yearStats');
    if (yearEl) yearEl.innerHTML = yearHtml;
  });
}

// 书签分析及同步功能逻辑
var analyzing = false;
var analyzeStatusText = '';

function checkSyncStatus() {
  Promise.all([
    fetchBookmarks(),
    new Promise(function(resolve) {
      chrome.storage.local.get(['graphData', 'analysisProgress'], function(res) { resolve(res); });
    })
  ]).then(function(results) {
    var allBookmarks = results[0];
    var storageRes = results[1];
    var graphData = storageRes.graphData;
    var analysisProgress = storageRes.analysisProgress;
    var syncStatusEl = document.getElementById('syncStatus');
    if (!syncStatusEl) return;

    // 如果处于全量任务被打断的中断状态
    if (analysisProgress && analysisProgress.currentIndex < analysisProgress.total) {
       syncStatusEl.innerHTML = '<div class="flex flex-col gap-2">' +
        '<div class="flex items-center text-xs text-orange-400">' +
          '<i class="fas fa-hammer mr-1.5 align-middle"></i>' +
          '<span class="leading-tight">存在未完成的全量构建任务，暂不可用增量同步，请点击下方继续分析。</span>' +
        '</div>' +
      '</div>';
      return;
    }

    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
       syncStatusEl.innerHTML = '<div class="flex items-center text-xs text-slate-400"><i class="fas fa-inbox text-slate-500 mr-2"></i>暂无图谱数据</div>';
       return;
    }

    var currentIds = new Set(graphData.nodes.map(function(n) { return String(n.id); }));
    var actualIds = new Set(allBookmarks.map(function(b) { return String(b.id); }));
    
    var deletedIds = new Set();
    currentIds.forEach(function(id) {
       if (!actualIds.has(id)) deletedIds.add(id);
    });

    var newBookmarks = allBookmarks.filter(function(b) { return !currentIds.has(String(b.id)); });
    
    if (newBookmarks.length === 0 && deletedIds.size === 0) {
      syncStatusEl.innerHTML = '<div class="flex items-center text-xs text-green-400"><i class="fas fa-check-circle mr-2"></i>图谱已完全同步最新书签</div>';
    } else {
      var msg = [];
      if (newBookmarks.length > 0) msg.push(newBookmarks.length + ' 个新收藏');
      if (deletedIds.size > 0) msg.push(deletedIds.size + ' 个失效书签');

      syncStatusEl.innerHTML = '<div class="flex flex-col gap-2">' +
        '<div class="flex items-center text-xs text-yellow-400">' +
          '<i class="fas fa-exclamation-circle mr-1.5 align-middle"></i>' +
          '<span class="leading-tight">发现 ' + msg.join('，') + '未同步记录</span>' +
        '</div>' +
        '<button id="syncBookmarksBtn" class="w-full py-2 px-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-xs font-medium rounded-lg transition shadow-md hover:shadow-lg flex items-center justify-center gap-2">' +
          '<i class="fas fa-magic"></i>一键增量同步图谱' +
        '</button>' +
      '</div>';
      
      document.getElementById('syncBookmarksBtn').addEventListener('click', function() {
         doAnalyzeIncremental(newBookmarks, deletedIds, graphData);
      });
    }
  });
}

function showConfirm(message) {
  return new Promise(function(resolve) {
    var modal = document.getElementById('customModal');
    var container = document.getElementById('modalContainer');
    var messageEl = document.getElementById('modalMessage');
    var confirmBtn = document.getElementById('modalConfirm');
    var cancelBtn = document.getElementById('modalCancel');

    messageEl.textContent = message;
    modal.classList.remove('hidden');
    
    // 强制重绘以触发动画
    setTimeout(function() {
      container.classList.remove('scale-95', 'opacity-0');
      container.classList.add('scale-100', 'opacity-100');
    }, 10);

    function close(result) {
      container.classList.remove('scale-100', 'opacity-100');
      container.classList.add('scale-95', 'opacity-0');
      setTimeout(function() {
        modal.classList.add('hidden');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve(result);
      }, 200);
    }

    confirmBtn.onclick = function() { close(true); };
    cancelBtn.onclick = function() { close(false); };
  });
}

function doAnalyzeFull() {
  if (analyzing) return;
  
  chrome.storage.local.get(['analysisProgress', 'tempGraphData'], function(result) {
    var progress = result.analysisProgress;
    var tempGraph = result.tempGraphData;

    var startNew = function() {
      showConfirm('这将清空现有图谱数据，采用分批处理消耗Token进行全量分析。\n整个过程可能持续几分钟，确认继续吗？').then(function(confirmed) {
        if (!confirmed) return;
        
        chrome.storage.local.remove(['analysisProgress', 'tempGraphData'], function() {
          fetchBookmarks().then(function(bookmarks) {
            startBatchAnalysis(bookmarks);
          });
        });
      });
    };

    if (progress && tempGraph && progress.currentIndex < progress.total) {
      var currentDone = (parseInt(progress.offsetCount) || 0) + progress.currentIndex;
      var totalToDone = parseInt(progress.absoluteTotal) || progress.total;
      
      showConfirm('检测到上次有未完成的分析任务（进度 ' + currentDone + '/' + totalToDone + '），是否继续执行？\n点击"确定"继续，点击"取消"重新开始。').then(function(resume) {
        if (resume) {
          fetchBookmarks().then(function(bookmarks) {
            resumeBatchAnalysis(bookmarks, progress, tempGraph);
          });
        } else {
          startNew();
        }
      });
    } else {
      startNew();
    }
  });
}

function doAnalyzeIncremental(newBookmarks, deletedIds, currentGraphData) {
  if (analyzing) return;
  
  if (newBookmarks.length === 0 && deletedIds.size > 0) {
    analyzeStatusText = '清理失效节点...';
    updateAnalyzeButton();
    setTimeout(function() {
      finishIncrementalUpdate(currentGraphData, deletedIds, null);
    }, 500);
    return;
  }
  
  // 增量暂时保留原来的一把梭请求（因为数量通常很少），加上中断检查
  performAnalysisSingleRequest(newBookmarks, true, deletedIds, currentGraphData);
}

// 启动全量分批分析
function startBatchAnalysis(targetBookmarks) {
  analyzing = true;
  analyzeStatusText = '初始化分析队列...';
  updateAnalyzeButton();

  chrome.storage.sync.get(['aiProvider', 'apiKey', 'apiEndpoint', 'modelName', 'batchSize'], function(config) {
    if (!config.apiKey) {
      analyzing = false;
      analyzeStatusText = '请先在"AI 接口配置"中填写 API Key！';
      updateAnalyzeButton(true);
      return;
    }

    var batchSize = parseInt(config.batchSize) || 50;
    var total = targetBookmarks.length;
    var initialProgress = { currentIndex: 0, total: total };
    var initialGraphData = { nodes: [], edges: [], categories: [] };

    hideEmptyState(); // 全量分析开始，直接进入纯净图谱加载状态
    
    chrome.storage.local.set({
      analysisProgress: initialProgress,
      tempGraphData: initialGraphData
    }, function() {
      processNextBatch(targetBookmarks, config, initialProgress, initialGraphData);
    });
  });
}

// 恢复全量分批分析（包含对中断期间增删的排雷纠偏）
function resumeBatchAnalysis(targetBookmarks, progress, tempGraphData) {
  analyzing = true;
  analyzeStatusText = '校验中断期间的书签变动...';
  updateAnalyzeButton();

  // 1. 获取现在真实的 ID 集合
  var actualIds = new Set(targetBookmarks.map(function(b) { return String(b.id); }));
  
  // 2. 拿到旧的、已经分析好的半成品 ID 集合
  var tempIds = new Set(tempGraphData.nodes.map(function(n) { return String(n.id); }));

  // 3. 找出停工期间“被删掉”的节点：在 tempIds 里，但不在 actualIds 里
  var deletedIdsArr = [];
  tempIds.forEach(function(id) {
    if (!actualIds.has(id)) deletedIdsArr.push(id);
  });
  var deletedSet = new Set(deletedIdsArr);

  // 如果有被删的，从 tempGraphData 里把节点和连线剔除
  if (deletedSet.size > 0) {
    tempGraphData.nodes = tempGraphData.nodes.filter(function(n) { return !deletedSet.has(String(n.id)); });
    tempGraphData.edges = (tempGraphData.edges || []).filter(function(e) {
       var sMsg = typeof e.source === 'object' ? String(e.source.id) : String(e.source);
       var tMsg = typeof e.target === 'object' ? String(e.target.id) : String(e.target);
       return !deletedSet.has(sMsg) && !deletedSet.has(tMsg);
    });
    // 更新清存后的集合
    tempIds = new Set(tempGraphData.nodes.map(function(n) { return String(n.id); }));
  }

  // 4. 重构待分析队列：用目前所有新鲜的书签，扣除掉 tempGraphData 里面已经拥有且活着的那些节点
  var newPendingQueue = targetBookmarks.filter(function(b) {
     return !tempIds.has(String(b.id));
  });

  // 5. 重置分析游标：为了正确显示进度，我们不是从 0 开始。
  // 我们真正需要处理的是 newPendingQueue，为了在界面上让用户看到“接着扫”的进度感：
  // 我们将 targetBookmarks 替换为 newPendingQueue，而进度条我们加上已完成的数量（即目前的 tempGraphData.nodes.length）作为偏移基数
  var completedCount = tempGraphData.nodes.length;
  progress.currentIndex = 0; 
  progress.total = newPendingQueue.length;
  // 给 progress 打上一个特殊标记，让界面显示的时候知道要加上偏移量
  progress.offsetCount = completedCount;
  progress.absoluteTotal = completedCount + newPendingQueue.length;
  // 直接保存纠偏后的进度和数据，防止还没开始又退出了
  chrome.storage.local.set({
     analysisProgress: progress,
     tempGraphData: tempGraphData
  });

  analyzeStatusText = '恢复队列：排雷 ' + deletedSet.size + ' 个失效书签，剩 ' + progress.total + ' 篇待测...';
  updateAnalyzeButton();
  
  chrome.storage.sync.get(['aiProvider', 'apiKey', 'apiEndpoint', 'modelName', 'batchSize'], function(config) {
    // 短暂延迟让用户看到状态变化，并开启真正的下一批次递归
    setTimeout(function() {
       processNextBatch(newPendingQueue, config, progress, tempGraphData);
    }, 1000);
  });
}

// 核心递归：处理下一个分批
function processNextBatch(targetBookmarks, config, progress, tempGraph) {
  if (!analyzing) return; // 如果被外部强行中止

  if (progress.currentIndex >= progress.total) {
    // 所有批次完成
    chrome.storage.local.set({ graphData: tempGraph }, function() {
      chrome.storage.local.remove(['analysisProgress', 'tempGraphData'], function() {
        analyzing = false;
        analyzeStatusText = '全量图谱构建完毕！';
        updateAnalyzeButton(false, true);
        loadGraphData();
        checkSyncStatus();
      });
    });
    return;
  }

  var batchSize = parseInt(config.batchSize) || 50;
  var batchEnd = Math.min(progress.currentIndex + batchSize, progress.total);
  var currentBatch = targetBookmarks.slice(progress.currentIndex, batchEnd);

  var displayCurrent = (progress.offsetCount || 0) + progress.currentIndex;
  var displayEnd = (progress.offsetCount || 0) + batchEnd;
  var displayTotal = progress.absoluteTotal || progress.total;

  analyzeStatusText = '正在分析批次: ' + displayCurrent + ' - ' + displayEnd + ' / ' + displayTotal;
  updateAnalyzeButton();

  var provider = config.aiProvider || 'deepseek';
  var defaultProviders = {
    deepseek: { endpoint: 'https://api.deepseek.com', model: 'deepseek-chat' },
    siliconflow: { endpoint: 'https://api.siliconflow.cn', model: 'deepseek-ai/DeepSeek-V3' },
    openai: { endpoint: 'https://api.openai.com', model: 'gpt-4o-mini' },
    anthropic: { endpoint: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
    custom: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'claude-sonnet-4-20250514' }
  };

  var endpoint = config.apiEndpoint || (defaultProviders[provider] ? defaultProviders[provider].endpoint : 'https://api.deepseek.com');
  var model = config.modelName || (defaultProviders[provider] ? defaultProviders[provider].model : 'deepseek-chat');

  // 由于 AI Service 类可以直接调，我们让它直接在前端发 Fetch
  if (window.aiService) {
    window.aiService.analyzeBookmarks(currentBatch).then(function(result) {
      var newAiData = result; // AIService 已经帮我们 parse 好了
      if (newAiData.nodes && newAiData.nodes.length > 0) {
        var existingNodes = tempGraph.nodes;
        var existingCategoriesMap = new Map();
        
        // 构建已有分类映射
        tempGraph.categories.forEach(function(c) {
          existingCategoriesMap.set(c.name, c);
        });

        newAiData.nodes.forEach(function(newNode) {
          tempGraph.nodes.push(newNode);
          
          if (newNode.category) {
            // 自动生成 Category 及颜色（如果不存在）
            if (!existingCategoriesMap.has(newNode.category)) {
               var hue = Math.floor(Math.random() * 360);
               var color = 'hsl(' + hue + ', 70%, 50%)';
               var newCategory = { name: newNode.category, color: color };
               tempGraph.categories.push(newCategory);
               existingCategoriesMap.set(newNode.category, newCategory);
            }
            
            // 自动生成 Edges 基于 Tags 重叠：最多连 5 条，优先连共同标签最多的节点
            var tagSet = new Set(newNode.tags || []);
            if (tagSet.size > 0) {
              var peerScores = [];
              for (var i = 0; i < existingNodes.length; i++) {
                var peerNode = existingNodes[i];
                if (peerNode.id === newNode.id) continue;
                var sharedTags = (peerNode.tags || []).filter(function(t) { return tagSet.has(t); });
                if (sharedTags.length > 0) {
                  peerScores.push({ peer: peerNode, shared: sharedTags });
                }
              }
              // 按共同标签数量降序排序
              peerScores.sort(function(a, b) { return b.shared.length - a.shared.length; });
              var edgeLimit = Math.min(5, peerScores.length);
              for (var j = 0; j < edgeLimit; j++) {
                tempGraph.edges.push({
                  source: newNode.id,
                  target: peerScores[j].peer.id,
                  relation: peerScores[j].shared.slice(0, 2).join(', ')
                });
              }
            } else if (newNode.category) {
              // 如果该节点没有 tags （老数据兼容），回退到按 category 连线
              var peerCount = 0;
              for (var k = existingNodes.length - 1; k >= 0 && peerCount < 3; k--) {
                var catPeer = existingNodes[k];
                if (catPeer.id !== newNode.id && catPeer.category === newNode.category) {
                  tempGraph.edges.push({ source: newNode.id, target: catPeer.id, relation: '同一主题' });
                  peerCount++;
                }
              }
            }
          }
        });
      }

      // 每次拿到新数据立刻在前端通过 D3.js 重新渲染（满足用户的实时反馈需求）
      graphData = JSON.parse(JSON.stringify(tempGraph)); // 深拷贝防止污染
      if (graphData.nodes.length > 0) {
         hideEmptyState();
         initGraph(graphData);
      }

      // 推进游标并持久化进度
      progress.currentIndex = batchEnd;

      // 如果刚跑完最后一批，直接转正，不用再等下一次轮询来结束它
      if (progress.currentIndex >= progress.total) {
        chrome.storage.local.set({ graphData: tempGraph }, function() {
          chrome.storage.local.remove(['analysisProgress', 'tempGraphData'], function() {
            analyzing = false;
            analyzeStatusText = '全量图谱构建完毕！';
            updateAnalyzeButton(false, true);
            loadGraphData();
            checkSyncStatus();
          });
        });
        return;
      }

      // 还没跑完，保存半成品进度
      chrome.storage.local.set({
        analysisProgress: progress,
        tempGraphData: tempGraph
      }, function() {
        // 冷却 1.5 秒后继续请求，避免触发大模型并发/频率限制
        setTimeout(function() {
          processNextBatch(targetBookmarks, config, progress, tempGraph);
        }, 1500);
      });
    }).catch(function(error) {
      analyzing = false;
      analyzeStatusText = '分析中止！网络或API报错: ' + error.message;
      updateAnalyzeButton(true);
      // 保存已经爬过的进度，方便用户点击重试恢复
      chrome.storage.local.set({ analysisProgress: progress, tempGraphData: tempGraph });
    });
  } else {
    analyzing = false;
    analyzeStatusText = '错误：AIService 未加载';
    updateAnalyzeButton(true);
  }
}

// 保留原先的单次请求方法用于增量更新（通常数据量几条~十几条）
function performAnalysisSingleRequest(targetBookmarks, isIncremental, deletedIds, currentGraphData) {
  analyzing = true;
  analyzeStatusText = '获取配置...';
  updateAnalyzeButton();

  new Promise(function(resolve) {
    chrome.storage.sync.get(['aiProvider', 'apiKey', 'apiEndpoint', 'modelName', 'batchSize'], function(result) {
      resolve(result);
    });
  }).then(function(config) {
    if (!config.apiKey) {
      throw new Error('请先在"AI 接口配置"中填写 API Key！');
    }

    var maxBookmarks = config.batchSize || 50;
    var bookmarksToAnalyze = targetBookmarks.slice(0, maxBookmarks);

    if (bookmarksToAnalyze.length < targetBookmarks.length) {
       analyzeStatusText = '正在分析前 ' + bookmarksToAnalyze.length + ' 个书签 (超限拦截)...';
    } else {
       analyzeStatusText = '正在请求 AI 分析 ' + bookmarksToAnalyze.length + ' 个书签...';
    }
    updateAnalyzeButton();

    var provider = config.aiProvider || 'deepseek';
    var defaultProviders = {
      deepseek: { endpoint: 'https://api.deepseek.com', model: 'deepseek-chat' },
      siliconflow: { endpoint: 'https://api.siliconflow.cn', model: 'deepseek-ai/DeepSeek-V3' },
      openai: { endpoint: 'https://api.openai.com', model: 'gpt-4o-mini' },
      anthropic: { endpoint: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
      custom: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'claude-sonnet-4-20250514' }
    };

    var endpoint = config.apiEndpoint || (defaultProviders[provider] ? defaultProviders[provider].endpoint : 'https://api.deepseek.com');
    var model = config.modelName || (defaultProviders[provider] ? defaultProviders[provider].model : 'deepseek-chat');

      if (window.aiService) {
        window.aiService.analyzeBookmarks(bookmarksToAnalyze).then(function(result) {
          if (isIncremental) {
             finishIncrementalUpdate(currentGraphData, deletedIds, result);
          } else {
             // 只有少量书签做全量（< 50），直接调用增量合并逻辑生成分类和连线
             var emptyGraph = { nodes: [], edges: [], categories: [] };
             finishIncrementalUpdate(emptyGraph, new Set(), result);
          }
        }).catch(function(error) {
          analyzing = false;
          analyzeStatusText = error.message;
          updateAnalyzeButton(true);
        });
      } else {
        analyzing = false;
        analyzeStatusText = '错误：AIService 未加载';
        updateAnalyzeButton(true);
      }

  }).catch(function(error) {
    analyzing = false;
    analyzeStatusText = error.message;
    updateAnalyzeButton(true);
  });
}

function finishIncrementalUpdate(graphData, deletedIds, newAiData) {
  // 移除失效节点
  if (deletedIds && deletedIds.size > 0) {
    graphData.nodes = graphData.nodes.filter(function(n) { return !deletedIds.has(String(n.id)); });
    graphData.edges = (graphData.edges || []).filter(function(e) {
       var sMsg = typeof e.source === 'object' ? String(e.source.id) : String(e.source);
       var tMsg = typeof e.target === 'object' ? String(e.target.id) : String(e.target);
       return !deletedIds.has(sMsg) && !deletedIds.has(tMsg);
    });
  }
  
  // 增加新节点并生成分类与连线
  if (newAiData && newAiData.nodes && newAiData.nodes.length > 0) {
     var existingNodes = graphData.nodes;
     graphData.categories = graphData.categories || [];
     graphData.edges = graphData.edges || [];
     
     var existingCategoriesMap = new Map();
     graphData.categories.forEach(function(c) {
       existingCategoriesMap.set(c.name, c);
     });

     newAiData.nodes.forEach(function(newNode) {
        graphData.nodes.push(newNode);
        
        if (newNode.category) {
          // 自动生成 Category 及颜色（如果不存在）
          if (!existingCategoriesMap.has(newNode.category)) {
             var hue = Math.floor(Math.random() * 360);
             var color = 'hsl(' + hue + ', 70%, 50%)';
             var newCategory = { name: newNode.category, color: color };
             graphData.categories.push(newCategory);
             existingCategoriesMap.set(newNode.category, newCategory);
          }
          
            // 自动生成 Edges 基于 Tags 重叠：最多连 5 条，优先连共同标签最多的节点
          var tagSet = new Set(newNode.tags || []);
          if (tagSet.size > 0) {
            var peerScores = [];
            for (var pi = 0; pi < existingNodes.length; pi++) {
              var peerNode = existingNodes[pi];
              if (peerNode.id === newNode.id) continue;
              var sharedTags = (peerNode.tags || []).filter(function(t) { return tagSet.has(t); });
              if (sharedTags.length > 0) {
                peerScores.push({ peer: peerNode, shared: sharedTags });
              }
            }
            peerScores.sort(function(a, b) { return b.shared.length - a.shared.length; });
            var edgeLimit = Math.min(5, peerScores.length);
            for (var pj = 0; pj < edgeLimit; pj++) {
              graphData.edges.push({
                source: newNode.id,
                target: peerScores[pj].peer.id,
                relation: peerScores[pj].shared.slice(0, 2).join(', ')
              });
            }
          } else if (newNode.category) {
            // 如果该节点没有 tags （老数据兼容），回退到按 category 连线
            var peerCount = 0;
            for (var pk = existingNodes.length - 1; pk >= 0 && peerCount < 3; pk--) {
              var catPeer = existingNodes[pk];
              if (catPeer.id !== newNode.id && catPeer.category === newNode.category) {
                graphData.edges.push({ source: newNode.id, target: catPeer.id, relation: '同一主题' });
                peerCount++;
              }
            }
          }
        }
     });
  }

  chrome.storage.local.set({ graphData: graphData }, function() {
    analyzing = false;
    analyzeStatusText = '增量同步成功！';
    updateAnalyzeButton(false, true);
    loadGraphData();
    checkSyncStatus();
  });
}

function updateAnalyzeButton(isError, isSuccess) {
  var analyzeBtn = document.getElementById('analyzeBookmarks');
  var syncBtn = document.getElementById('syncBookmarksBtn');
  var analyzeStatus = document.getElementById('analyzeStatus');
  
  if (!analyzeBtn || !analyzeStatus) return;
  
  var textStr = analyzeStatus.querySelector('span');
  var statusIcon = analyzeStatus.querySelector('i');

  if (analyzing) {
    analyzeBtn.disabled = true;
    analyzeBtn.classList.add('opacity-50', 'cursor-not-allowed');
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    
    analyzeStatus.classList.remove('hidden');
    statusIcon.className = 'fas fa-circle-notch fa-spin text-cyan-400 font-bold';
    textStr.textContent = analyzeStatusText;
    textStr.className = 'text-slate-300 truncate';
    var pauseBtn = document.getElementById('pauseAnalysis');
    if (pauseBtn) pauseBtn.classList.remove('hidden');
  } else {
    var pauseBtn2 = document.getElementById('pauseAnalysis');
    if (pauseBtn2) pauseBtn2.classList.add('hidden');
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    
    if (isError) {
      analyzeStatus.classList.remove('hidden');
      statusIcon.className = 'fas fa-exclamation-circle text-red-400 font-bold';
      textStr.textContent = analyzeStatusText;
      textStr.className = 'text-red-400 text-xs';
    } else if (isSuccess) {
      analyzeStatus.classList.remove('hidden');
      statusIcon.className = 'fas fa-check-circle text-green-400 font-bold';
      textStr.textContent = analyzeStatusText;
      textStr.className = 'text-green-400 text-xs';
      setTimeout(function() {
         analyzeStatus.classList.add('hidden');
      }, 3500);
    } else {
      analyzeStatus.classList.add('hidden');
    }
  }
}

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
