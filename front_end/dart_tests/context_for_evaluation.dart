// Context for tests to exercise evaluating expressions.

import 'js_interop_for_context_testing.dart';

someRandomName(x) => x;

var thing = '123';

var _private = '456';

var result;

func(a, b, c) {
  // In these tests we aren't running devtools, so we can't just
  // evaluate code at arbitrary points. So we allow an expression
  // to be set and evaluate it manually at a hard-coded point.
  result = jsEval(jsGetThingToEval());
  return (x) => x + b;
}

run() {
  var f = func(1, 2, 3);
  print(f(2));
}
