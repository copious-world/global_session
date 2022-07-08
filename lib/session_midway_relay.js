const {ServeMessageRelay,IPCClient,PeerPublishingHandler,path_hanlder_classes} = require('message-relay-services')
const LRUManager = require('./lru_manager')


const SESSION_GENERATION_PUB = "session"
const WANT_SESSION_FOR_ID = "need_session"
const APPRISE_SESSION_IN_RESPONSE = "session_known"
const SESSION_ALREADY_RECEIVED = "session_received"
const SESSION_OVERFLOW = "session_backup"

const DEFAULT_AUTH_PATH = "auths"

const NON_PUB_BLOCKING = [SESSION_GENERATION_PUB,APPRISE_SESSION_IN_RESPONSE,SESSION_ALREADY_RECEIVED]


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
        path_conf.evictor = async (target_hash) => {
            let result = await self.send({
                "_tx_op" : "C",
                "_exec_op"  : "evictions-forward",
                "like_this" : target_hash
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
        if ( message.topic === WANT_SESSION_FOR_ID ) {
            // answer back to the client if it the session record is local
            let possible_msg = await this.#has_needed_id(message) 
            if ( possible_msg ) {
                return this.#publish_to_requester(message,possible_msg)
            }
        }
        if ( message.topic === SESSION_GENERATION_PUB ) {
            let value = message.value
            let augmented_hash_token = this._LRUManager.augment_hash(message.hash)  
            let key = message.key
            await this._LRUManager.set_with_token(augmented_hash_token,value,key)       
        }
        // the sibling process might not subscribe and so this will be only to sibling peer clients to this relay
        let response = await super.send_pub(message,json_writer)
        return response
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
    async #has_needed_id(msg_obj) {  // is the stuff in my cache?
        if ( msg_obj ) {
            // double check --- there is a topic that came to this method
            if ( typeof msg_obj.topic === "undefined" ) return false
            //
            if ( NON_PUB_BLOCKING.indexOf(msg_obj.topic) >= 0 ) return false
            //
            let hash = msg_obj.hash
            let augmented_hash_token = this._LRUManager.cache.augment_hash(hash)
            let value = await this._LRUManager.get_with_token(augmented_hash_token)
            if ( value ) {
                let msg = {
                    "value" : value,
                    "hash" : hash
                }
                return msg
            }    
        }
        return false
    }

    // publish a targeted response to the requester....
    #publish_to_requester(msg,info_msg) {
        info_msg._m_path = msg._m_path
        let proc_id = msg.requester
        let targeted_topic = `${APPRISE_SESSION_IN_RESPONSE}-${proc_id}`
        info_msg.topic = targeted_topic
        return info_msg
    }

    // Get a session from cache. The generalized get will perform get operations. 
    // But, if there is a topic indicating that a session is wanted, 
    // return the value right now if it is stored locally. 
    // Otherwise, pass the 'get' request on to the seconday caches...
    // 
    async get(message) {    // token must have been returned by set () -> augmented_hash_token
        if ( message.topic === WANT_SESSION_FOR_ID ) {
            let info_msg = await this.#has_needed_id(message)
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

        console.log("session-midway-relay :: subscribe ",topic,msg)

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



    async send(message) {       // no _tx_op thereby handling 'P', 'S', and others such as 'U'... which write for particular purposes
        return await super.send(message)
    }


}





module.exports.inject_path_handler = (conf) => {
    if ( conf.auth_path !== undefined ) {
        if (conf.lru_path !== undefined ) {
            path_hanlder_classes[conf.auth_path] = require(conf.lru_path)
        } else {
            path_hanlder_classes[conf.auth_path] = SessionPathIntercept
        }
        return
    }
    // else
    path_hanlder_classes[DEFAULT_AUTH_PATH] = SessionPathIntercept
}

module.exports.ServeMessageRelay = ServeMessageRelay
module.exports.SessionPathIntercept = SessionPathIntercept


