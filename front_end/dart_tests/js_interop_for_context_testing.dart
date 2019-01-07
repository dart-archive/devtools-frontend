/// Library with JS interop calls we use in evaluation testing.
///
/// We use JS interop to fake the devtools back-end calls with
/// calls that return our own hard-coded test data, and to evaluate
/// code in a library without needing devtools facilities.

@JS()
library js_interop_for_context_testing;

import 'dart:async';
import 'dart:html';
import 'package:js/js.dart';

/// The main JS entry point for rewriting expressions.
@JS()
external String $dartExpressionFor(context, String expression);

/// The main JS entry point for rewriting expressions.
@JS('Dart.environments')
external environments(callFrame);

@JS('Dart._Evaluation')
class Evaluation {
  external factory Evaluation(
      callFrame, executionContext, String dartExpression, bool forCompletion);

  /// Produce a list of qualified names from our environments.
  external List<String> variableNames();
}

/// Wrap the JS function to return a Dart Future.
Future dartExpressionFor(context, String expression) =>
    promiseToFuture($dartExpressionFor(context, expression));

/// Replace the Chrome back-end calls that give us the scope variables with a
/// function that returns hard-coded versions.
@JS()
external String fakeScopeVariablesAs(f);

/// Restore the Chrome back-end calls.
@JS()
external String restoreScopeVariables();

/// Lets us fake out the Devtools Bindings namespace.
@JS('Bindings')
external set ChromeBindings(newBindings);

@JS('Bindings')
external get ChromeBindings;

/// We have a Dart.fetch which defaults to the normal fetch, but can be faked
/// out.
@JS('Dart.fetch')
external set fetch(fetchFunction);

/// JavaScript eval.
@JS('eval')
external jsEval(String expression);

/// Set the expression in JS that we want to evaluate
@JS('setThingToEval')
external void jsSetThingToEval(String javaScriptExpression);

@JS('getThingToEval')
external String jsGetThingToEval();

@JS('Promise')
class Promise {
  external Promise(void callback(resolveFunction, rejectFunction));
}

/// Convert a Dart future to a JS Promise so we can fake internal Devtools async
/// APIs.
Promise futureToPromise(Future future) {
  void promiseHandler(resolveFn, rejectFn) {
    future.then((value) {
      resolveFn(value);
    }).catchError((error) {
      rejectFn(error);
    });
  }

  return new Promise(allowInterop(promiseHandler));
}
