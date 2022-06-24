const {ServeMessageRelay,IPCClient,PeerPublishingHandler,path_hanlder_classes} = require('message-relay-services')
const LRUManager = require('./lru_manager')


const SESSION_GENERATION_PUB = "session"
const WANT_SESSION_FOR_ID = "need_session"
const APPRISE_SESSION_IN_RESPONSE = "session_known"
const SESSION_ALREADY_RECEIVED = "session_received"



console.log("PeerPublishingHandler",PeerPublishingHandler)
console.log("IPCClient",IPCClient)


class SessionPathIntercept extends PeerPublishingHandler {

    constructor(path,path_conf,FanoutRelayerClass) {
        let init_lru_first = new LRUManager(path_conf);
        //
        if ( (typeof FanoutRelayerClass === 'undefined') || (FanoutRelayerClass === false) ) {
            FanoutRelayerClass = IPCClient      // This will need a conf with proc_name
        }
        super(path,path_conf,FanoutRelayerClass)
        //
        let self = this
        path_conf.evictor = async () => {
            let result = await self.send({
                "_tx_op" : "C",
                "_exec_op"  : "evictions-forward"
            })
            return result
        }
        init_lru_first.initialize(path_conf)
        this._LRUManager = init_lru_first
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    // The generalized send operates as usual, unless it it publishing a news session.
    // Oportunistially store the session locally as it goes through. Always send it on.
    // This is one of two places that capture the session. The other is in the subscription handler.
    //
    async send_pub(message,json_writer) {       // no _tx_op thereby handling 'P', 'S', and others such as 'U'... which write for particular purposes
        if ( message.topic === SESSION_GENERATION_PUB ) {
            let value = message.value
            let augmented_hash_token = message.hash
            await this._LRUManager.set_with_token(augmented_hash_token,value)       
        }
        // the sibling process might not subscribe and so this will be only to sibling peer clients to this relay
        let response = await super.send_pub(message,json_writer)
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

    // Get a session from cache. The generalized get will perform get operations. 
    // But, if there is a topic indicating that a session is wanted, 
    // return the value right now if it is stored locally. 
    // Otherwise, pass the 'get' request on to the seconday caches...
    // 
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
    // Subscribe to publications about new sessions.
    // If a new session passing through, grabs the session object and store it in local cache
    // This is one of two places that capture the session. The action here is in the subscription handler.
    // The other place is in "send" which is publishing from an place of generation.
    async subscribe(topic,msg,handler,json_writer)  { // the hanlder is for a particular topic and handler (listener)
        let insert_group_action = async (msg_obj) => {
            // put the stuff into my caches
            if ( topic === SESSION_GENERATION_PUB ) {  // insert into the endpoint server cache for later shortcutting return...
                let value = msg_obj.value
                let augmented_hash_token = msg_obj.hash
                await this._LRUManager.set_with_token(augmented_hash_token,value)
            }
        }
        await super.subscribe(topic,msg,handler,json_writer,insert_group_action)
    }

}





module.exports.inject_path_handler = (conf) => {
    path_hanlder_classes[conf.auth_path] = SessionPathIntercept
}

module.exports.ServeMessageRelay = ServeMessageRelay


