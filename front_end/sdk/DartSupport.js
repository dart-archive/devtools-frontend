(function() {
window.$dartEvaluateExpression = function(object, path) {
  var dart = dart_library.import('dart_sdk').dart;

  var components = path.split('.');
  var result = object;

  for (var i = 0; i < components.length; i++) {
    var member = components[i];

    result = dart.dloadRepl(result, member);
  }
  return result;
};

if (typeof $d == 'undefined') {
  window.$d = window.$dartEvaluateExpression;
}

var lookupInJSScope = `(function(name) {
  try {
    if (name != window[name] || !(name in window)) {
      return name;
    }
  } catch(e) {}
})`;

var lookupInThis = `(function(__this, name) {
  var found = false;
  let type = dart.getReifiedType(__this) == "NativeJavaScriptObject"
      ? null : dart.getType(__this);
  dart._dhelperRepl(__this, name, (resolvedName) => {
    var f = dart._canonicalMember(__this, resolvedName);
    if (dart.hasField(type, f) || dart.hasGetter(type, f) || dart.hasMethod(type, f)) {
      found = true;
    }
  });
  if (found) return name;
})`;

window.$dartExpressionFor = function(executionContext, dartExpression) {
  var components = dartExpression.split('.');

  // A crude check if all of our components look like valid Dart
  // identifiers.  If any of them fail, just return the original
  // expression and let it be evaluated as Javascript;

  var looksLikeIdentifier = /^[_\$a-zA-Z0-9]*$/g;
  for (let component of components) {
    if (!looksLikeIdentifier.exec(component)) return dartExpression;
  }
  var receiver = components[0];
  components.shift();
  var expression = '(function(__this) {\n';
  expression += "debugger;";
  expression += "const dart = dart_library.import('dart_sdk').dart;\n";
  name = receiver;
  expression += ' function lookup(name) {';
  expression += 'let jsScopeName = ' + lookupInJSScope + '("' + receiver + '");\n';
  expression += 'let thisScopeName = ' + lookupInThis + '(__this,"' + receiver + '");\n';
  expression += 'let receiverObject;\n';
  expression += "if (thisScopeName) receiverObject = dart.dloadRepl(__this, thisScopeName);\n";
  expression += "let result = receiverObject || eval(jsScopeName || receiver);\n";
  expression += 'return result;}';
  expression += 'let initial = lookup(receiver);';
  expression += `var handler = {"get": function(target, prop) {
       console.log("getting " + prop + "from " + target);
       let placeholder = {};
       let result = placeholder;
       console.log("indexing");
       try { result = dart.dindex(target, prop);} catch(e) { console.log(e);};
       console.log("indexed result 1 == " + result);
       if (result === placeholder) {
         try { result = dart.dindex(target, parseInt(prop));} catch(e) {console.log(e)};
       }
       console.log("indexed result == " + result);
       console.log("vs. placeholder " + (result === placeholder));
       if (result === placeholder) result = dart.dloadRepl(target, prop);
       if (typeof result == 'object') {
         return new Proxy(result, handler);}
       else {
         return result;}
       }};`;
  expression += 'let proxy = new Proxy(initial, handler)\n';
  for (let getter of components) {
    expression += 'result = dart.dloadRepl(result, "' + getter + '");';;
  }
  expression += 'return result;})(this)';
//  console.log("Converted Dart expression to:\n" + expression);
  return expression;
}

})();
