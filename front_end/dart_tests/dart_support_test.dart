library dart_support_test;

@TestOn('chrome')
import 'package:test/test.dart';
import 'package:js/js.dart';
import 'dart:html';
import 'dart:async';
// TODO(alanknight): Would it be better to pre-compile this and load it from a
// script tag?
import 'context_for_evaluation.dart' as context;
import 'js_interop_for_context_testing.dart';
import 'test_helpers.dart';

/// Assert that the dart expression for [s] is [s].
unmodified(String s) async {
  var result = await dartExpressionFor(null, s);
  expect(result.split('\n').last.trim(), s);
}

// TODO(alanknight): Test in a method
// TODO(alanknight): Test in a closure in a method
// TODO(alanknight): Test in a closure after the method has exited.
// TODO(alanknight): Test in an async method after we've awaited
// TODO(alanknight): Test variables renamed by DDC
// TODO(alanknight): Test imported variables, including imported with a prefix.

/// Create a script element for [path] to load it.
ScriptElement loadScript(String path) {
  // Note that we have to do this in a separate non-async method
  // because of https://github.com/dart-lang/sdk/issues/35020
  var element = new ScriptElement()
    ..type = 'text/javascript'
    ..async = false
    ..src = path;
  document.head.append(element);
  return element;
}

/// Keep a global flag to see if we've loaded the JS scripts.
bool loaded = false;

main() async {
  setUp(() async {
    // Load the Devtools Dart code and our support script.
    if (loaded) return new Future.value(null);
    var scripts = [
      'sdk/DartSupport.js',
      'sdk/DartEval.js',
      'sdk/DartScopes.js',
      'test_support.js'
    ].map((x) => 'packages/dart_devtools/$x');
    for (var s in scripts) {
      await loadScript(s).onLoad.first;
    }
    loaded = true;
  });

  test("Not Dart code bails out", () {
    unmodified('(a/&*');
  });

  test("Basic evaluating in a context", () {
    // The 'context' library has hard-coded evaluation points. Make sure that we
    // can evaluate a simple expression. Note that this string is JavaScript.
    jsSetThingToEval('2 + 2');
    context.run();
    // It gets assigned to a variable in the library, so check that.
    expect(context.result, 4);
  });

  /// A hard-coded answer suitable for passing to Dart.variableNames.
  environment1(executionContext, bool forCompletion, String aliasForThis) => [
        Environment(null, ['a', 'b', 'c']),
        Environment('library_name', ['_private'])
      ];

  group("Completion:", () {
    test("finds Dart variables in web", () async {
      // Set the call frame so it finds a module name.
      var callFrame = FakeCallFrame.inWeb()
        ..evaluationResult = FakeRemoteObject(value: 'foo/bar/web/main.dart');
      var evaluation = Evaluation(callFrame, null, null, true);
      var names = await promiseToFuture(evaluation.variableNames());
      var expected = ['a', 'b', 'c', 'foo__bar__web__main._private'];
      expect(names, equals(expected));
    });

    test("finds Dart variables in lib", () async {
      // Set the call frame so it finds a module name.
      var callFrame = FakeCallFrame.inLib()
        ..evaluationResult = FakeRemoteObject(value: 'foo/bar/library.dart');
      var evaluation = Evaluation(callFrame, null, null, true);
      var names = await promiseToFuture(evaluation.variableNames());
      var expected = ['foo__bar__library._lib_var', 'x'];
      expect(names, equals(expected));
    });
  });

  group("Compiling:", () {
    setUp(() {
      ChromeBindings = FakeChromeBindings(
          currentFileUrl: "http://localhost:8081/foo/bar/web/main.dart");
      fakeScopeVariablesAs(allowInterop(environment1));
      // Replace the HTTP fetch with something that mimics the server logic for
      // creating the input Dart code.
      fetch = allowInterop((url) =>
          FakeResponse(fakeCompile(url, CompilationContext.noteCurrent)));
    });

    tearDown(() {
      restoreScopeVariables();
    });
    expectCompilesTo(String expression, String expected) async {
      var rewritten = await dartExpressionFor(newContextInWeb(), expression);
      // The result will have two lines of prologue relying on the legacy module
      // system. Allow either that or just the code part for the expected value.
      if (rewritten == expected) return;
      var justTheCode = rewritten.split("\n").skip(2).join("\n");
      expect(justTheCode, expected);
    }

    test("Hard-coded rewrite", () {
      fetch = allowInterop((url) => FakeResponse('\n\nabc'));
      return expectCompilesTo('ignoredDartExpression', 'abc');
    });

    test("Variables in web", () async {
      var expectedContext = CompilationContext()
        ..properties = ['a', 'b', 'c', 'foo__bar__web__main._private']
        ..module = 'foo/bar/web/main.html'
        ..currentFile = "http://localhost:8081/foo/bar/web/main.dart"
        ..targetName = 'app_bundle';
      await dartExpressionFor(newContextInWeb(), 'a + 2');
      var current = CompilationContext.current;
      expect(current.equals(expectedContext), isTrue);
    });

    test("Variables in lib", () async {
      ChromeBindings.currentFileUrl =
          "http://localhost:8081/foo/bar/library.dart";
      var expectedContext = CompilationContext()
        ..properties = ['foo__bar__library._lib_var', 'x']
        ..module = 'foo/bar/web/main.html'
        ..currentFile = "http://localhost:8081/foo/bar/library.dart"
        ..targetName = 'app_bundle';
      await dartExpressionFor(newContextInLib(), 'a + 2');
      var current = CompilationContext.current;
      expect(current.equals(expectedContext), isTrue);
    });

    test("Dart code (/web)", () async {
      var expectedCode = '''
import 'package:/foo/bar/web/main.dart';
temporaryFunction82436245992617(a, b, c, library_name._private) {
  return a + 2;
}
''';
      expectCompilesTo('a + 2', expectedCode);
    });
    test("Dart code (/lib)", () async {
      ChromeBindings = FakeChromeBindings(
          currentFileUrl:
              'http://localhost:8081/foo/bar/web/packages/foo.bar/lib_file.dart');
      var expectedCode = '''
import 'package:foo.bar/lib_file.dart';
temporaryFunction82436245992617(a, b, c, library_name._private) {
  return c;
}
''';
      expectCompilesTo('c', expectedCode);
    });
  });
}
