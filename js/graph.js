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

  console.log('Buttons found:', { reloadBtn: reloadBtn, resetBtn: resetBtn, settingsBtn: settingsBtn, goToSettingsBtn: goToSettingsBtn });

  if (reloadBtn) reloadBtn.addEventListener('click', loadGraphData);
  if (resetBtn) resetBtn.addEventListener('click', resetViewFn);
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (goToSettingsBtn) goToSettingsBtn.addEventListener('click', openSettings);

  // 页面加载时先获取书签总数
  loadBookmarkCount();
  loadGraphData();
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
