const debug = require('debug')('defaults-updates')
const util = require('util')
const path = require('path')
const fs = require('fs')

const _ = require('lodash')

module.exports = function(app) {
  var plugin = {}
  var defaultsFile

  plugin.id = "defaults-updates"
  plugin.name = "Defaults Updater"
  plugin.description = "Signal K node server plugin to allow clients to update the defaults.json file"

  plugin.schema = {
    title: "Defaults Updater",
    type: "object",
    properties: {
    }
  }

  plugin.start = function(options) {
    var dir = app.config.configPath || app.config.appPath
    defaultsFile = path.join(dir, 'settings/defaults.json');
    debug("defaultsFile: " + defaultsFile)
    return true
  }

  function readDefaults() {
    var defaults = {}
    if ( fs.existsSync(defaultsFile) ) {
      var defaultsString = fs.readFileSync(defaultsFile)
      defaults = JSON.parse(defaultsString);
    }
    return defaults
  }

  plugin.registerWithRouter = function(router) {
    router.get("/get/*", (req, res) => {
      var path = req.path.substring(5).replace(/\//g, '.')
      debug("path: " + path);

      var defaults = readDefaults()
      var value = _.get(defaults, path)

      if ( typeof value !== 'undefined' ) {
        res.json(value)
      } else {
        res.status(404);
        res.send("Not found");
      }
    });

    router.get("/delete/*", (req, res) => {
      var path = req.path.replace('/delete/', '').replace(/\//g, '.')
      debug("path: " + path);

      var defaults = readDefaults()
      var value = _.get(defaults, path)

      if ( typeof value !== 'undefined' ) {
        _.unset(defaults, path, null)
        var json = JSON.stringify(defaults, null, 2)
        //debug("new defaults: " + json)
        
        fs.writeFile(defaultsFile, json,
                     function(err) {
                       if (err) {
                         debug(err.stack)
                         console.log(err)
                         res.status(500)
                         res.send(err)
                         return
                       }
                       else
                       {
                         if ( path.startsWith('vessels.self') ) {
                           sendDelta(path, null);
                       }
                         
                       res.send("Default Removed")
                       }
                     });        
      } else {
        res.status(404);
        res.send("Not found");
      }
    });

    
    router.post("/save/*", (req, res) => {
      var spath = req.path.substring(6).replace(/\//g, '.')
      var value = req.body

      debug("path: " + spath)
      debug("value: " + JSON.stringify(value))
      
      if ( typeof spath === 'undefined'
           || typeof value === 'undefined')
      {
        res.status(400)
        res.send("Invalid Request")
        return
      }

      var defaults = readDefaults()

      _.set(defaults, spath, value)

      var json = JSON.stringify(defaults, null, 2)
      //debug("new defaults: " + json)

      fs.writeFile(defaultsFile, json,
                   function(err) {
                     if (err) {
                       debug(err.stack)
                       console.log(err)
                       res.status(500)
                       res.send(err)
                       return
                     }
                     else
                     {
                       if ( spath.startsWith('vessels.self') ) {
                         sendDelta(spath, value);
                       }
                       
                       res.send("Defaults Saved")
                     }
                   });
      
    })
  }
  

  plugin.stop = function() {
  }

  function sendDelta(spath, value ) {
    var delta_path = spath.replace('vessels.self.', '')
    var delta = {
      "updates": [
        {
          "source": {
            "label": plugin.id
          },
          "timestamp": (new Date()).toISOString(),
          "values": [
            {
              "path": delta_path,
              "value": value
            }]
        }
      ]
    }

    debug("sending delta: " + JSON.stringify(delta))
    app.handleMessage(plugin.id, delta)
  }

  return plugin
}
