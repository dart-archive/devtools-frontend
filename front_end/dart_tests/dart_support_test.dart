/// Test the dart support functions standalone.

// TODO(alanknight): How do we test things that only run in the context of
// devtools? Are we going to need to integrate with devtools tests.

@JS()
library dart_support_test;

@TestOn('chrome')
import 'package:test/test.dart';
import 'package:js/js.dart';
import 'dart:html';
import 'dart:async';

@JS()
external String $dartExpressionFor(context, String expression);

@JS('eval')
external jsEval(String expression);

unmodified(String s) {
  var result = $dartExpressionFor(null, s);
  expect(result.split('\n').last, s);
}

class ThingWithFields {
  var a = 1;
  var _b = 2;
  final c = 3;
  final _d = 4;
  get d => _d;
}

var globalThing = new ThingWithFields();

eval(String expression) {
  var rewritten = $dartExpressionFor(null, expression);
  return jsEval(rewritten);
}

main() async {
  var aString = "abc";
  var aList = [3, 2, 1];
  var aMap = {"a": "b", "c": "d", "7": "Hey!"};
  var thing = new ThingWithFields();

  setUp(() async {
    var element = new ScriptElement()
      ..type = 'text/javascript'
      ..src = 'packages/devtools_frontend_dart/sdk/DartSupport.js';
    document.body.append(element);
    await new Future.delayed(new Duration(seconds: 1));
    await element.onLoad.take(1);
  });

  test("Doesn't look like Dart", () {
    unmodified('a/&*');
  });

  test("local string", () {
    expect(eval('aString'), 'abc');
  });

  test("local list", () {
    expect(eval('aList'), 'aList');
  });

}
