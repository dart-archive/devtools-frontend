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

// TODO(vsm): Wait properly for Chrome to start.  For now, waiting 3s.
setTimeout(() => {
  var app = cdp.New({url: process.argv[2]});
  app.then((o) => {
    var devPage = o.devtoolsFrontendUrl.split('?')[1];
    var dev = cdp.New({url: "chrome-devtools://devtools/custom/inspector.html?" + devPage + "&experiments=true"});
  });
}, 3000);
