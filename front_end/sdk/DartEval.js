/// Represents the context for compilation and evaluation of a Dart expression.
///
/// This can be created in one of two modes, for completion or for compilation.
/// These give different values for things. For example, for completion, we make
/// all variables visible. For compilation we make library private variables
/// visible, because we need to pass those in explicitly, but library public
/// variables are omitted, because we will pick those up by importing.  For
/// compilation we also need to alias the reserved word 'this'.
Dart._Evaluation = class {

    /// @param {SDK.DebuggerModel.CallFrame} callFrame
    /// @param {SDK.ExecutionContext} executionContext
    /// @param {string} dartExpression
    /// @param {bool} forCompletion
    constructor(callFrame, executionContext, dartExpression, forCompletion) {
        this.executionContext = executionContext;
        this.dartExpression = dartExpression;
        this.callFrame = callFrame;
        this._enclosingLibraryName = null;
        this.forCompletion = forCompletion;
        this.aliasForThis = forCompletion ? 'this' : 'THIS';
    }

    /// Return the environments objects that devtools expects for autocompletion
    /// These are the same kind of structur es returned from completionsOnPause
    /// in JavaScriptAutoCompleter.js.
    async environments() {
        const result = [];
        const bindings = await this._bindings();
        const libraryName = await this.currentLibrary();
        const scopeChain = new Dart._JsScopeChain(
            bindings,
            libraryName,
            this.forCompletion,
            this.aliasForThis);
        const dartScopes = await scopeChain.toDartScopeChain();
        const devtoolsBindings = await dartScopes.toDevtoolsForm();
        for (const binding of devtoolsBindings) {
            result.push(this._makeEnvironment(
                binding.name, binding.prefix,
                binding.properties.map(property => property.name).sort()));
        }
        return result;
    }

    /// Create a devtools Environment, see comment for Dart.environments.
    ///
    /// @param {string} title
    /// @param {string} prefix
    /// @param {List<String>} items
    /// @return {Object} An Environment.
    ///
    _makeEnvironment(title, prefix, items) {
        return { title: title, prefix: prefix, items: items };
    }

    /// Return a list of the devtools Bindings for [callFrame].
    ///
    /// Bindings are not defined as a class, but are anonymous JS objects
    /// of the form
    ///  {
    ///    String name,
    ///    List<SDK.RemoteObjectProperty} properties
    ///  }
    ///
    /// @return {!Promise<?Object>} A List<Binding>
    async _bindings() {
        // This is based on completionsOnPause in JavaScriptAutoCompleter.js It
        // differs in that it returns the remote objects, not just the names.
        const scopeChain = this.callFrame.scopeChain();
        const groupPromises = [];
        for (const scope of scopeChain) {
            groupPromises.push(scope.object()
                .getAllProperties(false /* accessorPropertiesOnly */, false /* generatePreview */)
                .then(result => ({ properties: result.properties, name: scope.name() })));
        }
        const fullScopes = await Promise.all(groupPromises);
        this.callFrame.debuggerModel.runtimeModel().releaseObjectGroup('completion');
        return fullScopes;
    }

    /// Return a URL for the query we send to the server to request compilation.
    ///
    /// @return {string}
    async url() {
        const url = this.executionContext.origin; // This is the scheme/host/port.
        const scopeVariables = await this.variableNames();
        const module = await this._currentModuleId();
        // We assume the target name is the name of the html file, and ends in .html
        var targetName = this.executionContext.debuggerModel
            ._agent._target._inspectedURLName;
        targetName = targetName.substring(0, targetName.length - '.html'.length);
        const currentLocation = Bindings.debuggerWorkspaceBinding
            .rawLocationToUILocation(this.callFrame.functionLocation());
        // TODO(alanknight): How do we handle part files?
        const currentFile = currentLocation.uiSourceCode.url();
        const queryParameters = this._queryParameters(scopeVariables,
            [this._enclosingLibraryName, module, targetName, currentFile]);
        return url
            + "/dartDevtools/eval/"
            + encodeURIComponent(this.dartExpression)
            + queryParameters;
    }

    /// Return a string with query parameters for our known arguments.
    ///
    /// The singleParameters should correspond to the hard-coded list of names
    /// in the local parameterNames.
    ///
    /// @param {List<String>} scopeVariables
    /// @param {List<String>} singleParameters
    /// @return {string}
    _queryParameters(scopeVariables, singleParameters) {
        const parameterNames = [
            'enclosingLibraryName',
             'module',
             'targetName',
             'currentFile'];
        const _encode = (name, value) => name + '=' + encodeURIComponent(value);
        const parameters = singleParameters.map(
            (value, i) => _encode(parameterNames[i], value));
        const variables = scopeVariables.map(
            (property) => _encode('property', property));
        return '?' + parameters.concat(variables).join('&');
    }

    /// The name of the current Dart library, where "name" means the key
    /// we can use to look it up in the module on the client.
    ///
    /// This is specific to the legacy module system, and quite heuristic.
    ///
    /// @return {string}
    async currentLibrary() {
        // TODO(alanknight): Something more reliable and less heuristic.
        if (this._enclosingLibraryName) {
            return this._enclosingLibraryName;
        }
        // If DDC hasn't given a name to the function, then v8 will provide one,
        // which will be of the form
        //     dart_library.library.thing_we_want.actualName
        const functionName = this.callFrame.functionName;
        if (functionName.startsWith('dart_library.library')) {
            const name = functionName.split('.')[2];
            // If we're in the Dart SDK, treat that as being in JS,don't have sources.
            // TODO(alanknight): Considering evaluating as Dart when in the SDK,
            // e.g. in dart.throw.
            if (name == 'dart') return null;
            this._enclosingLibraryName = name;
            return name;
        }
        // Methods have names, so using the functionName doesn't work, but
        // methods have a thisObject, which follows a similar naming convention,
        // so we can use that.
        const className = this.callFrame.thisObject().className;
        if (className && className.startsWith('dart_library.library')) {
            this._enclosingLibraryName = className.split('.')[2];
            return this._enclosingLibraryName;
        }
        // If it doesn't match either of these, then evaluate code on the client
        // to enumerate all the libraries in the module to find the one which
        // contains the current function.  It seems possible that the only time
        // we need this is for main, in which case we can find the library name
        // from the module Id, but it's not clear, so let's be sure.
        const moduleId = await this._currentModuleId();
        const expression = 'var module = dart._loadedModules.get("' + moduleId + '"); '
            + 'Object.keys(module).find(x => module[x]["' + functionName + '"])';
        const candidates = await this.callFrame.evaluate(
            {
                expression: expression,
                silent: true,
                returnByValue: true,
                generatePreview: false
            },
            /* userGesture */ false,
            /* awaitPromise */ false);
        const libraryUrl = candidates.object.value;
        const libraryName = this._urlToLibrary(libraryUrl);
        this._enclosingLibraryName = libraryName;
        return this._enclosingLibraryName;
    }

    /// Given the url to a library, return the name of the library as used in
    /// the legacy module system.
    ///
    /// For example, 'package:whatever/my_file.dart' becomes 'my_file'.
    _urlToLibrary(url) {
        if (!url) return null;
        if (url.startsWith('package:')) {
            const file = url.split('/').pop().split('.')[0];
            return file;
        }
        // Otherwise it's a path and will turn into a double-underscore
        // separated name.
        const libraryName = url
            .substring(0, url.length - '.dart'.length)
            .replace(/\//g, '__');
        return libraryName;
    }


    /// The name of the DDC module that the current callFrame is in.
    ///
    /// We do this by finding the URL of the current frame and then looking into
    /// the $dartLoader data structures in the application.
    // TODO(alanknight): Make this less dependent on the module system, or have
    // a version for AMD.
    async _currentModuleId() {
        const url = this.callFrame.functionLocation().script().sourceURL;
        // Escape the source URL just in case there are problem characters.
        const escaped = 'JSON.parse(\'' + JSON.stringify(url) + '\')';
        const module = await this.callFrame.evaluate(
            {
                expression: '$dartLoader.urlToModuleId.get(' + escaped + ')',
                silent: true,
                returnByValue: true,
                generatePreview: false
            },
            /* userGesture */ false,
            /* awaitPromise */ false);
        const moduleId = module.object.value; // e.g. foo/bar/lib/qux.dart
        return moduleId;
    }

    /// A list of of qualified names visible from here.
    ///
    /// @return {List<String>}
    async variableNames() {
        const environments = await this.environments();
        const allNames = [];
        for (const scope of environments) {
            var prefixed;
            if (scope.prefix) {
                prefixed = scope.items.map(thing => scope.prefix + '.' + thing);
            } else {
                prefixed = scope.items;
            }
            // TODO(alanknight): Handle the case of multiple variables with the
            // same name and doing the shadowing correctly.
            allNames.push(...prefixed);
        }
        return allNames;
    }

}
