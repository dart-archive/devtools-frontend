/// JS support code for Dart expression evaluation testing.
var thingToEval;

function setThingToEval(x) {
  thingToEval = x;
}

function getThingToEval() {
  return thingToEval;
}

var _scopeVariablesStashed;

function fakeScopeVariablesAs(f) {
  _scopeVariablesStashed =   Dart.scopeVariableThings;
  Dart.scopeVariableThings = f;
}

function restoreScopeVariables() {
  Dart.scopeVariableThings = _scopeVariablesStashed;
}

Dart.FakeExecutionContext = class {
  constructor() {
    this._agent = this;
    this._target = this;
    this._inspectedURLName = 'app_bundle.html';
    this.debuggerModel = this;
    this.selectedCallFrame = null;
    this.origin = 'http://localhost:8081';
  }
}
