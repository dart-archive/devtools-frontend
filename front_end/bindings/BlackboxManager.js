// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 * @implements {SDK.SDKModelObserver<!SDK.DebuggerModel>}
 */
Bindings.BlackboxManager = class {
  /**
   * @param {!Bindings.DebuggerWorkspaceBinding} debuggerWorkspaceBinding
   */
  constructor(debuggerWorkspaceBinding) {
    this._debuggerWorkspaceBinding = debuggerWorkspaceBinding;

    SDK.targetManager.addModelListener(
        SDK.DebuggerModel, SDK.DebuggerModel.Events.GlobalObjectCleared, this._clearCacheIfNeeded.bind(this), this);
    Common.moduleSetting('skipStackFramesPattern').addChangeListener(this._patternChanged.bind(this));
    Common.moduleSetting('skipContentScripts').addChangeListener(this._patternChanged.bind(this));

    /** @type {!Set<function()>} */
    this._listeners = new Set();

    /** @type {!Map<string, boolean>} */
    this._isBlackboxedURLCache = new Map();

    SDK.targetManager.observeModels(SDK.DebuggerModel, this);

    // Initialize Dart patterns.
    const regexPatterns = Common.moduleSetting('skipStackFramesPattern').getAsArray();
    const oldPatterns = regexPatterns.map((p) => p.pattern);
    // Note that we don't blackbox the Dart SDK here, we do it based on ranges in _addScript
    const dartPatterns = [
      '\/ng_zone\.dart$',
      '\/stack_zone_specification\.dart$',
    ];
    for (let i = 0; i < dartPatterns.length; ++i) {
      const dartPattern = dartPatterns[i];
      if (oldPatterns.indexOf(dartPattern) == -1) {
        regexPatterns.push({ pattern: dartPattern});
      }
    }
    Common.moduleSetting('skipStackFramesPattern').setAsArray(regexPatterns);
  }

  /**
   * @param {function()} listener
   */
  addChangeListener(listener) {
    this._listeners.add(listener);
  }

  /**
   * @param {function()} listener
   */
  removeChangeListener(listener) {
    this._listeners.delete(listener);
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel} debuggerModel
   */
  modelAdded(debuggerModel) {
    this._setBlackboxPatterns(debuggerModel);
    const sourceMapManager = debuggerModel.sourceMapManager();
    sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this._sourceMapAttached, this);
    sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this._sourceMapDetached, this);
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel} debuggerModel
   */
  modelRemoved(debuggerModel) {
    this._clearCacheIfNeeded();
    const sourceMapManager = debuggerModel.sourceMapManager();
    sourceMapManager.removeEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this._sourceMapAttached, this);
    sourceMapManager.removeEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this._sourceMapDetached, this);
  }

  _clearCacheIfNeeded() {
    if (this._isBlackboxedURLCache.size > 1024)
      this._isBlackboxedURLCache.clear();
  }

  /**
   * @param {!SDK.DebuggerModel} debuggerModel
   * @return {!Promise<boolean>}
   */
  _setBlackboxPatterns(debuggerModel) {
    const regexPatterns = Common.moduleSetting('skipStackFramesPattern').getAsArray();
    const patterns = /** @type {!Array<string>} */ ([]);
    for (const item of regexPatterns) {
      if (!item.disabled && item.pattern)
        patterns.push(item.pattern);
    }
    return debuggerModel.setBlackboxPatterns(patterns);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  isBlackboxedUISourceCode(uiSourceCode) {
    const projectType = uiSourceCode.project().type();
    const isContentScript = projectType === Workspace.projectTypes.ContentScripts;
    if (isContentScript && Common.moduleSetting('skipContentScripts').get())
      return true;
    const url = this._uiSourceCodeURL(uiSourceCode);
    return url ? this.isBlackboxedURL(url) : false;
  }

  /**
   * @param {string} url
   * @param {boolean=} isContentScript
   * @return {boolean}
   */
  isBlackboxedURL(url, isContentScript) {
    if (this._isBlackboxedURLCache.has(url))
      return !!this._isBlackboxedURLCache.get(url);
    if (isContentScript && Common.moduleSetting('skipContentScripts').get())
      return true;
    const regex = Common.moduleSetting('skipStackFramesPattern').asRegExp();
    const isBlackboxed = (regex && regex.test(url)) || false;
    this._isBlackboxedURLCache.set(url, isBlackboxed);
    return isBlackboxed;
  }

  /**
   * @param {!Common.Event} event
   */
  _sourceMapAttached(event) {
    const script = /** @type {!SDK.Script} */ (event.data.client);
    const sourceMap = /** @type {!SDK.SourceMap} */ (event.data.sourceMap);
    this._updateScriptRanges(script, sourceMap);
  }

  /**
   * @param {!Common.Event} event
   */
  _sourceMapDetached(event) {
    const script = /** @type {!SDK.Script} */ (event.data.client);
    this._updateScriptRanges(script, null);
  }

  /**
   * @param {!SDK.Script} script
   * @param {?SDK.SourceMap} sourceMap
   * @return {!Promise<undefined>}
   */
  async _updateScriptRanges(script, sourceMap) {
    let hasBlackboxedMappings = false;
    if (!Bindings.blackboxManager.isBlackboxedURL(script.sourceURL, script.isContentScript()))
      hasBlackboxedMappings = sourceMap ? sourceMap.sourceURLs().some(url => this.isBlackboxedURL(url)) : false;
    if (!hasBlackboxedMappings) {
      if (script[Bindings.BlackboxManager._blackboxedRanges] && await script.setBlackboxedRanges([]))
        delete script[Bindings.BlackboxManager._blackboxedRanges];
      this._debuggerWorkspaceBinding.updateLocations(script);
      return;
    }

    const mappings = sourceMap.mappings();
    const newRanges = [];
    let currentBlackboxed = false;
    if (mappings[0].lineNumber !== 0 || mappings[0].columnNumber !== 0) {
      newRanges.push({lineNumber: 0, columnNumber: 0});
      currentBlackboxed = true;
    }
    for (const mapping of mappings) {
      if (mapping.sourceURL && currentBlackboxed !== this.isBlackboxedURL(mapping.sourceURL)) {
        newRanges.push({lineNumber: mapping.lineNumber, columnNumber: mapping.columnNumber});
        currentBlackboxed = !currentBlackboxed;
      }
    }

    const oldRanges = script[Bindings.BlackboxManager._blackboxedRanges] || [];
    if (!isEqual(oldRanges, newRanges) && await script.setBlackboxedRanges(newRanges))
      script[Bindings.BlackboxManager._blackboxedRanges] = newRanges;
    this._debuggerWorkspaceBinding.updateLocations(script);

    /**
     * @param {!Array<!{lineNumber: number, columnNumber: number}>} rangesA
     * @param {!Array<!{lineNumber: number, columnNumber: number}>} rangesB
     * @return {boolean}
     */
    function isEqual(rangesA, rangesB) {
      if (rangesA.length !== rangesB.length)
        return false;
      for (let i = 0; i < rangesA.length; ++i) {
        if (rangesA[i].lineNumber !== rangesB[i].lineNumber || rangesA[i].columnNumber !== rangesB[i].columnNumber)
          return false;
      }
      return true;
    }
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {?string}
   */
  _uiSourceCodeURL(uiSourceCode) {
    return uiSourceCode.project().type() === Workspace.projectTypes.Debugger ? null : uiSourceCode.url();
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  canBlackboxUISourceCode(uiSourceCode) {
    const url = this._uiSourceCodeURL(uiSourceCode);
    return url ? !!this._urlToRegExpString(url) : false;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  blackboxUISourceCode(uiSourceCode) {
    const url = this._uiSourceCodeURL(uiSourceCode);
    if (url)
      this._blackboxURL(url);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  unblackboxUISourceCode(uiSourceCode) {
    const url = this._uiSourceCodeURL(uiSourceCode);
    if (url)
      this._unblackboxURL(url);
  }

  blackboxContentScripts() {
    Common.moduleSetting('skipContentScripts').set(true);
  }

  unblackboxContentScripts() {
    Common.moduleSetting('skipContentScripts').set(false);
  }

  /**
   * @param {string} url
   */
  _blackboxURL(url) {
    const regexPatterns = Common.moduleSetting('skipStackFramesPattern').getAsArray();
    const regexValue = this._urlToRegExpString(url);
    if (!regexValue)
      return;
    let found = false;
    for (let i = 0; i < regexPatterns.length; ++i) {
      const item = regexPatterns[i];
      if (item.pattern === regexValue) {
        item.disabled = false;
        found = true;
        break;
      }
    }
    if (!found)
      regexPatterns.push({pattern: regexValue});
    Common.moduleSetting('skipStackFramesPattern').setAsArray(regexPatterns);
  }

  /**
   * @param {string} url
   */
  _unblackboxURL(url) {
    let regexPatterns = Common.moduleSetting('skipStackFramesPattern').getAsArray();
    const regexValue = Bindings.blackboxManager._urlToRegExpString(url);
    if (!regexValue)
      return;
    regexPatterns = regexPatterns.filter(function(item) {
      return item.pattern !== regexValue;
    });
    for (let i = 0; i < regexPatterns.length; ++i) {
      const item = regexPatterns[i];
      if (item.disabled)
        continue;
      try {
        const regex = new RegExp(item.pattern);
        if (regex.test(url))
          item.disabled = true;
      } catch (e) {
      }
    }
    Common.moduleSetting('skipStackFramesPattern').setAsArray(regexPatterns);
  }

  async _patternChanged() {
    this._isBlackboxedURLCache.clear();

    /** @type {!Array<!Promise>} */
    const promises = [];
    for (const debuggerModel of SDK.targetManager.models(SDK.DebuggerModel)) {
      promises.push(this._setBlackboxPatterns(debuggerModel));
      const sourceMapManager = debuggerModel.sourceMapManager();
      for (const script of debuggerModel.scripts())
        promises.push(this._updateScriptRanges(script, sourceMapManager.sourceMapForClient(script)));
    }
    await Promise.all(promises);
    const listeners = Array.from(this._listeners);
    for (const listener of listeners)
      listener();
    this._patternChangeFinishedForTests();
  }

  _patternChangeFinishedForTests() {
    // This method is sniffed in tests.
  }

  /**
   * @param {!Common.Event} event
   */
  _globalObjectCleared(event) {
    const debuggerModel = /** @type {!SDK.DebuggerModel} */ (event.data);
    this._debuggerModelData.delete(debuggerModel);
    this._isBlackboxedURLCache.clear();
  }

  /**
   * @param {!Common.Event} event
   */
  _parsedScriptSource(event) {
    const script = /** @type {!SDK.Script} */ (event.data);
    this._addScript(script);
  }

  /**
   * @param {!SDK.Script} script
   * @return {!Promise<undefined>}
   */
  _addScript(script) {
    if (!script.sourceURL && !script.sourceMapURL)
      return Promise.resolve();
    const blackboxed = this._isBlackboxedScript(script);
    var ranges =  blackboxed ? [{lineNumber: 0, columnNumber: 0}] : [];
    if (script.sourceURL.includes('dart_sdk.js')) {
      // Do the faster check first, then the more careful one where we
      // parse the URL.
      if (new URL(script.sourceURL).pathname.endsWith('dart_sdk.js')) {
        return this._blackboxDartSDK(script);
      }
    } else {
      return this._setScriptState(script, ranges);
    }
  }

  /// Blackbox the Dart SDK, but specifically omit the range that defines
  /// dart.throw and dart.rethrow.
  ///
  /// @param {!SDK.Script script}
  /// @return {!Promise<undefined>}
  _blackboxDartSDK(script) {
    // Since this is called a result of registering the SDK script, we assume
    // it's found and will be served from cache, so we don't even bother to
    // check for status or errors.
    //
    // TODO(alanknight): Is there a better way to ask for this than to load it
    // and assume it comes from cache? And is the network manager the best thing
    // to use?
    return SDK.multitargetNetworkManager.loadResource(script.sourceURL,
      (status, headers, content) => { findAndBlackbox(script, content, this); });

    /// Create a range object for the blackbox ranges, with the given line number.
    function _line(lineNumber) {
      return {lineNumber: lineNumber, columnNumber: 0};
    }

    // We are given the script for the Dart SDK, the content, and the enclosing
    // "this". Find the dart.throw definition by splitting the content into
    // lines and looking for where it starts, and assuming it's the next few
    // lines.
    //
    // TODO(alanknight): Actually get this information from DDC instead
    // of jumping through this expensive hoop.
    //
    // @param {!SDK.Script script}
    // @param {!string content}
    // @param {!SDK.BlackboxManager manager} The closure doesn't see 'this', so
    // pass it in.
    function findAndBlackbox(script, content, manager) {
      const sdkLines = content.split('\n');
      for (var line = 0; line < sdkLines.length; line++) {
        const text = sdkLines[line];
        // This will obviously break if DDC compilation changes this literal.
        if (text == '  dart.throw = function(obj) {') {
          // Ranges array contains positions in script where blackbox state is
          // changed. [(0,0) ... ranges[0]) isn't blackboxed, [ranges[0]
          // ... ranges[1]) is blackboxed...
          //
          // Being a bit liberal with the range to make sure we get it.
          var ranges = [ _line(0), _line(line - 1), _line(line + 6)];
          return manager._setScriptState(script, ranges);
        }
      }
    }
  }

  /**
   * @param {!SDK.Script} script
   * @return {boolean}
   */
  _isBlackboxedScript(script) {
    return this.isBlackboxedURL(script.sourceURL, script.isContentScript());
  }

  /**
   * @param {!SDK.Script} script
   * @return {?Array<!Protocol.Debugger.ScriptPosition>}
   */
  _scriptPositions(script) {
    if (this._debuggerModelData.has(script.debuggerModel))
      return this._debuggerModelData.get(script.debuggerModel).get(script.scriptId) || null;
    return null;
  }

  /**
   * @param {!SDK.Script} script
   * @param {!Array<!Protocol.Debugger.ScriptPosition>} positions
   */
  _setScriptPositions(script, positions) {
    const debuggerModel = script.debuggerModel;
    if (!this._debuggerModelData.has(debuggerModel))
      this._debuggerModelData.set(debuggerModel, new Map());
    this._debuggerModelData.get(debuggerModel).set(script.scriptId, positions);
  }

  /**
   * @param {!SDK.Script} script
   * @param {!Array<!Protocol.Debugger.ScriptPosition>} positions
   * @return {!Promise<undefined>}
   */
  _setScriptState(script, positions) {
    const previousScriptState = this._scriptPositions(script);
    if (previousScriptState) {
      let hasChanged = false;
      hasChanged = previousScriptState.length !== positions.length;
      for (let i = 0; !hasChanged && i < positions.length; ++i) {
        hasChanged = positions[i].lineNumber !== previousScriptState[i].lineNumber ||
            positions[i].columnNumber !== previousScriptState[i].columnNumber;
      }
      if (!hasChanged)
        return Promise.resolve();
    } else {
      if (positions.length === 0)
        return Promise.resolve().then(updateState.bind(this, false));
    }
    return script.setBlackboxedRanges(positions).then(updateState.bind(this));

    /**
     * @param {boolean} success
     * @this {Bindings.BlackboxManager}
     */
    function updateState(success) {
      if (success) {
        this._setScriptPositions(script, positions);
        this._debuggerWorkspaceBinding.updateLocations(script);
        const isBlackboxed = positions.length !== 0;
        if (!isBlackboxed && script.sourceMapURL)
          this._debuggerWorkspaceBinding.maybeLoadSourceMap(script);
      } else {
        const hasPositions = !!this._scriptPositions(script);
        if (!hasPositions)
          this._setScriptPositions(script, []);
      }
    }
  }

  /**
   * @param {string} url
   * @return {string}
   */
  _urlToRegExpString(url) {
    const parsedURL = new Common.ParsedURL(url);
    if (parsedURL.isAboutBlank() || parsedURL.isDataURL())
      return '';
    if (!parsedURL.isValid)
      return '^' + url.escapeForRegExp() + '$';
    let name = parsedURL.lastPathComponent;
    if (name)
      name = '/' + name;
    else if (parsedURL.folderPathComponents)
      name = parsedURL.folderPathComponents + '/';
    if (!name)
      name = parsedURL.host;
    if (!name)
      return '';
    const scheme = parsedURL.scheme;
    let prefix = '';
    if (scheme && scheme !== 'http' && scheme !== 'https') {
      prefix = '^' + scheme + '://';
      if (scheme === 'chrome-extension')
        prefix += parsedURL.host + '\\b';
      prefix += '.*';
    }
    return prefix + name.escapeForRegExp() + (url.endsWith(name) ? '$' : '\\b');
  }
};

Bindings.BlackboxManager._blackboxedRanges = Symbol('blackboxedRanged');

/** @type {!Bindings.BlackboxManager} */
Bindings.blackboxManager;
