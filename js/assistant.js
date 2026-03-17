/**
 * assistant.js
 * 实现图谱页面的 AI 助手交互逻辑
 */

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggleChat');
  const closeBtn = document.getElementById('closeChat');
  const chatWindow = document.getElementById('chatWindow');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendMessage');
  const chatMessages = document.getElementById('chatMessages');
  const loadingIndicator = document.getElementById('assistantLoading');

  const app = document.getElementById('app');
  let isChatOpen = false;
  let chatHistory = [];

  // 1. 切换窗口逻辑
  const openChat = () => {
    app.classList.add('ai-mode');
    chatWindow.classList.remove('translate-x-full');
    isChatOpen = true;
    setTimeout(() => chatInput.focus(), 300);
  };

  const closeChat = () => {
    app.classList.remove('ai-mode');
    chatWindow.classList.add('translate-x-full');
    isChatOpen = false;
  };

  toggleBtn.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);

  // 2. 发送消息逻辑
  const handleSendMessage = async () => {
    const text = chatInput.value.trim();
    if (!text || loadingIndicator.classList.contains('show')) return;

    // 添加用户消息 UI
    appendMessage(text, 'user');
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // 显示加载
    loadingIndicator.classList.remove('hidden');
    sendBtn.disabled = true;

    try {
      // 获取当前图谱数据
      const graphData = window.fullGraphData || { nodes: [], edges: [] };

      if (window.aiService && window.aiService.chatWithAgent) {
        const response = await window.aiService.chatWithAgent(text, chatHistory, graphData);
        
        appendMessage(response, 'assistant');
        
        // 更新历史
        chatHistory.push({ role: 'user', content: text });
        chatHistory.push({ role: 'assistant', content: response });
        if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
      } else {
        throw new Error('AI 服务未加载');
      }
    } catch (err) {
      console.error('AI Error:', err);
      appendMessage(`抱歉，出错了: ${err.message}`, 'error');
    } finally {
      loadingIndicator.classList.add('hidden');
      sendBtn.disabled = false;
    }
  };

  sendBtn.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  function appendMessage(text, role) {
    const msgWrapper = document.createElement('div');
    const isUser = role === 'user';
    msgWrapper.className = `flex gap-3 ${isUser ? 'flex-row-reverse' : ''} items-start`;

    const avatar = isUser 
      ? `<div class="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0 shadow-lg"><i class="fas fa-user text-[10px] text-slate-300"></i></div>`
      : `<div class="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 shadow-sm"><i class="fas ${role === 'error' ? 'fa-exclamation-triangle text-orange-400' : 'fa-robot text-cyan-400'} text-xs"></i></div>`;

    const bubbleClass = isUser
      ? 'bg-cyan-600 text-white rounded-tr-none border-cyan-500 shadow-[0_4px_12px_rgba(8,145,178,0.3)]'
      : role === 'error'
        ? 'bg-orange-500/10 text-orange-200 border-orange-500/30'
        : 'bg-slate-800/60 text-slate-200 border-slate-700/50 shadow-sm';

    msgWrapper.innerHTML = `
      ${avatar}
      <div class="max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}">
        <div class="${bubbleClass} text-sm p-4 rounded-2xl border leading-relaxed whitespace-pre-wrap break-words shadow-md">${text}</div>
      </div>
    `;

    chatMessages.appendChild(msgWrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // 输入框自适应高度
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
  });

  // 4. 点击建议文本自动发送
  chatMessages.addEventListener('click', (e) => {
    if (e.target.tagName === 'SPAN' && e.target.classList.contains('text-cyan-400/80')) {
      chatInput.value = e.target.textContent.replace(/[“”]/g, '');
      handleSendMessage();
    }
  });
});
