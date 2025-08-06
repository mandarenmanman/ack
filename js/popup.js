const { createApp, h } = Vue;

// 书签树组件
const BookmarkTree = {
  props: ['nodes'],
  data() {
    return {
      expandedFolders: new Set() // 跟踪展开的文件夹ID
    };
  },
  methods: {
    openBookmark(url) {
      // 在新标签页中打开链接
      chrome.tabs.create({ url: url });
      window.close(); // 关闭弹出窗口
    },
    
    // 切换文件夹展开状态
    toggleFolder(folderId) {
      if (this.expandedFolders.has(folderId)) {
        this.expandedFolders.delete(folderId);
      } else {
        this.expandedFolders.add(folderId);
      }
      // 触发重新渲染
      this.$forceUpdate();
    },
    
    // 检查文件夹是否展开
    isFolderExpanded(folderId) {
      return this.expandedFolders.has(folderId);
    }
  },
  render() {
    const renderNode = (node) => {
      if (node.children) {
        // 文件夹节点
        const isExpanded = this.isFolderExpanded(node.id);
        const hasChildren = node.children && node.children.length > 0;
        const arrow = hasChildren ? (isExpanded ? '▼' : '▶') : '';
        
        const folderContent = [
          h('div', { 
            class: 'folder',
            onClick: () => hasChildren && this.toggleFolder(node.id),
            style: { cursor: hasChildren ? 'pointer' : 'default' }
          }, [
            h('span', { class: 'folder-arrow' }, arrow),
            h('span', { class: 'folder-icon' }, '📁'),
            h('span', { class: 'folder-title' }, node.title || '未命名文件夹')
          ]),
          // 只在展开时显示子节点
          isExpanded && hasChildren ? h(BookmarkTree, { nodes: node.children }) : null
        ];
        return h('li', { key: node.id, class: 'bookmark-item folder-item' }, folderContent);
      } else if (node.url) {
        // 书签节点
        return h('li', { key: node.id, class: 'bookmark-item bookmark-link-item' }, [
          h('a', {
            href: node.url,
            class: 'bookmark-link',
            target: '_blank',
            onClick: (e) => {
              e.preventDefault();
              this.openBookmark(node.url);
            }
          }, [
            h('span', { class: 'bookmark-icon' }, '🔖'),
            h('span', { class: 'bookmark-title' }, node.title || '未命名书签')
          ])
        ]);
      }
      return null;
    };

    return h('ul', { class: 'bookmark-list' }, 
      this.nodes.map(node => renderNode(node)).filter(Boolean)
    );
  }
};

// 主应用
const app = createApp({
  components: {
    BookmarkTree
  },
  data() {
    return {
      bookmarks: [],
      loading: true,
      folderSearchQuery: '',
      searchResults: [],
      selectedFolder: null,
      allFolders: [],
      message: {
        text: '',
        type: ''
      }
    };
  },
  mounted() {
    this.loadBookmarks();
  },
  methods: {
    // 加载书签
    loadBookmarks() {
      chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        this.loading = false;
        if (bookmarkTreeNodes && bookmarkTreeNodes.length > 0) {
          // 跳过第一层根目录，直接显示第二层内容
          const secondLevelNodes = [];
          bookmarkTreeNodes.forEach(rootNode => {
            if (rootNode.children) {
              secondLevelNodes.push(...rootNode.children);
            }
          });
          this.bookmarks = secondLevelNodes;
          this.extractFolders(secondLevelNodes);
        } else {
          this.bookmarks = [];
        }
      });
    },

    // 构建文件夹的完整路径
    buildFolderPath(targetId, nodes, currentPath = []) {
      for (const node of nodes) {
        if (node.children) {
          const newPath = [...currentPath, node.title || '未命名文件夹'];
          if (node.id === targetId) {
            return newPath;
          }
          const result = this.buildFolderPath(targetId, node.children, newPath);
          if (result) {
            return result;
          }
        }
      }
      return null;
    },

    // 提取所有文件夹
    extractFolders(nodes, folders = [], parentPath = []) {
      for (const node of nodes) {
        if (node.children) {
          const currentPath = [...parentPath, node.title || '未命名文件夹'];
          folders.push({
            id: node.id,
            title: node.title || '未命名文件夹',
            path: currentPath,
            fullPath: currentPath.join(' > ')
          });
          this.extractFolders(node.children, folders, currentPath);
        }
      }
      this.allFolders = folders;
      return folders;
    },

    // 搜索文件夹
    searchFolders() {
      if (!this.folderSearchQuery.trim()) {
        this.searchResults = [];
        return;
      }
      
      const query = this.folderSearchQuery.toLowerCase();
      // 只匹配文件夹名称本身，不匹配路径
      this.searchResults = this.allFolders.filter(folder => 
        folder.title.toLowerCase().includes(query)
      );
    },

    // 选择文件夹
    selectFolder(folder) {
      this.selectedFolder = folder;
      this.folderSearchQuery = '';
      this.searchResults = [];
      this.showMessage(`已选择文件夹: ${folder.title}`, 'success');
    },

    // 清除选择
    clearSelection() {
      this.selectedFolder = null;
      this.showMessage('已清除文件夹选择', 'info');
    },

    // 一键收藏
    addBookmark() {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab && currentTab.url && !currentTab.url.startsWith('chrome://')) {
          const bookmarkOptions = {
            title: currentTab.title || '未命名页面',
            url: currentTab.url
          };
          
          // 如果选择了文件夹，添加到指定文件夹
          if (this.selectedFolder) {
            bookmarkOptions.parentId = this.selectedFolder.id;
          }
          
          chrome.bookmarks.create(bookmarkOptions, (newBookmark) => {
            if (chrome.runtime.lastError) {
              console.error('创建书签失败:', chrome.runtime.lastError);
              this.showMessage('收藏失败，请重试', 'error');
            } else {
              const folderInfo = this.selectedFolder ? ` 到文件夹 "${this.selectedFolder.title}"` : '';
              this.showMessage(`已收藏: ${newBookmark.title}${folderInfo}`, 'success');
              // 刷新书签列表
              setTimeout(() => {
                this.loadBookmarks();
              }, 1000);
            }
          });
        } else {
          this.showMessage('无法收藏此页面', 'error');
        }
      });
    },

    // 显示消息
    showMessage(text, type = 'info') {
      this.message = { text, type };
      // 3秒后自动清除消息
      setTimeout(() => {
        this.message = { text: '', type: '' };
      }, 3000);
    }
  },
  render() {
    const children = [
      // 标题
      h('h1', null, '我的书签'),
      
      // 文件夹搜索区域
      h('div', { class: 'search-section' }, [
        // 搜索输入框
        h('input', {
          type: 'text',
          value: this.folderSearchQuery,
          placeholder: '搜索文件夹...',
          class: 'folder-search',
          onInput: (e) => {
            this.folderSearchQuery = e.target.value;
            this.searchFolders();
          }
        }),
        
        // 搜索结果
        this.folderSearchQuery && this.searchResults.length > 0 ? 
          h('div', { class: 'folder-results' }, 
            this.searchResults.map(folder => 
              h('div', {
                key: folder.id,
                class: 'folder-item',
                onClick: () => this.selectFolder(folder)
              }, [
                h('div', { class: 'folder-name' }, `📁 ${folder.title}`),
                h('div', { class: 'folder-path' }, folder.fullPath)
              ])
            )
          ) : null,
        
        // 无结果提示
        this.folderSearchQuery && this.searchResults.length === 0 ? 
          h('div', { class: 'no-results' }, '无匹配文件夹') : null,
        
        // 已选择的文件夹
        this.selectedFolder ? 
          h('div', { class: 'selected-folder' }, [
            `已选择文件夹: ${this.selectedFolder.title}`,
            h('button', {
              class: 'clear-btn',
              onClick: this.clearSelection
            }, '清除')
          ]) : null
      ]),
      
      // 书签展示区域
      h('div', { class: 'bookmarks-container' }, [
        this.loading ? 
          h('div', { class: 'loading' }, '正在加载书签...') :
        this.bookmarks.length === 0 ? 
          h('div', { class: 'empty-state' }, '暂无书签') :
          h(BookmarkTree, { nodes: this.bookmarks })
      ]),
      
      // 分隔线
      h('hr'),
      
      // 一键收藏按钮
      h('button', {
        class: 'add-bookmark-btn',
        onClick: this.addBookmark
      }, '一键收藏当前页面'),
      
      // 消息提示
      this.message.text ? 
        h('div', {
          class: ['message', this.message.type]
        }, this.message.text) : null
    ];
    
    return h('div', null, children.filter(Boolean));
  }
});

// 挂载应用
app.mount('#app');