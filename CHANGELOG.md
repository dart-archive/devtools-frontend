* Dart DevTools Changes

## 0.0.3
 * Make the console name change to Dart Console/JavaScript Console depending
   what context we think we're in.
 * Go back to the light theme as a default.
 * In situations where JS has optimized away 'this', explicitly fetch it and
   make it and its fields available in evaluations. Most obviously this happens
   in closures inside a method when they don't access 'this'.
 * Update the Devtools protocol files to the correct version for the commit we're
   based on.
 * Only pass actual fields to the expression function, not getters. Getters can
   cause code to run, which can cause exceptions in the evaluation.
 * When we hit Enter, autocompletion tries to check if what we have is a valid
   JavaScript expression. That can fail, or time out for Dart expressions, so
   disable it.

## 0.0.2
 * When blackboxing the SDK it doesn't stop on Dart exceptions, since they're in
   blackboxed source. Set the blackbox by source range to get around this. This
   isn't visible in the UI, so it's hard-coded.
 * Adding dart links to runtime types for objects.
 * Fixed a bug resulting in links not being generated whenever they point to the
   first source map entry of a file.
 * Updated the source map entry selection algorithm to sometimes favor entries
   sequentially farther in the source map.
 * Make expression evaluation work by sending the expression to the server for
   compilation. This is a major change, and still has a number of limitations.
 * Change the default back to the light theme.

## 0.0.1
 * Enable simple Dart expressions in the console and watch panes. So far this
   only supports expressions of the form "object.thing.otherThing" and some
   variables are not visible (e.g. top-level library variables) We expect to
   extend this.
 * Turn custom formatters on by default
 * Turn on black boxing of the SDK by default
 * Includes a pending Chrome fix for one of the known breakpoint issues.
 * Adds a warning when a breakpoint isn't set as expected with instructions for
   filing a bug.
 * Make the theme dark by default, so it's more clearly distinguished from
   normal devtools.
 * Fix some breakpoint setting issues on variable declarations with
   initialization.
 * Suppress confusing additional (disabled) breakpoints that appear on lines
   that have complex source mappings.
 * Download and check-in the files that are normally read from the
   chrome-devtools-frontend site, in the interests of having this entirely
   statically serveable. Those files will need to be updated for Chrome changes.
