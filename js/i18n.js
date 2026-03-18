// i18n.js - lightweight runtime i18n for extension pages (popup/settings/graph)

(function() {
  var DEFAULT_LANG = 'en';
  var SUPPORTED = ['en', 'zh-CN'];

  function normalizeLang(lang) {
    if (!lang) return null;
    var l = String(lang).trim();
    if (!l) return null;
    if (l.toLowerCase() === 'zh' || l.toLowerCase() === 'zh-cn' || l.toLowerCase() === 'zh_hans') return 'zh-CN';
    if (l.toLowerCase().startsWith('zh')) return 'zh-CN';
    if (l.toLowerCase().startsWith('en')) return 'en';
    return l;
  }

  function detectBrowserLang() {
    try {
      var ui = (chrome && chrome.i18n && chrome.i18n.getUILanguage) ? chrome.i18n.getUILanguage() : (navigator.language || '');
      return normalizeLang(ui) || DEFAULT_LANG;
    } catch (e) {
      return DEFAULT_LANG;
    }
  }

  function getStoredLang() {
    return new Promise(function(resolve) {
      try {
        chrome.storage.sync.get(['language'], function(res) {
          resolve(res && res.language ? String(res.language) : '');
        });
      } catch (e) {
        resolve('');
      }
    });
  }

  function loadDict(lang) {
    return new Promise(function(resolve) {
      var l = SUPPORTED.indexOf(lang) >= 0 ? lang : DEFAULT_LANG;
      var url = (chrome && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('locales/' + l + '.json')
        : ('../locales/' + l + '.json');

      fetch(url).then(function(r) {
        if (!r.ok) throw new Error('failed to load locale: ' + l);
        return r.json();
      }).then(function(json) {
        resolve(json || {});
      }).catch(function() {
        if (l !== DEFAULT_LANG) {
          loadDict(DEFAULT_LANG).then(resolve);
        } else {
          resolve({});
        }
      });
    });
  }

  function applyI18n(dict) {
    function t(key) {
      return (dict && Object.prototype.hasOwnProperty.call(dict, key)) ? dict[key] : '';
    }

    // text nodes
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      if (val) el.textContent = val;
    });

    // placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var val = t(key);
      if (val) el.setAttribute('placeholder', val);
    });

    // title
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-title');
      var val = t(key);
      if (val) el.setAttribute('title', val);
    });

    // document title
    var titleKeyEl = document.querySelector('[data-i18n-doc-title]');
    if (titleKeyEl) {
      var titleKey = titleKeyEl.getAttribute('data-i18n-doc-title');
      var tv = t(titleKey);
      if (tv) document.title = tv;
    }

    // expose translator for runtime strings in JS
    window.__ACK_T = function(key, fallback) {
      var v = t(key);
      if (v) return v;
      return fallback != null ? String(fallback) : '';
    };
  }

  async function init() {
    var stored = normalizeLang(await getStoredLang());
    var lang = stored && stored !== 'auto' ? stored : detectBrowserLang();
    lang = SUPPORTED.indexOf(lang) >= 0 ? lang : DEFAULT_LANG;
    var dict = await loadDict(lang);
    applyI18n(dict);
    window.__ACK_I18N__ = { lang: lang, dict: dict };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

