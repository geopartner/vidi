var express = require('express');
var request = require('request');
var router = express.Router();
var http = require('http');
var https = require('https');
var moment = require('moment');
var config = require('../../../config/config.js');


/**
*
* @type {string}
*/
var GC2_HOST = config.gc2.host;
GC2_HOST = (GC2_HOST.split("http://").length > 1 ? GC2_HOST.split("http://")[1] : GC2_HOST);

// Set locale for date/time string
moment.locale("da_DK");

var BACKEND = config.backend;

var TABLEPREFIX = 'lerkonvert_'

// Days from 19000101 to 19700101
const DAYSSINCE = 25569
// milisecs pr. day
const MILISECSDAY = 86400000

var userString = function (req) {
    var userstr = ''
    if (req.session.subUser)
        var userstr = req.session.gc2UserName + '@' + req.session.parentDb;
    else {
        var userstr = req.session.gc2UserName;
    }
    return userstr
}

var lc = function (obj) {
    var key, keys = Object.keys(obj);
    var n = keys.length;
    var newobj={}
    while (n--) {
      key = keys[n];
      newobj[key.toLowerCase()] = obj[key];
    }
    return newobj
}

/**
 * Endpoint for getting distinct foresp. in current schema 
 */
router.post('/api/extension/getForespoergsel', function (req, response) {
    response.setHeader('Content-Type', 'application/json');

    console.table(req.body)
    let b = req.body
    console.table(req.session)
    let s = req.session

    // If user is not currently inside a session, hit 'em with a nice 401
    if (!req.session.hasOwnProperty("gc2SessionId")) {
        response.status(401).json({error:"Du skal være logget ind for at benytte løsningen."})
        return
    }

    // Check if query exists
    if(!req.body.hasOwnProperty("nummer")) {
        response.status(500).json({error:"Forespørgsel mangler i parametren 'nummer'"})
        return
    }

    // Go ahead with the logic
    let q = 'Select forespnummer from '+ s.gc2screenName+'.graveforespoegsel'
    try {
        SQLAPI(req.body.q, req)
        .then(r => {
            console.log(r)
            response.status(200).json(r)
        })
        .catch(r => {
            response.status(500).json(r)
        })
    } catch (error) {
        console.log(error)
        response.status(500).json(error)
    }
    
});

/**
 * Endpoint for upserting features from LER 
 */
router.post('/api/extension/upsertForespoergsel', function (req, response) {
    response.setHeader('Content-Type', 'application/json');

    //console.table(req.body)
    let b = req.body
    //console.table(req.session)
    let s = req.session

    // If user is not currently inside a session, hit 'em with a nice 401
    if (!req.session.hasOwnProperty("gc2SessionId")) {
        response.status(401).json({error:"Du skal være logget ind for at benytte løsningen."})
        return
    }

    // Check if query exists
    if(!req.body.hasOwnProperty("foresp") && !req.body.hasOwnProperty("forespNummer") && !req.body.hasOwnProperty("data")) {
        response.status(500).json({error:"Forespørgsel er ikke komplet. 'foresp','forespNummer','data'"})
        return
    }

    // Go ahead with the logic
    // sort in types then delete sync-like
    var lines = [], polys = [], pts = []
    var f, fc, chain;

    b.data.forEach(f => {
        //console.log(f)
        // Pass if unparsed
        if (f.geometry === null) {
            return
        } else if (f.geometry.type == 'MultiLineString') {
            lines.push(f)
        } else if (f.geometry.type == 'MultiPolygon') {
            polys.push(f)
        } else if (f.geometry.type == 'MultiPoint') {
            pts.push(f)
        }
    })

    console.log('Got: '+b.forespNummer+'. Lines: '+lines.length+', Polygons: '+polys.length+', Points: '+pts.length)

    try {
        lines = {type:'FeatureCollection',features: lines}
        pts = {type:'FeatureCollection',features: pts}
        polys = {type:'FeatureCollection',features: polys}
        fors = {type:'FeatureCollection',features: [b.foresp]}

        chain = [
            SQLAPI('delete from '+s.screenName+'.' + TABLEPREFIX + 'graveforespoergsel WHERE forespnummer = '+b.forespNummer, req),
            SQLAPI('delete from '+s.screenName+'.' + TABLEPREFIX + 'lines WHERE forespnummer = '+b.forespNummer, req),
            SQLAPI('delete from '+s.screenName+'.' + TABLEPREFIX + 'points WHERE forespnummer = '+b.forespNummer, req),
            SQLAPI('delete from '+s.screenName+'.' + TABLEPREFIX + 'polygons WHERE forespnummer = '+b.forespNummer, req)
        ]

        // Add forespoergsel
        chain.push(FeatureAPI(req, fors, TABLEPREFIX + 'graveforespoergsel', '25832'))

        // Add layers that exist
        if (lines.features.length > 0) {
            chain.push(FeatureAPI(req, lines, TABLEPREFIX + 'lines', '7416'))
        }
        if (pts.features.length > 0) {
            chain.push(FeatureAPI(req, pts, TABLEPREFIX + 'points', '7416'))
        }
        if (polys.features.length > 0) {
            chain.push(FeatureAPI(req, polys, TABLEPREFIX + 'polygons', '7416'))
        }
        
        Promise.all(chain)
        .then(r => {
            //console.log(r)
            response.status(200).json(r)
        })
        .catch(r => {
            // clean house anyhow
            chain = [
                SQLAPI('delete from '+s.screenName+'.' + TABLEPREFIX + 'graveforespoergsel WHERE forespnummer = '+b.forespNummer, req),
                SQLAPI('delete from '+s.screenName+'.' + TABLEPREFIX + 'lines WHERE forespnummer = '+b.forespNummer, req),
                SQLAPI('delete from '+s.screenName+'.' + TABLEPREFIX + 'points WHERE forespnummer = '+b.forespNummer, req),
                SQLAPI('delete from '+s.screenName+'.' + TABLEPREFIX + 'polygons WHERE forespnummer = '+b.forespNummer, req),
            ]
            Promise.all(chain)
            .finally(
                response.status(500).json(r)
            )
        })
    } catch (error) {
        console.log(error)
        response.status(500).json(error)
    } 
});

/**
 * Endpoint for upserting features from LER 
 */
router.post('/api/extension/upsertStatus', function (req, response) {
    response.setHeader('Content-Type', 'application/json');

    console.table(req.body)
    let b = req.body
    //console.table(req.session)
    let s = req.session


    // If user is not currently inside a session, hit 'em with a nice 401
    if (!req.session.hasOwnProperty("gc2SessionId")) {
        response.status(401).json({error:"Du skal være logget ind for at benytte løsningen."})
        return
    }

    // Check if query exists
    if(!req.body.hasOwnProperty("Ledningsejerliste")) {
        response.status(500).json({error:"Forespørgsel er ikke komplet. 'Ledningsejerliste'"})
        return
    }

    // Build featurecollection
    
    console.log(b.Ledningsejerliste.Ledningsejer)
    var ledningsejer = b.Ledningsejerliste.Ledningsejer
    var fc = {}
    var f = []

    ledningsejer.forEach(l =>{
        console.log(l)
    })


});



// Use FeatureAPI
function FeatureAPI(req, featurecollection, table, crs) {
    var userstr = userString(req)
    var postData = JSON.stringify(featurecollection)
    //console.log(postData)
    var options = {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(postData),
                'GC2-API-KEY': req.session.gc2ApiKey
            },
            uri: GC2_HOST +'/api/v2/feature/' + userstr + '/' +  req.session.screenName + '.' + table + '.the_geom' + '/' + crs,
            body: postData,
            method: 'POST'


        };
    return new Promise(function(resolve, reject) {
        request(options, function(err, resp, body) {
            if (err) {
                p = JSON.parse(body)
                console.log(p.message)
                reject(JSON.parse(body));
            } else {
                p = JSON.parse(body)
                if (p.message.hasOwnProperty('ServiceException')){
                    console.log(p.message.ServiceException.substring(0,200))
                } else {
                    //console.log(p.message)
                }
                resolve(JSON.parse(body));
            }
        })

    });
}

// Use SQLAPI
function SQLAPI(q, req) {
    var userstr = userString(req)
    var options = {
        url: GC2_HOST + '/api/v1/sql/' + userstr + '?q='+q + '&key='+req.session.gc2ApiKey,
        headers: {
            'GC2-API-KEY': req.session.gc2ApiKey
        }
    };
    console.log(q)
    // Return new promise 
    return new Promise(function(resolve, reject) {
        // Do async job
        request.get(options, function(err, resp, body) {
            if (err) {
                //console.log(err)
                reject(err);
            } else {
                //console.log(resp)
                resolve(JSON.parse(body));
            }
        })
    })
};

module.exports = router;
