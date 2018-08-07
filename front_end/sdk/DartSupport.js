// TODO(alanknight): Initialize the namespace properly. Where should
// that happen?
Dart = {}

/**
 * @implements {UI.ActionDelegate}
 * @unrestricted
 */
Dart.ReloadActionDelegate = class {

  constructor() {
    this.hotRestartCommand =
      'if (window.dart_library) {dart_library.reload();}';
  }

  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    switch (actionId) {
      case 'dart.dart-reload':
        const executionContext = UI.context.flavor(SDK.ExecutionContext);
        executionContext
          .evaluate(
              {expression: this.hotRestartCommand},
              /* userGesture */ false,
              /* awaitPromise */ false);
        return true;
    }
    return false;
  }
};

Dart.ToggleSourcemapsActionDelegate = class {

  constructor() {}

  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    switch (actionId) {
      // TODO(alanknight): Consider moving this somewhere else and upstreaming.
      case 'dart.toggleSourcemaps':
        const setting = Common.moduleSetting('jsSourceMapsEnabled');
        setting.set(!setting.get());
        return true;
    }
    return false;
  }
};


(function() {
var lookupInJSScope = `function lookupInJsScope(name) {
  try {
    if (name != window[name] || !(name in window)) {
      return name;
    }
  } catch(e) {}
}`;

var lookupInThis = `function lookupInThis(__this, name) {
  var found = false;
  let type = dart.getReifiedType(__this) == "NativeJavaScriptObject"
      ? null : dart.getType(__this);
  dart._dhelperRepl(__this, name, (resolvedName) => {
    var f = dart._canonicalMember(__this, resolvedName);
    if (dart.hasField(type, f) || dart.hasGetter(type, f) || dart.hasMethod(type, f)) {
      found = true;
    }
  });
  if (found) return name;
};`;

window.$dartExpressionFor = function(executionContext, dartExpression) {
  var components = dartExpression.split('.');

  // A crude check if all of our components look like valid Dart
  // identifiers.  If any of them fail, just return the original
  // expression and let it be evaluated as Javascript;
  var looksLikeIdentifier = /^[_\$a-zA-Z0-9]*$/g;
  for (let component of components) {
    if (!component.match(looksLikeIdentifier)) {
      return `console.log("%c(Cannot evaluate as a Dart expression, using JS eval)",
          "background-color: hsl(50, 100%, 95%)");
      ${dartExpression}`;
    }
  }
  var receiver = components[0];
  components.shift();
  var expression = `
(function(__this) {
  // TODO: These should probably be helper functions in the DDC runtime.
${lookupInJSScope}
${lookupInThis}

  var dart;
  if (window.dart_library) {
    dart = dart_library.import('dart_sdk').dart;
  } else {
    // Require is asynchronous, but this seems to work, and
    // we know dart_sdk will always be present.
    dart = requirejs('dart_sdk').dart;
  }
  var name = "${receiver}";
  var jsScopeName = lookupInJsScope(name);
  var thisScopeName = lookupInThis(__this,name);
  var receiverObject;
  if (name == "this") {
    receiverObject = __this;
  } else if (thisScopeName) {
    receiverObject = dart.dloadRepl(__this, thisScopeName);
  }
  var result = receiverObject || eval(jsScopeName || name);`

  for (let getter of components) {
    expression += `result = dart.dloadRepl(result, "${getter}");\n`
  }
  expression += 'return result;})(this)';
  return expression;
}

})();
