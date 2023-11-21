const SessionCacheManager = require('./lib/global_session')
const SessionPressureRelief = require('./lib/session_pressure_relief')
const LRUManager = require('./lib/lru_manager')
const {SessionPathIntercept,ServeMessageRelay} = require('./lib/session_midway_relay')
//
module.exports.SessionCacheManager = SessionCacheManager     // exported for clients
module.exports.SessionPressureRelief = SessionPressureRelief
module.exports.ServeMessageRelay = ServeMessageRelay        // the ServeMessageRelay from message-relay-services

module.exports.LRUManager = LRUManager
module.exports.SessionPathIntercept = SessionPathIntercept
