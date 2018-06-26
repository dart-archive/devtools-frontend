(function() {
var lookupInJSScope = `function lookupInJsScope(name) {
  try {
    if (name != window[name] || !(name in window)) {
      return name;
    }
  } catch(e) {}
}`;

var lookupInThis = `function lookupInThis(__this, name) {
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
}`;

window.$dartExpressionFor = function(executionContext, dartExpression) {
  var components = dartExpression.split('.');

  // A crude check if all of our components look like valid Dart
  // identifiers.  If any of them fail, just return the original
  // expression and let it be evaluated as Javascript;
  var looksLikeIdentifier = /^[_\$a-zA-Z0-9]*$/g;
  for (let component of components) {
    if (!component.match(looksLikeIdentifier)) {
      return `console.log("%c(Cannot evaluate as a Dart expression, using JS eval)",
    "background-color: hsl(50, 100%, 95%)");
${dartExpression}`;
    }
  }
  var receiver = components[0];
  components.shift();
  var expression = `(function(__this) {
    debugger;
  // TODO: These should probably be helper functions in the DDC runtime.
${lookupInJSScope}
${lookupInThis}

  var dart;
  if (window.dart_library) {
    dart = dart_library.import('dart_sdk').dart;
  } else {
    // Require is asynchronous, but this seems to work, and
    // we know dart_sdk will always be present.
    dart = requirejs('dart_sdk').dart;
  }
  var name = "${receiver}";
  function lookup(name) {
    let jsScopeName = lookupInJsScope(name);
    let thisScopeName = lookupInThis(__this,name);
    var receiverObject;
    if (thisScopeName) {
      receiverObject = dart.dloadRepl(__this, thisScopeName);
      // What if the receiver is correctly null?
      if (receiverObject) return receiverObject;
    }
    try {
      return eval(jsScopeName || receiver);
    } catch (error) {}
  }
  let initial = lookup('${receiver}');
  var handler = {"get": function(target, prop) {
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
       }};
  if (typeof initial == 'object') {
    let proxy = new Proxy(initial, handler);
 /// Wait a minute, what do you want to do here with the proxy??
    eval('(function(arg) { arg.' + components.join('.');})
`;
  for (let getter of components) {
   expression += `result = dart.dloadRepl(result, "${getter}");\n`
  }
  expression += 'return result;})(this)';
  return expression;
}

})();
