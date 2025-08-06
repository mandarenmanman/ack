// background.js - Service Worker for BookmarkManager Extension

// 监听书签创建事件
chrome.bookmarks.onCreated.addListener(function(id, bookmark) {
  console.log('新书签已创建!');
  console.log('ID: ' + id);
  console.log('标题: ' + bookmark.title);
  console.log('URL: ' + bookmark.url);
  
  // 发送通知
  if (bookmark.url) { // 只为实际的书签（非文件夹）发送通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon48.svg',
      title: '书签已添加',
      message: `成功收藏页面: ${bookmark.title || '未命名页面'}`
    });
  }
});

// 监听书签被删除的事件
chrome.bookmarks.onRemoved.addListener(function(id, removeInfo) {
  console.log(`书签 (ID: ${id}) 已被删除`);
  
  // 发送删除通知
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '../icons/icon48.svg',
    title: '书签已删除',
    message: '一个书签已从收藏夹中移除'
  });
});

// 监听书签被移动的事件
chrome.bookmarks.onMoved.addListener(function(id, moveInfo) {
  console.log(`书签 (ID: ${id}) 已被移动`);
  console.log('移动信息:', moveInfo);
});

// 监听书签被修改的事件
chrome.bookmarks.onChanged.addListener(function(id, changeInfo) {
  console.log(`书签 (ID: ${id}) 已被修改`);
  console.log('修改信息:', changeInfo);
  
  // 如果标题或URL发生变化，发送通知
  if (changeInfo.title || changeInfo.url) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon48.svg',
      title: '书签已更新',
      message: `书签信息已更新: ${changeInfo.title || '标题未变'}`
    });
  }
});

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    console.log('BookmarkManager 扩展已安装');
    
    // 发送欢迎通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon48.svg',
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
  
  // 清除通知
  chrome.notifications.clear(notificationId);
  
  // 可以在这里添加更多的交互逻辑
  // 比如打开特定的页面或执行特定的操作
});

// 监听扩展图标点击事件（可选）
chrome.action.onClicked.addListener(function(tab) {
  console.log('扩展图标被点击，当前标签页:', tab.title);
  // 由于我们使用了 default_popup，这个事件通常不会触发
  // 但保留这里以备将来可能的功能扩展
});

// 处理来自popup的消息（如果需要）
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('收到来自popup的消息:', request);
  
  if (request.action === 'getBookmarkStats') {
    // 获取书签统计信息
    chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
      const stats = calculateBookmarkStats(bookmarkTreeNodes);
      sendResponse(stats);
    });
    return true; // 保持消息通道开放以进行异步响应
  }
});

// 计算书签统计信息的辅助函数
function calculateBookmarkStats(nodes) {
  let bookmarkCount = 0;
  let folderCount = 0;
  
  function traverse(nodeList) {
    for (const node of nodeList) {
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

// 定期清理过期的通知（可选）
setInterval(function() {
  chrome.notifications.getAll(function(notifications) {
    const notificationIds = Object.keys(notifications);
    if (notificationIds.length > 5) {
      // 如果通知太多，清理最旧的
      const oldestId = notificationIds[0];
      chrome.notifications.clear(oldestId);
    }
  });
}, 60000); // 每分钟检查一次