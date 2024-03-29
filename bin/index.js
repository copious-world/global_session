#!/usr/bin/env node
//
const {conf_loader} = require("../lib/utils")


let cpath = process.argv[2]
if ( cpath === "--inspect-brk" ) {
    cpath = process.argv[3]
}

//
let conf = conf_loader(cpath,'session-service.conf')
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


if ( conf.full_edge || ((conf.half_edge === undefined) && (conf.edge_supported_relay === undefined)) ) {

    const SessionPreasureRelief = require('../lib/session_pressure_relief')

    class SessionClusterServer extends SessionPreasureRelief {

        constructor(conf) {
            super(conf.lru,conf.message_relay)
        }
    
        report_status() {
            console.log(`Session Server: PORT: ${conf.port} ADDRESS: ${conf.address}`)
            console.log("READY")
        }
    
    }

    let cl_server = new SessionClusterServer(conf)
    cl_server.report_status()

} else if ( conf.half_edge ) {

    let SiblingServerClass = require('../lib/session_mid_sibling')   
    
    class SessionClusterServer extends SiblingServerClass {
    
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

    // FanoutClass --> The kind of relay client, multi-path-relay, multi-client-relay or just a single client
    let FanoutClass = false
    if ( typeof conf.custom_fanout_relayer === "string" ) {
        FanoutClass = require(conf.custom_fanout_relayer)
    }

    // ServeMessageRelay is from 'message-relay-services'
    //
    const {inject_path_handler,ServeMessageRelay} = require('../lib/session_midway_relay')
    // configure with conf.auth_path ... 
    inject_path_handler(conf)  // inject SessionPathIntercept into the list of classes. Configure the path name only...
    //
    class SessionClusterServer extends ServeMessageRelay {

        constructor(conf,FanoutClass) {
            super(conf,FanoutClass)
        }
    
        report_status() {
            console.log(`Session Server: PORT: ${conf.port} ADDRESS: ${conf.address}`)
            console.log("READY")
        }
    
    }
    
    let cl_server = new SessionClusterServer(conf,FanoutClass)
    cl_server.report_status()

}
