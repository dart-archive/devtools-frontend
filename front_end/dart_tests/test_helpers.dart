/// Helpers for testing expression compilation.
///
/// This contains fake objects for a number of devtools objects,
/// functions to return hard-coded versions of these, and a top-level
/// function to mimic passing a URL to the server and
/// receiving a compiled result. This allows us to exercise the code that
/// finds the right context and constructs the request URL without
/// requiring the devtools back-end to give us the real objects.

@JS()
library test_helpers;

import 'dart:async';

import 'package:js/js.dart';

import 'js_interop_for_context_testing.dart';

/// A function that takes
typedef Verifier = void Function(
    {List<String> properties,
    String module,
    String currentFile,
    String targetName});

/// We are given a url and produce compiled code that will evaluate in the
/// right context given the right variables.
/// dartDevtools/eval/expression&variables=...(repeated) and additional query
/// parameters for module, targetName, and currentFile.
/// e.g. http://localhost:8081/dartDevtools/eval/bar?property=THIS&property=_htmlValidator&property=anotherTornOffFunction&property=big&property=fred&property=modalDivElement&property=s&property=tornOffFunction&property=experimental__users__alanknight__ddc_playground__web__main._privateTopLevel&module=experimental%2Fusers%2Falanknight%2Fddc_playground%2Fweb%2Fmain.dart&targetName=app_bundle&currentFile=http%3A%2F%2Flocalhost%3A8081%2Fexperimental%2Fusers%2Falanknight%2Fddc_playground%2Fweb%2Fmain.dart
/// where
///   expression = bar
///   property = THIS
///   property = _htmlValidator
///   ...
///   property = experimental__users__alanknight__ddc_playground__web__main._privateTopLevel
///   module = experimental/users/alanknight/ddc_playground/web/main.dart
///   targetName = app_bundle
///   currentFile = http://localhost:8081/experimental/users/alanknight/ddc_playground/web/main.dart
String fakeCompile(String urlString, Verifier assertions) {
  var uri = Uri.parse(urlString);
  var segments = uri.pathSegments;
  var multiVariables = uri.queryParametersAll;
  var singleVariables = uri.queryParameters;
  var expression = segments.last;
  var module = singleVariables['module'];
  var currentFile = singleVariables['currentFile'];
  var targetName = singleVariables['targetName'];
  var properties = multiVariables['property'];
  assertions(
      properties: properties,
      module: module,
      targetName: targetName,
      currentFile: currentFile);
  var currentFileAsPackage = 'package:' + urlToPackagePath(currentFile);
  return '''
import '$currentFileAsPackage';
temporaryFunction82436245992617(a, b, c, library_name._private) {
  return $expression;
}
''';
}

/// This mimics the logic from the server side.
String urlToPackagePath(String originalUrl) {
  var split = originalUrl.split('/');
  var asPackageReference =
      split.skipWhile((x) => x != 'packages').skip(1).join('/');
  if (asPackageReference != '') {
    return asPackageReference;
  }
  // Otherwise we assume it's in web or test, and probably looks like
  // "http://localhost:8081/foo/bar/web/main.dart"
  var uri = Uri.parse(originalUrl);
  return uri.path;
}

/// A class to describe all the compilation information and allow comparing it
/// in tests.
///
/// We will provide [noteCurrent] as a callback to JS code, which will then
/// create the static [current] value. We can then compare that to an expected
/// value.
class CompilationContext {
  static CompilationContext current;

  List<String> properties;
  String module;
  String targetName;
  String currentFile;

  static noteCurrent({properties, module, currentFile, targetName}) {
    current = CompilationContext()
      ..properties = properties
      ..module = module
      ..currentFile = currentFile
      ..targetName = targetName;
  }

  bool equals(context) {
    if (module != context.module) return false;
    if (currentFile != context.currentFile) return false;
    if (targetName != context.targetName) return false;
    if (properties.length != context.properties.length) return false;
    for (var i = 0; i < properties.length; i++) {
      if (properties[i] != context.properties[i]) return false;
    }
    return true;
  }
}

/// A fake Http response we can give to JavaScript to mimic the server's compiled response.
class FakeResponse {
  text() => futureToPromise(Future.value(_text));
  FakeResponse(this._text);
  String _text;
}

/// An environment, with a prefix and a List of items, but no values.
/// Fake version of what gets returned from Dart.environments
class Environment {
  String prefix;
  List<String> items;
  Environment(this.prefix, this.items);
}

/// Create a new execution context with hard-coded fields as if we were
/// executing a file from the web directory, so it can't just be imported with a
/// package: URL.
newContextInWeb() {
  var context = FakeExecutionContext();
  context.selectedCallFrame = allowInterop(() => FakeCallFrame.inWeb()
    ..evaluationResult = FakeRemoteObject(value: 'foo/bar/web/main.html'));
  return context;
}

/// Create a new execution context with hard-coded fields as if we were
/// executing a file from the lib directory, so normal importing works.
newContextInLib() {
  var context = FakeExecutionContext();
  context.selectedCallFrame = allowInterop(() => FakeCallFrame.inLib()
    ..evaluationResult = FakeRemoteObject(value: 'foo/bar/web/main.html'));
  return context;
}

/// A fake execution context. We write the fake in JS and access it using JS
/// interop because we access JS methods that start with underscores, and if we
/// create it in Dart those will get mangled and be harder to access.
@JS('Dart.FakeExecutionContext')
class FakeExecutionContext {
  @JS('selectedCallFrame')
  external set selectedCallFrame(x);
}

/// A fake that we use to replace the devtools Bindings namespace.
class FakeChromeBindings {
  get debuggerWorkspaceBinding => this;
  UILocation _location = UILocation();
  rawLocationToUILocation(_) => _location;
  FakeChromeBindings({String currentFileUrl}) {
    _location._url = currentFileUrl;
  }
  set currentFileUrl(x) => _location._url = x;
}

/// A fake for devtools UILocation.
///
/// Some of the things we provide really belong on other objects,
/// but we add them here to avoid having quite so many fakes.
class UILocation {
  get columnNumber => 7;
  get lineNumber => 42;

  /// Just use this as its own uiSourceCode.
  get uiSourceCode => this;
  // url would really be on UISourceCode.
  var _url;
  url() => _url;
  extension() => 'dart';
}

/// A fake for the devtools SDK.DebuggerModel.CallFrame.
class FakeCallFrame {
  functionLocation() => this;
  script() => this;
  get sourceURL => 'someURL';

  /// If true we retain scopeChainForWeb, otherwise scopeChainForLib.
  bool inWeb;
  scopeChain() => inWeb ? scopeChainWeb : scopeChainLib;

  /// Allow creating a call frame in one of two flavors, one hard-coded to a
  /// particular file in the web directory, and another in lib.
  FakeCallFrame(this.inWeb);
  FakeCallFrame.inWeb() : inWeb = true;
  FakeCallFrame.inLib() : inWeb = false;

  /// We don't actually evaluate, the test sets the desired result.
  var evaluationResult;
  Promise evaluate(evaluateOptions, userGesture, awaitPromise) {
    return futureToPromise(Future.value(evaluationResult));
  }

  /// A hard-coded scope chain for a sample file in the web directory.
  get scopeChainWeb => [
        Bindings(functionName, {'a': 1, 'b': 2, 'c': 3}),
        Bindings('library',
            {'foo__bar__web__main': _libraryBindingsWeb, 'gets_ignored': 4}),
        Bindings('global_ignored', {})
      ];

  /// Bindings for variables in a library in /web
  static final _libraryBindingsWeb =
      Bindings('foo__bar__web__main', {'_private': 'lib_prop'});

  /// A hard-coded scope chain for a sample file in the lib directory.
  get scopeChainLib => [
        Bindings(functionName, {'x': 99}),
        Bindings('library',
            {'foo__bar__library': _libraryBindingsLib, 'gets_ignored': 4}),
        Bindings('global_ignored', {})
      ];

  /// Bindings for variables in a library in /lib.
  static final _libraryBindingsLib =
      Bindings('foo__bar__library', {'_lib_var': 'lib_prop'});
  get debuggerModel => this;
  runtimeModel() => this;
  releaseObjectGroup(_) => {};
  // Function names are either of this form (for unnamed things) or the actual
  // name (for named functions).
  get _webFunctionName => 'foo__bar__web__main';
  get _libFunctionName => 'foo__bar__library';
  get _functionName => inWeb ? _webFunctionName : _libFunctionName;
  get functionName => 'dart_library.library.$_functionName.actualName';
}

/// Fake for a devtools "Bindings". This is not the same as the Bindings
/// namespace, it's an anonymous object with a name and properties, where the
/// properties are SDK.RemoteObjectProperties.
class Bindings {
  Bindings.raw(this._name, this._properties);
  Bindings(this._name, Map<String, Object> values) {
    _properties = values.keys
        .map((key) =>
            FakeRemoteProperty(key, FakeRemoteObject(value: values[key])))
        .toList();
  }
  String _name;
  List<FakeRemoteProperty> _properties;
  object() => this;
  name() => _name;
  getAllProperties(bool accessorPropertiesOnly, bool generatePreview) =>
      futureToPromise(Future.value(this));
  get properties => _properties;
}

/// Fake for a devtools SDK.RemoteObjectProperty
class FakeRemoteProperty {
  FakeRemoteProperty(this.name, this.value);
  String name;
  var value; // Could be FakeRemoteValue || Bindings
}

/// Fake for the devtools SDK.RemoteObject
class FakeRemoteObject {
  get object => this;
  var value;
  FakeRemoteObject({this.value});
  preview() => FakeRemotePreview();
  getAllProperties(bool accessorPropertiesOnly, bool generatePreview) =>
      value.getAllProperties(accessorPropertiesOnly, generatePreview);
}

/// Fake for a devtools preview of a remote object.
class FakeRemotePreview {
  get type => 'object';
}
