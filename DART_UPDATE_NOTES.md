# Dart Update Notes

To update the Google internal version of this code, see go/updateddt

In the interests of making this package simply served from a static web server,
we have downloaded and checked in four files which are normally retrieved from
the https://chrome-devtools-frontend.appspot.com site. These files are
 * front_end/favicon.ico
 * front_end/accessibility/ARIAProperties.js
 * front_end/InspectorBackendCommands.js
 * front_end/SupportedCSSProperties.js

and were retrieved from commit hash 6b6debfc317059bbe69de528507b9b397333a612
e.g. https://chrome-devtools-frontend.appspot.com/serve_file/@520a5c14b858e4b1441dd2d3bab9bc745911a23b/InspectorBackendCommands.js

When rolling forward the code, we should also update these files, particularly the
InspectorBackendCommands.js. For example, find the commit in the main
devtools branch which corresponds to the version we are synced to. The commit
number we want is NOT the github commit number, but in that commit, the corresponding
Chromium commit, e.g.
Cr-Mirrored-Commit: 6b6debfc317059bbe69de528507b9b397333a612

Then from the devtools-frontend directory, run e.g.
curl  https://chrome-devtools-frontend.appspot.com/serve_file/@520a5c14b858e4b1441dd2d3bab9bc745911a23b/InspectorBackendCommands.js > front_end/InspectorBackendCommands.js

Note that ARIAProperties.js must be prefixed with the accessibility directory in
both the URL and the destination.
