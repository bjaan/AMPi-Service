  var sendevent = require('sendevent');
  var watch = require('watch');
  var uglify = require('uglify-js');
  var fs = require('fs');
  var ENV = process.env.NODE_ENV || 'development';

  // create && minify static JS code to be included in the page
  var polyfill = fs.readFileSync(__dirname + '/eventsource-polyfill.js', 'utf8');
  var clientScript = fs.readFileSync(__dirname + '/client-script.js', 'utf8');
 // var script1 = uglify.minify(polyfill + clientScript).code;

  function reloadify(app, dir) {
    // create a middlware that handles requests to `/eventstream`
    var events = sendevent('/eventstream');

    app.use(events);

    watch.watchTree(dir, {interval:2}, function (f, curr, prev) {
      events.broadcast({ msg: 'reload' });
    });

    // assign the script to a local var so it's accessible in the view
    //app.locals.watchScript = '<script>' + script1 + '</script>';
	app.locals.watchScript = '<script>' + polyfill + clientScript + '</script>';
  }

  module.exports = reloadify;