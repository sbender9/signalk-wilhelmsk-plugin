const debug = require('debug')('wilhelmsk-plugin')
const util = require('util')
const path = require('path')
const fs = require('fs')

const _ = require('lodash')

module.exports = function(app) {
  var plugin = {}
  var defaultsFile

  plugin.id = "wilhelmsk-plugin"
  plugin.name = "WilhelmSK Plugin"
  plugin.description = "Signal K node server plugin to allow clients to update the defaults.json file"

  plugin.schema = {
    title: "WilhelmSK Plugin",
    type: "object",
    properties: {
    }
  }

  plugin.start = function(options) {
    var dir = app.config.configPath || app.config.appPath
    defaultsFile = path.join(dir, 'plugin-config-data/wilhelmsk-gauges.json');
    debug("gauges file: " + defaultsFile)
    return true
  }

  function readGauges() {
    var defaults = {}
    if ( fs.existsSync(defaultsFile) ) {
      var defaultsString = fs.readFileSync(defaultsFile)
      defaults = JSON.parse(defaultsString);
    }
    return defaults
  }

  function saveGauges(gauges, done) {
    var json = JSON.stringify(gauges, null, 2)
    
    fs.writeFile(defaultsFile, json,
                 function(err) {
                   if (err) {
                     debug(err.stack)
                     console.log(err)
                     done(err)
                     return
                   }
                   else
                   {
                     done()
                   }
                 });        
    
  }

  plugin.registerWithRouter = function(router) {
    router.get("/get/gauges", (req, res) => {
      var gauges = readGauges()
      res.json(gauges)
    });

    router.post("/delete/gauge", (req, res) => {
      var title = req.body.title
      
      debug("title: " + title);

      var gauges = readGauges()
      var gauge = gauges[title]
      if ( typeof gauge !== 'undefined' ) {
        delete gauges[title]
        saveGauges(gauges, function(err) {
          if (err) {
            res.status(500)
            res.send(err)
            return
          } else {
            res.send("Gauge Removed")
          }
        });        
      } else {
        res.status(404);
        res.send("Not found");
      }
    });

   
    router.post("/save/gauge", (req, res) => {
      var gauge = req.body

      debug("gauge: " + JSON.stringify(gauge))

      var title = gauge.title;
      
      if ( typeof gauge === 'undefined' || typeof title == 'undefined')
      {
        res.status(400)
        res.send("Invalid Request")
        return
      }

      var gauges = readGauges()

      gauges[title] = gauge

      saveGauges(gauges, function(err) {
        if (err) {
          res.status(500)
          res.send(err)
          return
        } else {
          res.send("Gauge Saved")
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
