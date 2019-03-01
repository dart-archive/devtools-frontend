// A module for Dart support, with the classes/functions directly used by
// devtools

// TODO(alanknight): Initialize the namespace properly. Where should
// that happen?
Dart = {};

/// A handler for dealing with system events.
Dart._NotificationHandler = class {

  static register() {
    // Guard against the problem that in tests "SDK" is not defined.
    if (window["SDK"]) {
      SDK.targetManager.addModelListener(
          SDK.DebuggerModel,
          SDK.DebuggerModel.Events.DebuggerPaused,
          this._debuggerPaused);
    }
  }

  static async _isInDartContext() {
    // TODO(alanknight): Reduce code duplication with $dartExpressionFor.
    const executionContext = UI.context.flavor(SDK.ExecutionContext);
    // We can't use selectedCallFrame() because it hasn't been set yet.
    const selectedFrame = executionContext.debuggerModel.callFrames[0];
    // We're not stopped at a breakpoint, treat it as JS.
    if (!selectedFrame) return false;
    const location = Bindings.debuggerWorkspaceBinding
            .rawLocationToUILocation(selectedFrame.functionLocation());
    return location.uiSourceCode.extension() == 'dart';
  }

  static async _debuggerPaused(event) {
    const isDart = await Dart._NotificationHandler._isInDartContext();
    const name = (isDart ? 'Dart' : 'JavaScript') + ' Console';
    var panel = UI.InspectorView.instance()._drawerTabbedLocation.tabbedPane();
    panel.changeTabTitle('console-view', name);
  }
}

Dart._NotificationHandler.register();

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
  // TODO(alanknight): Is there a way we can write more of this logic
  // in Dart.
  // If this doesn't look like a Dart expression, bail out. Currently just
  // checks if it starts with parentheses.
  // TODO(alanknight): Have a better way of escaping to JS.
  if (dartExpression.startsWith('(')) return dartExpression;

  const selectedFrame = executionContext.debuggerModel.selectedCallFrame();
  // We're not stopped at a breakpoint, treat it as JS.
  if (!selectedFrame) return dartExpression;

  const location = Bindings.debuggerWorkspaceBinding
      .rawLocationToUILocation(selectedFrame.functionLocation());
  if (location.uiSourceCode.extension() != 'dart') return dartExpression;

  const evaluation = new Dart._Evaluation(
    selectedFrame,
    executionContext,
    dartExpression,
    false);
  const enclosingLibraryName = await evaluation.currentLibrary();
  try {
    const url = await evaluation.url();
    const response = await Dart.fetch(url);
    const text = await response.text();
    return text;
  } catch (error) {
    const errorText =
      'Error in evaluation: (' + error + ') \\nEvaluating as JavaScript';
    const fallbackValue =
      'console.log("%c' + errorText
      + '", "background-color: hsl(50, 100%, 95%)");'
      + dartExpression;
    return fallbackValue;
  }
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
Dart.fetch = x => fetch(x, { credentials: 'include' });
