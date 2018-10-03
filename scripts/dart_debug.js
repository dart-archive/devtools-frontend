// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var childProcess = require('child_process');
var path = require('path');
var cdp = require('chrome-remote-interface');

var server = childProcess.fork(path.join(__dirname, 'hosted_mode/server.js'));
var chrome = childProcess.fork(path.join(__dirname, 'chrome_debug_launcher/launch_chrome.js'), ['api.dartlang.org/dev']);

chrome.on('exit', function() {
  server.kill();
});

// Check for environment variables to replace URLS that start with
// prefix to a pattern starting with alternate, and also adding the
// /lib parameter. Useful for debugging production, where the source
// mapped locations may be inaccessible.
var prefix = process.env["DDT_REPLACE_URL_PREFIX"];
var replaceParameter = prefix ? "_ddtreplaceprefix=" + encodeURI(prefix) : "";
var alternate = process.env["DDT_URL_ALTERNATE_PREFIX"];
var alternateParameter = alternate ? "&_ddtalternate=" + encodeURI(alternate) : "";
var extraQueryParameters = replaceParameter + alternateParameter;

// TODO(vsm): Wait properly for Chrome to start.  For now, waiting 3s.
setTimeout(() => {
  var appUrl = process.argv[2];
  // If there are no other query parameters, start with a question
  // mark, otherwise, start with an ampersand.
  var queryPrefix = appUrl.includes('?') ? '&' : '?';
  // If there's a fragment we need to put it after the query parameters.
  var splitFragment = appUrl.split('#')
  var urlPart = splitFragment[0];
  var fragment = splitFragment.length == 1 ? '' : '#' + splitFragment[1];
  var fullUrl = urlPart + queryPrefix + extraQueryParameters + fragment;
  var app = cdp.New({url: fullUrl});
  app.then(async (o) => {
    var devPage = o.devtoolsFrontendUrl.split('?')[1];
    var devUrl = "chrome-devtools://devtools/custom/inspector.html?" + devPage +  "&experiments=true";
    var dev = await cdp.New({url: devUrl});
  });
}, 3000);
