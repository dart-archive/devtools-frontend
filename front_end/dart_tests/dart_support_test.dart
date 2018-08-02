/// Test the dart support functions standalone.

// TODO(alanknight): How do we test things that only run in the context of
// devtools?

@JS()
library dart_support_test;

@TestOn('chrome')
import 'package:test/test.dart';
import 'package:js/js.dart';
import 'dart:html';
import 'dart:async';
import 'dart:developer';

@JS()
external String $dartExpressionFor(context, String expression);

@JS('eval')
external jsEval(String expression);

unmodified(String s) {
  var result = $dartExpressionFor(null, s);
  expect(result.split('\n').last.trim(), s);
}

main() async {

  setUp(() async {
    var element = new ScriptElement()
      ..type = 'text/javascript'
      ..src = 'packages/dart_devtools/sdk/DartSupport.js';
    document.body.append(element);
    await new Future.delayed(new Duration(seconds: 2));
    await element.onLoad.take(1);
  });

  test("Doesn't look like Dart", () {
    unmodified('a/&*');
  });

  // It would be useful to test evaluation of Dart expressions
  // and them correctly finding variables in scope, but I'm
  // fairly convinced that this isn't going to be possible without spawning an
  // isolate or something similar.
}
