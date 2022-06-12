const {ServeMessageRelay,MultiRelayClient,PathHandler,path_hanlder_classes} = require('message-relay-services')
const LRUManager = require('./lru_manager')


const SESSION_GENERATION_PUB = "session"
const WANT_SESSION_FOR_ID = "need_session"
const APPRISE_SESSION_IN_RESPONSE = "session_known"
const SESSION_ALREADY_RECEIVED = "session_received"



class SessionPathIntercept extends PathHandler {

    constructor(path_conf,FanoutRelayerClass) {
        if ( (typeof FanoutRelayerClass === undefind) || (FanoutRelayerClass === false) ) {
            FanoutRelayerClass = MultiRelayClient
        }
        super(path_conf,FanoutRelayerClass)
        this._LRUManager = new LRUManager(conf);
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    async send(message) {       // no _tx_op thereby handling 'P', 'S', and others such as 'U'... which write for particular purposes
        if ( message.topic === SESSION_GENERATION_PUB ) {
            let value = message.value
            let augmented_hash_token = message.hash
            this._LRUManager.set_with_token(augmented_hash_token,value)       
        }
        let response = await super.send(message)
        return response
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    #has_needed_id(msg_obj) {  // is the stuff in my cache?
        if ( msg_obj ) {
            // double check --- there is a topic that came to this method
            if ( typeof msg_obj.topic === "undefined" ) return false
            //
            if ( NON_PUB_BLOCKING.indexOf(msg_obj.topic) >= 0 ) return false
            //
            let key = msg_obj.key
            let value = this._LRUManager.get(key)
            if ( value ) {
                let augmented_hash_token = this._LRUManager.cache.hash(key)
                let msg = {
                    "value" : value,
                    "key" : key,
                    "hash" : augmented_hash_token
                }
                return msg
            }    
        }
        return false
    }

    async get(message) {    // token must have been returned by set () -> augmented_hash_token
        if ( message.topic === WANT_SESSION_FOR_ID ) {
            let info_msg = this.#has_needed_id(message)
            if ( info_msg ) {
                return info_msg
            }
        }
        let response = await super.get(message)
        return response
    }
    
    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    async subscribe(topic,msg,handler) { // the hanlder is for a particular topic and handler (listener)
        let h_wrap = (msg_obj) => {
            // put the stuff into my caches
            if ( topic === SESSION_GENERATION_PUB ) {  // insert into the endpoint server cache for later shortcutting return...
                let value = msg_obj.value
                let augmented_hash_token = msg_obj.hash
                this._LRUManager.set_with_token(augmented_hash_token,value)
            }
            handler(msg_obj)
        }
        await super.subscribe(topic,msg,h_wrap)
    }

}





module.exports.inject_path_handler = (conf) => {
    path_hanlder_classes[conf.auth_path] = SessionPathIntercept
}

module.exports.ServeMessageRelay = ServeMessageRelay


