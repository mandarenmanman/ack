// popup.js - 原生 JavaScript 实现

// 状态
var bookmarks = [];
var allFolders = [];
var selectedFolder = null;
var searchQuery = '';

// DOM 元素
var elements = {};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  cacheElements();
  bindEvents();
  loadBookmarks();
});

// 缓存 DOM 元素
function cacheElements() {
  elements.folderSearch = document.getElementById('folderSearch');
  elements.clearSearch = document.getElementById('clearSearch');
  elements.searchResults = document.getElementById('searchResults');
  elements.noResults = document.getElementById('noResults');
  elements.selectedFolderBox = document.getElementById('selectedFolderBox');
  elements.selectedFolderName = document.getElementById('selectedFolderName');
  elements.clearSelection = document.getElementById('clearSelection');
  elements.loadingState = document.getElementById('loadingState');
  elements.emptyBookmarks = document.getElementById('emptyBookmarks');
  elements.bookmarkTree = document.getElementById('bookmarkTree');
  elements.addBookmark = document.getElementById('addBookmark');
  elements.messageToast = document.getElementById('messageToast');
  elements.messageText = document.getElementById('messageText');
  elements.messageIcon = document.getElementById('messageIcon');
  elements.openGraphView = document.getElementById('openGraphView');
  elements.openSettings = document.getElementById('openSettings');
}

// 绑定事件
function bindEvents() {
  elements.folderSearch.addEventListener('input', handleSearch);
  elements.clearSearch.addEventListener('click', clearSearch);
  elements.clearSelection.addEventListener('click', clearFolderSelection);
  elements.addBookmark.addEventListener('click', addBookmark);
  elements.openGraphView.addEventListener('click', openGraphView);
  elements.openSettings.addEventListener('click', openSettings);
}

// 加载书签
function loadBookmarks() {
  showLoading();
  chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
    if (bookmarkTreeNodes && bookmarkTreeNodes.length > 0) {
      var secondLevelNodes = [];
      bookmarkTreeNodes.forEach(function(rootNode) {
        if (rootNode.children) {
          secondLevelNodes.push.apply(secondLevelNodes, rootNode.children);
        }
      });
      bookmarks = secondLevelNodes;
      extractFolders(secondLevelNodes);
      renderBookmarkTree(secondLevelNodes);
    } else {
      showEmptyBookmarks();
    }
  });
}

// 提取文件夹用于搜索
function extractFolders(nodes, folders, parentPath) {
  folders = folders || [];
  parentPath = parentPath || [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.children) {
      var currentPath = parentPath.slice();
      currentPath.push(node.title || '未命名文件夹');
      folders.push({
        id: node.id,
        title: node.title || '未命名文件夹',
        path: currentPath,
        fullPath: currentPath.join(' > ')
      });
      extractFolders(node.children, folders, currentPath);
    }
  }
  allFolders = folders;
}

// 渲染书签树
function renderBookmarkTree(nodes, container, expandedFolders) {
  if (!container) {
    container = elements.bookmarkTree;
    container.innerHTML = '';
    container.expandedFolders = new Set();
  }
  expandedFolders = expandedFolders || container.expandedFolders;

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.children) {
      container.appendChild(createFolderElement(node, expandedFolders));
    } else if (node.url) {
      container.appendChild(createBookmarkElement(node));
    }
  }
}

// 创建文件夹元素
function createFolderElement(node, expandedFolders) {
  var div = document.createElement('div');
  div.className = 'mb-1';
  div.dataset.nodeId = node.id;

  var isExpanded = expandedFolders.has(node.id);
  var hasChildren = node.children && node.children.length > 0;
  var arrow = hasChildren ? (isExpanded ? '\uf00d' : '\uf105') : '';

  var header = document.createElement('div');
  header.className = 'flex items-center gap-2 px-2 py-1.5 rounded-lg ' + (hasChildren ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default');
  header.innerHTML = '<i class="fas ' + (arrow ? 'text-gray-400 text-xs w-3' : 'w-3') + '">' + arrow + '</i>' +
    '<i class="fas fa-folder text-yellow-500 text-sm"></i>' +
    '<span class="text-sm font-medium text-gray-700 flex-1 truncate">' + (node.title || '未命名文件夹') + '</span>';

  div.appendChild(header);

  if (hasChildren) {
    var childrenDiv = document.createElement('div');
    childrenDiv.className = 'folder-children' + (isExpanded ? ' show' : '');
    childrenDiv.dataset.parentId = node.id;

    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      if (child.children) {
        childrenDiv.appendChild(createFolderElement(child, expandedFolders));
      } else if (child.url) {
        childrenDiv.appendChild(createBookmarkElement(child));
      }
    }

    div.appendChild(childrenDiv);

    header.addEventListener('click', function() {
      toggleFolder(node.id, expandedFolders, childrenDiv, header.querySelector('i:first-child'));
    });
  }

  return div;
}

// 切换文件夹展开/折叠
function toggleFolder(folderId, expandedFolders, childrenDiv, arrowEl) {
  if (expandedFolders.has(folderId)) {
    expandedFolders.delete(folderId);
    childrenDiv.classList.remove('show');
    arrowEl.className = 'fas fa-angle-right text-gray-400 text-xs w-3';
    arrowEl.textContent = '\uf105';
  } else {
    expandedFolders.add(folderId);
    childrenDiv.classList.add('show');
    arrowEl.className = 'fas fa-times text-gray-400 text-xs w-3';
    arrowEl.textContent = '\uf00d';
  }
}

// 创建书签元素
function createBookmarkElement(node) {
  var div = document.createElement('div');
  div.className = 'flex items-center gap-2 px-2 py-1.5 ml-5 rounded-lg hover:bg-blue-50 cursor-pointer group';
  div.innerHTML = '<i class="fas fa-link text-gray-400 text-xs group-hover:text-blue-500"></i>' +
    '<a href="' + node.url + '" class="text-sm text-gray-600 group-hover:text-blue-600 flex-1 truncate">' + (node.title || '未命名书签') + '</a>';

  div.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.tabs.create({ url: node.url });
    window.close();
  });

  return div;
}

// 处理搜索
function handleSearch(e) {
  searchQuery = e.target.value.trim();
  elements.clearSearch.style.display = searchQuery ? 'block' : 'none';

  if (!searchQuery) {
    elements.searchResults.classList.remove('show');
    elements.noResults.classList.remove('show');
    return;
  }

  var query = searchQuery.toLowerCase();
  var results = [];
  for (var i = 0; i < allFolders.length; i++) {
    if (allFolders[i].title.toLowerCase().indexOf(query) !== -1) {
      results.push(allFolders[i]);
    }
  }

  if (results.length > 0) {
    elements.noResults.classList.remove('show');
    elements.searchResults.classList.add('show');
    var html = '';
    for (var i = 0; i < results.length; i++) {
      var folder = results[i];
      html += '<div class="search-result-item px-4 py-2.5 cursor-pointer hover:bg-blue-50 transition border-b border-gray-100 last:border-0" data-folder-id="' + folder.id + '">' +
        '<div class="flex items-center gap-2.5">' +
        '<i class="fas fa-folder text-yellow-500"></i>' +
        '<span class="text-sm font-medium text-gray-700">' + folder.title + '</span>' +
        '</div>' +
        '<div class="text-xs text-gray-400 mt-1 ml-6">' + folder.fullPath + '</div>' +
        '</div>';
    }
    elements.searchResults.innerHTML = html;

    var items = elements.searchResults.querySelectorAll('.search-result-item');
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener('click', function() {
        selectFolder(this.dataset.folderId);
      });
    }
  } else {
    elements.searchResults.classList.remove('show');
    elements.noResults.classList.add('show');
  }
}

// 清除搜索
function clearSearch() {
  elements.folderSearch.value = '';
  elements.clearSearch.style.display = 'none';
  elements.searchResults.classList.remove('show');
  elements.noResults.classList.remove('show');
  searchQuery = '';
}

// 选择文件夹
function selectFolder(folderId) {
  var folder = null;
  for (var i = 0; i < allFolders.length; i++) {
    if (allFolders[i].id === folderId) {
      folder = allFolders[i];
      break;
    }
  }
  if (folder) {
    selectedFolder = folder;
    elements.selectedFolderName.textContent = folder.title;
    elements.selectedFolderBox.classList.remove('hidden');
    elements.folderSearch.value = '';
    elements.clearSearch.style.display = 'none';
    elements.searchResults.classList.remove('show');
    elements.noResults.classList.remove('show');
    showMessage('已选择文件夹：' + folder.title, 'success');
  }
}

// 清除文件夹选择
function clearFolderSelection() {
  selectedFolder = null;
  elements.selectedFolderBox.classList.add('hidden');
  showMessage('已清除文件夹选择', 'info');
}

// 添加书签
function addBookmark() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    var currentTab = tabs[0];
    if (currentTab && currentTab.url && currentTab.url.indexOf('chrome://') !== 0) {
      var options = {
        title: currentTab.title || '未命名页面',
        url: currentTab.url
      };

      if (selectedFolder) {
        options.parentId = selectedFolder.id;
      }

      chrome.bookmarks.create(options, function(newBookmark) {
        if (chrome.runtime.lastError) {
          showMessage('收藏失败，请重试', 'error');
        } else {
          var folderInfo = selectedFolder ? ' 到文件夹 "' + selectedFolder.title + '"' : '';
          showMessage('已收藏：' + newBookmark.title + folderInfo, 'success');
          setTimeout(function() { loadBookmarks(); }, 1000);
        }
      });
    } else {
      showMessage('无法收藏此页面', 'error');
    }
  });
}

// 打开知识图谱
function openGraphView() {
  chrome.windows.create({
    url: 'graph.html',
    width: 1200,
    height: 800,
    type: 'popup'
  }, function() {
    if (chrome.runtime.lastError) {
      showMessage('无法打开知识图谱，请重试', 'error');
    }
  });
}

// 打开设置
function openSettings() {
  chrome.tabs.create({ url: 'settings.html' }, function() {
    if (chrome.runtime.lastError) {
      showMessage('无法打开设置页面，请重试', 'error');
    }
  });
}

// 显示加载状态
function showLoading() {
  elements.loadingState.classList.add('show');
  elements.emptyBookmarks.classList.remove('show');
  elements.bookmarkTree.classList.remove('show');
}

// 显示空书签
function showEmptyBookmarks() {
  elements.loadingState.classList.remove('show');
  elements.emptyBookmarks.classList.add('show');
  elements.bookmarkTree.classList.remove('show');
}

// 显示消息
function showMessage(text, type) {
  type = type || 'info';
  var icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle'
  };

  var colors = {
    success: 'bg-green-500/95 text-white',
    error: 'bg-red-500/95 text-white',
    info: 'bg-blue-500/95 text-white'
  };

  elements.messageIcon.className = 'fas mr-2 ' + icons[type];
  elements.messageText.textContent = text;
  elements.messageToast.className = 'message-toast show fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl z-50 max-w-[300px] text-center backdrop-blur-sm ' + colors[type];

  setTimeout(function() {
    elements.messageToast.classList.remove('show');
  }, 3000);
}
