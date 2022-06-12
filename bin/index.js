#!/usr/bin/env node
//
const {conf_loader} = require("../lib/utils")

let conf = conf_loader(process.argv[2],'session-service.conf')
console.dir(conf)

if ( conf === false ) {
    console.log("failed to load configuration")
}

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

    let FanoutClass = false
    if ( typeof conf.custom_fanout_relayer === "string" ) {
        FanoutClass = require(conf.custom_fanout_relayer)
    }

    const {inject_path_handler,ServeMessageRelay} = require('../lib/session_midplex_relay')
    inject_path_handler(conf)
    class SessionClusterServer extends ServeMessageRelay {

        constructor(conf) {
            super(conf)
        }
    
        report_status() {
            console.log(`Session Server: PORT: ${conf.port} ADDRESS: ${conf.address}`)
            console.log("READY")
        }
    
    }
    
    let cl_server = new SessionClusterServer(conf,FanoutClass)
    cl_server.report_status()

}

