/// Code to support Dart evaluation scopes.

/// A scope chain as the scopes appear in JS, and as they are given to us from devtools.
Dart._JsScopeChain = class {
    /// @param {!List<Object>} scopes. List of {String name,
    ///     List<SDK.RemoteObjectProperty properties}
    /// @param {string} libraryName. It is is of the form path__to__file with no
    ///     extension.
    /// @param {boolean} forCompletion. True if this is for autocomplete, false
    ///     for compilation
    /// @param {string} aliasForThis. Name to replace the reserved word 'this'
    ///     with in parameter lists.
    constructor(scopeList, libraryName, forCompletion, aliasForThis) {
        this.scopes = [];
        this.libraryName = libraryName;
        this.forCompletion = forCompletion;
        this.aliasForThis = aliasForThis;
        // The last scope will be global. We don't care about that.
        // We assume second-last is the library, and the ones before that
        // are methods and closures.
        var numberOfMethods = scopeList.length - 2;
        this.methodScopes = scopeList.slice(0, numberOfMethods).map((scope) =>
            new Dart._MethodScope(scope, null, null, aliasForThis));
        this.libraryScope = new Dart._LibraryScope(
            scopeList[scopeList.length - 2], null, null, this.libraryName);
        this.dartThisScope = null;
    }

    /// Convert to a scope chain that represents the variables visible under
    /// Dart semantics.
    ///
    /// @return {!Promise<_DartScopeChain>}
    async toDartScopeChain() {
        // In the scope of the surrounding libraries, most of the variables
        // aren't visible to Dart. We have objects for Dart libraries, but we
        // need to promote their variables to make them visible. We find those
        // as the remote properties whose description is Object or Proxy. For
        // code completion we want to expand those. For compilation visibility
        // we ignore them, as the compiler will reference them directly.
        // TODO(alanknight): Should we expand all libraries? Skip dart:core?
        // Should libraries with a $ suffix, (e.g. fixnum) be expanded?

        // Method scope.
        this.methodScopes = this.methodScopes.map(scope => scope.toDartScope());

        // Add a scope for [this] if present.
        this.dartThisScope = (await this.thisScope(this.libraryName)).toDartScope();

        // TODO(alanknight): Is there always an active library? Can we rely on
        // having bailed out well before this if we're in a JS scope.
        const libraries = await this.libraryScope.expanded(this.forCompletion);
        return new Dart._DartScopeChain(
            this.methodScopes, this.dartThisScope, libraries);
    }

    /// The scope corresponding to [this].
    /// @return {!_ThisScope}
    async thisScope(libraryName) {
        // We may have nested closures. Return the scope of [this] for the first
        // one that has a valid [this], to avoid including its values more than
        // once.
        for (const scope of this.methodScopes) {
            await scope._addThisIfMissing(libraryName);
            const thisScope = await scope.thisScope(libraryName);
            if (thisScope.isNotEmpty()) return thisScope;
        }
        // We didn't find a non-empty [_ThisScope]. Return the first (empty) one.
        return this.methodScopes[0].thisScope(libraryName);
    }
}

/// A scope chain that shows all the visible Dart objects, and only those.
Dart._DartScopeChain = class {

    /// @param {!Dart._MethodScope} methodScope. The scope of the current method
    /// @param {!Dart._ThisScope} thisScope. The visible fields and torn-off
    ///     methods of 'this', an empty scope if 'this' is unbound.
    /// @param {!List<DartLibraryScope>} libraryScopes. The scopes of visible
    ///     libraries.
    /// @param {string} aliasForThis. Name to replace the reserved word 'this'
    ///    with in parameter lists.
    constructor(methodScopes, thisScope, libraryScopes) {
        this.methodScopes = methodScopes;
        this.thisScope = thisScope;
        this.libraryScopes = libraryScopes;
    }

    _allScopes() {
        return [...this.methodScopes, this.thisScope, ...this.libraryScopes];
    }

    /// Convert this back to the list of objects form that Devtools expects.
    toDevtoolsForm() {
        return this._allScopes().map(scope => scope.toDevtoolsForm());
    }
}

/// Abstract superclass for individual scopes of different types.
Dart._Scope = class _Scope {
    /// This can be passed in either scope or a name and property list.  The
    /// [name] or [properties] take precedence over the [scope] values.
    ///
    /// @param {!Dart.Scope || Object} scope. Either one of our scopes or one of
    ///    the anonymous objects that are returned from the devtools scopeChain
    ///    calls.
    /// @param {string} name. Comes from the Devtools scopes. We don't use it,
    ///     but it's useful for debugging.
    /// @param {!List<SDK.RemoteObjectProperty || Object>} properties. The
    ///     properties in this particular scope
    constructor(scope, name, properties) {
        this.name = name || scope.name;
        this.properties = properties || scope.properties;
    }

    /// The property with the given name, or undefined if there is no such
    /// property.
    ///
    /// @param {string} propertyName
    /// @return {SDK.RemoteObjectProperty || Object}
    propertyNamed(propertyName) {
        return this.properties.filter(prop => prop.name == propertyName)[0];
    }

    /// All the properties whose names are not symbols.
    ///
    /// @return {SDK.RemoteObjectProperty || Object}
    propertiesWithoutSymbols() {
        // These are remote objects, but we can tell which ones are symbols
        // without a round-trip because their string name in the remote object
        // starts with 'Symbol('
        return this.properties.filter(
            property => !this.propertyIsSymbol(property));
    }

    /// Determine if a property is a symbol without a round-trip by looking at
    /// its name.
    ///
    /// @param {string} property
    /// @return {bool}
    propertyIsSymbol(property) {
        return property.name.startsWith('Symbol(');
    }

    /// Returns a new scope modified to reflect Dart visibility for a scope of
    /// this type.
    toDartScope() {
        return this;
    }

    /// Convert back to the form that devtools expects internally, anonymous
    /// Objects with name and properties.
    toDevtoolsForm() {
        return { name: this.name, properties: this.properties };
    }

    /// Get all the internal properties of the object, because they should be
    /// visible in Dart scope.
    ///
    /// The [remoteObject] represents either a library or the current 'this'.
    ///
    /// @param {SDK.RemoteObjectProperty} remoteObject
    /// @return {List<SDK.RemoteObjectProperty}
    async expand(remoteObject) {
        if (!remoteObject || remoteObject.name.startsWith('_')) {
            return [];
        }
        var result = await remoteObject.value.getAllProperties(false, false);
        return result.properties;
    }
}

/// A scope for a method/function/closure, with all of its local variables.
Dart._MethodScope = class _MethodScope extends Dart._Scope {
    /// @param {!Dart.Scope || Object} scope. Either one of our scopes or one of
    ///     the anonymous objects that are returned from the devtools scopeChain
    ///     calls.
    /// @param {string} name. Comes from the Devtools scopes. We don't use it,
    ///     but it's useful for debugging.
    /// @param {!List<SDK.RemoteObjectProperty || Object>} properties. The
    ///     properties in this particular scope
    /// @param {string} aliasForThis. The name to use to replace the reserved
    /// word 'this' in parameter lists.
    constructor(scope, name, properties, aliasForThis) {
        super(scope, name, properties);
        this.self = this.properties.filter(x => x.name == 'this')[0];
        this.aliasForThis = aliasForThis;
        this._thisScope = null;
    }

    /// Returns a scope for the variables visible in 'this', if 'this' is bound,
    /// otherwise returns an empty Dart._ThisScope.
    ////
    /// @param {string} libraryName. Used when we have to find a 'this' which wasn't
    ///     in the original scopes, but we want to avoid just duplicating the library.
    /// @return {Dart._ThisScope}
    async thisScope(libraryName) {
        if (this._thisScope) return this._thisScope;
        var properties = (await this.expand(this.self)) || [];
        this._thisScope =
            new Dart._ThisScope(null, 'this', properties, this.aliasForThis);
        return this._thisScope;
    }

    /// Fill in the 'this' scope if it wasn't in the original call.
    ///
    /// If we were not given a 'this' value in the devtools scopes that might mean
    /// we're in a nested closure, or we might be a top-level function.
    /// Construct a 'this'. If it turns out to be null/undefined, make it empty.
    /// If it just duplicates the containing library, ignore it. Otherwise insert
    /// it into the scope where it will get expanded normally.
    ///
    /// @param {string} libraryName. Used when we have to find a 'this' which wasn't
    ///     in the original scopes, but we want to avoid just duplicating the library.
    /// @return {void}  Modifies this.self and this._thisScope
    async _addThisIfMissing(libraryName) {
        if (this._thisScope || this.self) return;
        // If 'this' is the same as the current library, then return null, otherwise
        // return 'this'. Finding the current library is a bit painful.
        // This is very specific to the legacy module system.
        const findCurrent = '(function () {'
            + 'let libs = dart_library.debuggerLibraries();'
            + 'for (var i = 0; i < libs.length; i++) { lib = libs[i]; '
            + 'if (lib.hasOwnProperty("' + libraryName + '")) {'
            + '  return lib["' + libraryName + '"];}}})() === this ? null : this';

        var actualThis = await Dart._Evaluation._evaluate(findCurrent);
        // Guard against a null result, particularly in tests
        actualThis = actualThis && actualThis.object;
        if (actualThis) {
            // Construct something that looks like a RemoteObjectProperty
            this.self = { name: 'this', value: actualThis };
            this.properties.push(this.self);
        } else {
            this._thisScope =
                new Dart._ThisScope(null, 'empty', [], this.aliasForThis);
        }
    }

    /// Convert back to the form that devtools expects internally, anonymous
    /// Objects with name and properties.
    ///
    /// @return {Object}
    toDevtoolsForm() {
        const aliased = this.properties.map(
            prop => prop.name === 'this' ? { name: this.aliasForThis } : prop);
        return { name: this.name, properties: aliased };
    }
}

/// Represents the variables visible from the current object.
Dart._ThisScope = class _ThisScope extends Dart._Scope {
    /// @param {!Dart.Scope || Object} scope. Either one of our scopes or one of
    ///     the anonymous objects that are returned from the devtools scopeChain
    ///     calls.
    /// @param {string} name. Comes from the Devtools scopes. We don't use it,
    ///     but it's useful for debugging.
    /// @param {!List<SDK.RemoteObjectProperty || Object>} properties. The
    ///     properties in this particular scope
    /// @param {string} aliasForThis. The name to use to replace the reserved
    ///     word 'this' in parameter lists.
    constructor(scope, name, properties, aliasForThis) {
        super(scope, name, properties);
        this.aliasForThis = aliasForThis;
    }

    /// Returns a scope which includes fields of the current object, which are
    /// visible without a prefix in Dart.
    ///
    /// @return {Dart._ThisScope}
    toDartScope() {
        // Private instance fields have a name that's a symbol. Strip it down to
        // just the private name.
        const newProperties = [];
        for (const property of this.properties) {
            if (property.name.startsWith('Symbol(_')) {
                newProperties.push({
                    name: property.name.substring(
                        'Symbol('.length,
                        property.name.length - 1)
                });
            } else {
                newProperties.push(property);
            }
        }
        const newScope = new this.constructor(
            null,
            this.name,
            newProperties,
            this.aliasForThis);
        /// Remove all remaining symbols and other things we don't want visible.
        return newScope.withoutSymbols().withoutIgnored();
    }

    /// Is this scope non-empty, i.e. there is no 'this'
    isEmpty() {
        return this.properties.length == 0;
    }

    /// Is this scope non-empty, i.e. there is a valid 'this'
    isNotEmpty() {
        return !this.isEmpty();
    }

    /// Return a scope based on this one without properties whose names are
    /// symbols.
    ///
    /// @return {Dart._ThisScope}
    withoutSymbols() {
        return new this.constructor(this, null, this.propertiesWithoutSymbols(), this.aliasForThis);
    }

    /// Is the property named [property] one that we should ignore.
    ///
    /// @param {string} property
    /// @return {bool}
    isIgnoredProperty(property) {
        return property.name.startsWith('_is_') || Dart._namesToIgnore.has(property.name);
    }

    /// Return a scope based on this one but without names that we don't want to
    /// show up.
    ///
    /// These are typically either from JS, or additional methods that DDC adds,
    /// e.g. the _is_ tests for classes.
    ///
    /// @return {Dart._ThisScope}
    withoutIgnored() {
        // TODO(alanknight): Make this more rigorous, especially the
        // _is_<className> check.
        // TODO(alanknight): Will this handle private superclass fields. Do we
        // see those symbols?  They might be in a separate package, but we may
        // want to include them and assume that dloadRepl will handle them.
        return new this.constructor(
            this,
            null,
            this.properties.filter(p => !this.isIgnoredProperty(p)),
            this.aliasForThis);
    }

    /// Convert back to the form that devtools expects internally,
    /// anonymous Objects with name and properties.
    toDevtoolsForm() {
        return { name: this.name, properties: this.properties, prefix: 'this' };
    }
}

/// The scope of a Dart library.
///
/// For compilation, we want only the private fields of the currently active
/// library.  Anything else we will get by importing and the compiler will know
/// how to find it.  For completion, we want to expand out the visible
/// libraries.
Dart._LibraryScope = class _LibraryScope extends Dart._Scope {
    /// @param {!Dart.Scope || Object} scope. Either one of our scopes or one of
    ///    the anonymous objects that are returned from the devtools scopeChain
    ///    calls.
    /// @param {string} name. Comes from the Devtools scopes. We don't use it,
    ///    but it's useful for debugging.
    /// @param {!List<SDK.RemoteObjectProperty || Object>} properties. The
    ///     properties in this particular scope
    /// @param {string} libraryName. The name of the currently active
    ///    library. This is the key we can use to look up the library in the DDC
    ///    module.
    constructor(scope, name, properties, libraryName) {
        super(scope, name, properties);
        this.activeLibraryName = libraryName;
    }

    /// Does this property look like it contains another library.
    ///
    /// @param {string} property
    /// @return {bool}
    _isLibrary(property) {
        if (!property.value) return false;
        if (property.name == this.activeLibraryName) return false;
        return (property.value.description == 'Object'
            || property.value.description == 'Proxy');
    }

    /// The property representing the active library.
    ///
    /// @return {<SDK.RemoteObjectProperty || Object>}
    activeLibrary() {
        return this.propertyNamed(this.activeLibraryName);
    }

    /// Expand this into a list of the visible library scopes.
    ///
    /// If [forCompletion] is true, list all the members. If it is false, (for
    /// compilation) only list private members, as the public ones will be made
    /// visible by importing.
    ///
    /// @param {bool} forCompletion.
    /// @return {List<SDK.RemoteObjectProperty || Object}>}
    async expanded(forCompletion) {
        const lib = this.activeLibrary();
        const allLibraries = [];
        if (lib) {
            var expanded = await this._expandThisLibrary(forCompletion);
            allLibraries.push(expanded);
        }
        return [...allLibraries, ...await this._expandOthers(forCompletion)];
    }

    async _expandThisLibrary(forCompletion) {
        var library = this.activeLibrary();
        if (!library) return null;
        const expanded = await this.expand(library);
        // TODO(alanknight): Restore the import, deleted as a workaround for
        // failing to import the current containing library.
        return new this.constructor(
            null,
            this.name,
            expanded,
            this.activeLibraryName);
    }

    async _expandOthers(forCompletion) {
        if (!forCompletion) return [];
        const otherLibraries = this.properties.filter(
            prop => this._isLibrary(prop));
        const newScopes = [];
        for (const library of otherLibraries) {
            const properties = await this.expand(library);
            const libraryVariables = new this.constructor(
                null,
                'library',
                properties,
                library.name);
            newScopes.push(libraryVariables);
        }
        return newScopes;
    }

    /// Convert back to the form that devtools expects internally, anonymous
    /// Objects with name and properties.
    ///
    /// @return {Object} An Environment (see Dart.environments)
    toDevtoolsForm() {
        return {
            name: this.name,
            properties:
                this.properties,
            prefix: this.activeLibraryName
        };
    }
}

/// JS names that we don't want to show up in autocomplete or to pass to
/// evaluation.
Dart._namesToIgnore = new Set(['constructor', 'noSuchMethod', 'runtimeType',
    'toString', '_equals', '__defineGetter__', '__defineSetter__',
    '__lookupGetter__', '__lookupSetter__', '__proto__', 'classGetter',
    'hasOwnProperty', 'hashCode', 'isPrototypeOf', 'propertyIsEnumerable',
    'toLocaleString', 'valueOf', '_identityHashCode']);
