
const {ServerWithIPC} = require('message-relay-services')
const LRUManager = require('./lru_manager')


const SESSION_GENERATION_PUB = "session"
const WANT_SESSION_FOR_ID = "need_session"
const APPRISE_SESSION_IN_RESPONSE = "session_known"
const SESSION_ALREADY_RECEIVED = "session_received"
const SESSION_OVERFLOW = "session_backup"


const NON_PUB_BLOCKING = [SESSION_GENERATION_PUB,APPRISE_SESSION_IN_RESPONSE,SESSION_ALREADY_RECEIVED]


class SessionMidpoint extends ServerWithIPC {

    constructor (conf) {
        conf.app_handles_subscriptions = true
        super(conf)
        conf.cache.am_initializer = false
        this._LRUManager = new LRUManager(conf);
    }

    async load_data(msg_obj) {
        let key = msg_obj.key
        return this._LRUManager.get(key)
    }

    async create_entry_type(msg_obj) {
        let value = msg_obj.value
        let token = msg_obj.hash
        this._LRUManager.set_with_token(token,value)
        return true
    }

    async update_entry_type(msg_obj) {
        let token = msg_obj.hash
        this._LRUManager.get_with_token(token)
        return true
    }

    async delete_entry_type(msg_obj) {
        let key = msg_obj.key
        this.delete(key)
        return true
    }

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



    // app_publication_pre_fan_response --> 
    //      -- in the session midpoint, only support id requests to subscribed and connected 
    //      -- clients (those should be obtaining session requests absent from their LRUs on their processors.)
    app_publication_pre_fan_response(topic,msg_obj,respond_to) { // respond_to is a writer
        //
        if ( WANT_SESSION_FOR_ID !== topic ) return false
        //
        let info_msg = this.#has_needed_id(msg_obj)
        if ( info_msg ) {
            info_msg._m_path = this.conf.auth_path
            let proc_id = msg.requester
            let targeted_topic = `${APPRISE_SESSION_IN_RESPONSE}-${proc_id}`
            info_msg.topic = targeted_topic
            let str_msg = JSON.stringify(info_msg)
            respond_to.write(str_msg)     // sock made by this server managed by relayer ... pass on message
            return true
        }
        //
        return false
    }


    // app_subscription_handler
    // ---  a post action after publication ...
    //      this will put the augmented_hash_token into the LRU belonging to the midpoint
    async app_subscription_handler(topic,msg_obj) {
        // put the stuff into my caches
        if ( topic === SESSION_GENERATION_PUB ) {  // insert into the endpoint server cache for later shortcutting return...
            let value = msg_obj.value
            let augmented_hash_token = msg_obj.hash
            // HOW TO GET VALUE...
            //let value = this._LRUManager.get_with_token(augmented_hash_token,value)

        }
    }


    #op_commands(action) {
        let action_list = action.split('-')
        let primary_action = action_list[0]
        switch ( primary_action ) {
            case "evictions" : {
                let secondary_act = action_list[1]
                let evicted = this._LRUManager.run_evictions()
                if ( typeof evicted === "object" ) {
                    if ( secondary_act && (secondary_act === "forward") ) {
                        let self = this
                        setImmediate(() => {
                            for ( let hash in evicted  ) {
                                let value = evicted[hash]
                                let msg_obj = {
                                    "hash" : hash,
                                    "value" : value
                                }
                                self.send_to_all(SESSION_OVERFLOW,msg_obj,ignore)
                            }
                        })
                    }
                }
                return true
            }
            case "test" : {
                console.log("session-mid-sibling: " + action)
                return true
            }
            default : {
                break;
            }
        }
        return false
    }

    //
    async app_message_handler(msg_obj) {
        let op = msg_obj._tx_op
        let result = "OK"
        let user_id = msg_obj._user_dir_key ? msg_obj[msg_obj._user_dir_key] : msg_obj._id
        if ( this.create_OK && !!(user_id) ) {
            await this.ensure_user_directories(user_id)
        }
        msg_obj._id = user_id
        //
        switch ( op ) {
            case 'G' : {        // get user information
                let stat = "OK"
                let data = await this.load_data(msg_obj)
                if ( data === false ) stat = "ERR"
                return({ "status" : stat, "data" : data,  "explain" : "get", "when" : Date.now() })
            }
            case 'D' : {        // delete sesssion from everywhere if all ref counts gones.
                result = await this.delete_entry_type(msg_obj)
                break
            }
            case 'S' : {  // set or send
                let action = msg_obj._user_op
                if ( action === "create" ) {
                    result = await this.create_entry_type(msg_obj)
                    result = result ? "OK" : "ERR"
                } else if ( action === "update" ) {
                    result = await this.update_entry_type(msg_obj)
                    result = result ? "OK" : "ERR"
                }
                break
            }
            case 'C' : {  // command
                let action = msg_obj._exec_op
                result = this.#op_commands(action)
                result = result ? "OK" : "ERR"
                break
            }
            default : {
                break
            }
        }
        //
        return({ "status" : result, "explain" : "op performed", "when" : Date.now() })
    }

}




module.exports = SessionMidpoint