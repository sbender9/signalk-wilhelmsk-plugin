/**
 * Copyright 2018 Scott Bender (scott@scottbender.net)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const path = require('path')
const fs = require('fs')
const _ = require('lodash')

module.exports = function(app) {
  var plugin = {}
  var dataFile
  var data

  plugin.id = "wilhelmsk-plugin"
  plugin.name = "WilhelmSK Plugin"
  plugin.description = "Signal K node server plugin that's provides special functionality for WilhelmSK"

  plugin.schema = {
    title: "WilhelmSK Plugin",
    type: "object",
    properties: {
    }
  }

  plugin.start = function(options) {
    var dir = app.config.configPath || app.config.appPath
    dataFile = path.join(dir, 'plugin-config-data/wilhelmsk-data.json');
    app.debug("data file: " + dataFile)

    data = readData()

    return true
  }

  function readData() {
    var res = { gauges: {} }
    if ( fs.existsSync(dataFile) ) {
      var dataString = fs.readFileSync(dataFile)
      res = JSON.parse(dataString);
    }
    return res
  }

  function saveData(done) {
    var json = JSON.stringify(data, null, 2)
    
    fs.writeFile(dataFile, json,
                 function(err) {
                   if (err) {
                     app.error(err.stack)
                     app.error(err)
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
      res.json(data.gauges)
    });

    router.post("/delete/gauge", (req, res) => {
      var title = req.body.title
      
      app.debug("title: " + title);

      var gauge = data.gauges[title]
      if ( typeof gauge !== 'undefined' ) {
        delete data.gauges[title]
        saveData(function(err) {
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

      app.debug("gauge: " + JSON.stringify(gauge))

      var title = gauge.title;
      
      if ( typeof gauge === 'undefined' || typeof title == 'undefined')
      {
        res.status(400)
        res.send("Invalid Request")
        return
      }

      data.gauges[title] = gauge

      saveData(function(err) {
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

    app.debug("sending delta: " + JSON.stringify(delta))
    app.handleMessage(plugin.id, delta)
  }

  return plugin
}
