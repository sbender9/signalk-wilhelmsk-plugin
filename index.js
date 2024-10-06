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

    app.get('/wilhelmsk/gauges', (req, res) => {
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

      router.post("/get/paths", (req, res) => {
        let paths = req.body.paths
        let response = {}
        paths.forEach(path => {
          let value = app.getSelfPath(path)
          if ( !_.isUndefined(value) ) {
            response[path] = value
          }
        })
        res.json(response)
      })
    })

   
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

  function getSwitchInfo(paths, requirePutSupportMeta)
  {
    let response = {}

    paths.forEach(path => {
      
      let meta = app.getMetadata('vessels.self.'  + path)

      if ( requirePutSupportMeta && (meta === undefined || meta.supportsPut === undefined || meta.supportsPut === false )) {
        return
      }
      
      if ( path.endsWith('.state') || (meta && meta.units && meta.units == 'bool') ) {
        let displayName = meta && meta.displayName ? meta.displayName : undefined
        if ( !displayName ) {
          let parent = path.substring(0, path.length-6)
          meta =  app.getMetadata('vessels.self.'  + parent)
          if ( meta ) {
            displayName = meta.displayName
          }
        }

        if ( displayName === undefined )
        {
          let parts = path.split('.')
          displayName = parts[parts.length-2]
          //displayName = path
        }

        if ( meta && displayName )
        {
          let val = app.getSelfPath(path)
          if ( val && (val.value == 0 || val.value == 1 || val.value == true || val.value == false || val.value === 'on' || val.value === 'off'))
          {
            response[displayName] = {
              path,
              displayName,
              meta
            }
          }
        }
      }
    })
    return response
  }
  
  plugin.signalKApiRoutes = (router) => {
    router.post("/wsk/paths", (req, res) => {
      let paths = req.body
      let response = {}
      paths.forEach(pi => {
        //FIXME: handle source
        let value = app.getSelfPath(pi.path)
        let source = pi.source
        if ( !_.isUndefined(value) ) {
          response[pi.path] = value
        }
      })
      res.json(response)
    })

    router.get("/wsk/switches", (req, res) => {
      let paths = app.streambundle.getAvailablePaths()

      let response = getSwitchInfo(paths, true)

      if ( Object.keys(response).length === 0 ) {
        response = getSwitchInfo(paths, false)
      }

      res.json(response)
    })

    router.get("/wsk/multiSwitches", (req, res) => {
      let response = {}

      let paths = app.streambundle.getAvailablePaths()

      paths.forEach(path => {
        let meta =  app.getMetadata('vessels.self.'  + path)
        if ( meta && meta.displayName && meta.possibleValues )
        {
          response[meta.displayName] = {
            path,
            meta
          }
        }
      })

      res.json(response)
    })

    router.get("/wsk/putPaths", (req, res) => {
      let response = []

      let paths = app.streambundle.getAvailablePaths()
      let putPaths = []

      paths.forEach(path => {
        if ( path.startsWith('notifications.') )
          return
        
        let meta =  app.getMetadata('vessels.self.'  + path)
        if ( meta && meta.supportsPut )
        {
          response.push( {
            path,
            meta
          })
        }
      })

      if ( response.length == 0 ) {
        paths.forEach(path => {
          if ( path.startsWith('notifications.') )
            return
          
          let meta =  app.getMetadata('vessels.self.'  + path)
          
          response.push( {
            path,
            meta
          })
        })
      }
      
      res.json({paths: response})
    })

    router.get("/wsk/allPaths", (req, res) => {
      let paths = app.streambundle.getAvailablePaths()

      let response = paths.filter(path => {
        return !path.startsWith('notifications.') && path !== ""
      })

        
      res.json({ paths: response })
    })

    router.get("/wsk/meta/:path", (req, res) => {
      let path = req.params.path
      let meta =  app.getMetadata('vessels.self.'  + path)
      console.log(meta)
      res.json(meta ? meta : {})
    })

    return router
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
