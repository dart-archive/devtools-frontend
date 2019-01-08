* Dart DevTools Changes

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
