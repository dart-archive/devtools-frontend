/// Test the dart support functions standalone.

// TODO(alanknight): How do we test things that only run in the context of
// devtools? Are we going to need to integrate with devtools tests.

@JS()
library dart_support_test;

@TestOn('chrome')
import 'package:test/test.dart';
import 'package:js/js.dart';
import 'dart:html';

@JS()
external String $dartExpressionFor(context, String expression);

main() async {
  await init();

  test("Doesn't look like Dart", () {
    expect($dartExpressionFor(null, 'a/&*'), 'a/&*');
  });
}

init() async {
  var element = new ScriptElement()
    ..type = 'text/javascript'
    ..src = '/packages/devtools_frontend_dart/sdk/DartSupport.js';
  document.body.append(element);
  await element.onLoad.take(1).drain();
}
