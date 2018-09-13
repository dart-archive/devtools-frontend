// Functions specific to Dart support.

// TODO(alanknight): Initialize the namespace properly. Where should
// that happen?
Dart = {};

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
            { expression: this.hotRestartCommand },
              /* userGesture */ false,
              /* awaitPromise */ false);
        return true;
    }
    return false;
  }
};

Dart.ToggleSourcemapsActionDelegate = class {

  constructor() { }

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

/// Convert a Dart expression to JavaScript.
///
/// We wrap the expression in a function which provides the local scope
/// variables. That lets us evaluate the expression as a standalone function and
/// not try to evaluate in the right scope.
///
/// @param {SDK.ExecutionContext} executionContext
/// @param {string} dartExpression
/// @return {string} dartExpression compiled to JavaScript
window.$dartExpressionFor = async function (executionContext, dartExpression) {
  // If this doesn't look like a Dart expression, bail out. Currently just
  // checks if it starts with parentheses.
  // TODO: Check if we're in a JS context, and do something gaenerally better.
  if (dartExpression.startsWith('(')) return dartExpression;
  // We can't shadow 'this' with a parameter in JS, so replace references to it
  // with a variable named THIS.
  const thisMatcher = /\bthis\b/g;
  dartExpression = dartExpression.replace(thisMatcher, 'THIS');

  const selectedFrame = executionContext.debuggerModel.selectedCallFrame();
  // We're not stopped at a breakpoint, treat it as JS.
  if (!selectedFrame) return dartExpression;
  const evaluation = new Dart._Evaluation(
      selectedFrame,
      executionContext,
      dartExpression,
      false);
  const enclosingLibraryName = await evaluation.currentLibrary();
  if (!enclosingLibraryName) return dartExpression;

  const response = await Dart.fetch(await evaluation.url());
  const text = await response.text();
  return text;
}

/// Return the environments for [callFrame].
///
/// If forCompletion is true then we include 'this' as a valid name.  If
/// forCompletion is false then we're sending the expression for compilation and
/// we need to replace 'this' with an alias, since it's a reserved word.
///
/// Environment is not defined as a class, but is an anoymous JavaScript object
/// of the form
///
///   {
///     String title,
///     String prefix,
///     List<String> items
/// }
///
/// This will be called by the devtools autocomplete code.
///
/// @param {!SDK.DebuggerModel.CallFrame} callFrame
/// @return {!Promise<?Object>} A List<Environment>.
Dart.environments = async function (callFrame) {
  // We don't actually need the executionContext for this, but it's nice
  // to have it consistently whether we're doing completion or compilation.
  // In tests we can't do that, so just leave it null.
  const context = UI ? UI.context.flavor(SDK.ExecutionContext) : null;
  const evaluation = new Dart._Evaluation(
      callFrame,
      context,
      /* dartExpression */ null,
      true);
  return evaluation.environments();
}

/// Allow us to mock the Http fetch operation in tests.
Dart.fetch = x => fetch(x);
