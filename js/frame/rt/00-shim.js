// FIRST script of every frame: in-memory localStorage/sessionStorage (the sandbox has no storage), flushed to the parent.
(function () {
  var C = window.__LZ || {}; var seed = C.state || {}; var timer = null;
  function make(persist) {
    var d = {}; Object.keys(persist ? seed : {}).forEach(function (k) { d[k] = String(seed[k]); });
    var api = {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
      setItem: function (k, v) { d[String(k)] = String(v); flush(); },
      removeItem: function (k) { delete d[String(k)]; flush(); },
      clear: function () { d = {}; flush(); },
      key: function (i) { return Object.keys(d)[i] === undefined ? null : Object.keys(d)[i]; }
    };
    Object.defineProperty(api, 'length', { get: function () { return Object.keys(d).length; } });
    api.__dump = function () { return d; };
    function flush() { if (!persist) return; clearTimeout(timer); timer = setTimeout(function () { try { parent.postMessage({ lz: 1, id: C.id, type: 'storage', data: d }, '*'); } catch (e) {} }, 200); }
    return new Proxy(api, {
      get: function (t, k) { return k in t ? t[k] : (typeof k === 'string' && Object.prototype.hasOwnProperty.call(d, k) ? d[k] : undefined); },
      set: function (t, k, v) { if (typeof k === 'string') { d[k] = String(v); flush(); } return true; },
      deleteProperty: function (t, k) { delete d[k]; flush(); return true; },
      ownKeys: function () { return Object.keys(d); },
      getOwnPropertyDescriptor: function (t, k) { return Object.prototype.hasOwnProperty.call(d, k) ? { value: d[k], enumerable: true, configurable: true, writable: true } : undefined; },
      has: function (t, k) { return k in t || Object.prototype.hasOwnProperty.call(d, k); }
    });
  }
  var ls = make(true), ss = make(false);
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return ls; } }); } catch (e) {}
  try { Object.defineProperty(window, 'sessionStorage', { configurable: true, get: function () { return ss; } }); } catch (e) {}
  try { document.cookie; } catch (e) {}
})();
