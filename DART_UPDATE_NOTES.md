# Dart Update Notes

To update the Google internal version of this code, see go/updateddt

In the interests of making this package simply served from a static web server, we have downloaded and checked in four files which are normally retrieved from the https://chrome-devtools-frontend.appspot.com site. These files are
 * favicon.ico
 * ARIAProperties.js
 * InspectorBackendCommands.js
 * SupportedCSSProperties.js

and were retrieved from commit hash 520a5c14b858e4b1441dd2d3bab9bc745911a23b,
e.g. https://chrome-devtools-frontend.appspot.com/serve_file/@520a5c14b858e4b1441dd2d3bab9bc745911a23b/InspectorBackendCommands.js

If there are sufficiently large changes to these files in Chrome versions, these
files will need to be updated, but at that point we should also consider rolling
forward this code to the corresponding version of DevTools.
