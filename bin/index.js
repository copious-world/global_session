#!/usr/bin/env node

const fs = require('fs')


let conf_file = 'session-service.conf'
let conf_par = process.argv[2]
if ( conf_par !== undefined ) {
    conf_file = conf_par
}

let conf = JSON.parse(fs.readFileSync(conf_file).toString())
// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
process.on('SIGINT', async () => {
    try {
        process.exit(0)
    } catch (e) {
        console.log(e)
        process.exit(0)
    }
});


if ( conf.full_edge || conf.half_edge || (conf.edge_supported_relay === undefined) ) {

    const SessionMidpoint = require('../lib/session_midpoint')

    class SessionClusterServer extends SessionMidpoint {

        constructor(conf) {
            super(conf)
        }
    
        report_status() {
            console.log(`Session Server: PORT: ${conf.port} ADDRESS: ${conf.address}`)
            console.log("READY")
        }
    
    }
    
    let cl_server = new SessionClusterServer(conf)
    cl_server.report_status()

} else if ( conf.edge_supported_relay ) {

    const SessionMidplex = require('../lib/session_midplex_relay')
    class SessionClusterServer extends SessionMidplex {

        constructor(conf) {
            super(conf)
        }
    
        report_status() {
            console.log(`Session Server: PORT: ${conf.port} ADDRESS: ${conf.address}`)
            console.log("READY")
        }
    
    }
    
    let cl_server = new SessionClusterServer(conf)
    cl_server.report_status()

}

