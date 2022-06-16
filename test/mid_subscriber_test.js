

const {ServeMessageEndpoint} = require('message-relay-services')
const { XXHash32 } = require('xxhash-addon')


const {conf_loader,fix_path} = require("../lib/utils")

let conf = conf_loader(process.argv[2],'./test/ml_endpoint_1.conf')
console.dir(conf)



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
const DFLT_SLOW_MESSAGE_QUERY_INTERVAL = 5000
const DFLT_FAST_MESSAGE_QUERY_INTERVAL = 1000
// ---- ---- ---- ---- ---- ---- ---- ---- ----
const SESSION_GENERATION_PUB = "session"
const WANT_SESSION_FOR_ID = "need_session"
const APPRISE_SESSION_IN_RESPONSE = "session_known"
const SESSION_ALREADY_RECEIVED = "session_received"


const MAX_EVICTS = 10
const MIN_DELTA = 1000*60*60   // millisecs
const MAX_FAUX_HASH = 100000
const INTER_PROC_DESCRIPTOR_WORDS = 8
const DEFAULT_RESIDENCY_TIMEOUT = MIN_DELTA
//

const SUPER_HEADER = 256
const MAX_LOCK_ATTEMPTS = 3

const WORD_SIZE = 4
const LONG_WORD_SIZE = 8
const HH_HEADER_SIZE = 64

//
const PID_INDEX = 0
const WRITE_FLAG_INDEX = 1
const INFO_INDEX_LRU = 2
const INFO_INDEX_HH = 3
const NUM_INFO_FIELDS = 4

const LRU_HEADER = 64


var g_app_seed = 0
var g_hasher32 = null

var g_buf_enc = new TextEncoder()

function default_hash(data) {
    if ( !(g_hasher32) ) return(0)
    try {
        if ( typeof data === "string" ) {
            let buf = g_buf_enc.encode(data)
            data = buf
        }
        g_hasher32.update(data)
        let h = g_hasher32.digest()
        let hh = h.readUInt32BE(0)
        g_hasher32.reset()
        return hh            
    } catch (e) {
        console.log(e)
    }
    return 0
}


function init_default(seed) {
    g_app_seed = parseInt(seed,16);
    g_hasher32 = new XXHash32(g_app_seed);
    return default_hash
}




class FAUX_LRU {

    constructor(conf) {

        this.conf = conf

        this.hasher = init_default(conf.seed)
        //
        // removed lines for test.
        //
        this.eviction_interval = null

        // 

        this._faux_map = {}
        //
    }
    
    // ---- ---- ---- ---- ---- ---- ---- ---- ----

    hash(value) {
        let hh = this.hasher(value)
        let top = hh % this.count
        let augmented_hash_token = top + '-' + hh
        return( augmented_hash_token )
    }

    async set(hash_augmented,value) {
        if ( typeof value === 'string' ) {
            if ( !(value.length) ) return(-1)
            if ( value.length > this.record_size ) return(-1)    
        } else {
            value = (value).toString(16)
        }
        let pair = hash_augmented.split('-')
        //
        this._faux_map[hash_augmented] = [pair,value]

    }

    async get(hash_augmented) {
        let [pair,value] = this._faux_map[hash_augmented]
        return(value)
    }

    async del(hash_augmented) {
        delete this._faux_map[hash_augmented]
        let result = true
        return(result)
    }

    async delete(hash_augmented) {
        return this.del(hash_augmented)
    }

    // ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    /// handle_evicted(evict_list)
    app_handle_evicted(evict_list) {
        // app may decide to forward these elsewhere are send shutdown messages, etc.
    }


}


class FAUX_FOR_TEST_LRUManager {
    //
    constructor(conf) {
        //
        //conf.module_path = conf.module_path.replace('/lib','')
        //conf.module_path  = fix_path(conf.module_path)
        //conf.cache.module_path = conf.module_path
        //conf.cache._test_use_no_memory = true  /// LINE ADDED FOR TEST
        //
        this.cache = new FAUX_LRU(conf.cache)
        this.in_operation = true
        this.conf = conf
        //
      }
    
      initialize(conf) {
      }
    
      //
      set(key,value) {
        let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
        let augmented_hash_token = this.cache.hash(key)
        this.cache.set(augmented_hash_token, sdata)   // store in the LRU cache
        return(augmented_hash_token)    // return the derived key
      }
    
      set_with_token(token,value) {
        let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
        this.cache.set(token, sdata)   // store in the LRU cache
      }
    
      hash_set(key,value) {
        let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
        let augmented_hash_token = this.cache.hash(key)
        let hh_unidentified = this.cache.hasher(sdata)
        this.cache.set(augmented_hash_token, hh_unidentified)   // store in the LRU cache
        return(hh_unidentified)    // return the derived key
      }
    
      check_hash(hh_unid,value) {
        let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
        let hh_unidentified = this.cache.hasher(sdata)
        return hh_unidentified === hh_unid
      }
      
      //
      delete(key) { // token must have been returned by set () -> augmented_hash_token
        let augmented_hash_token = this.cache.hash(key)
        this.cache.del(augmented_hash_token)
      }
    
      //
      get(key) {    // token must have been returned by set () -> augmented_hash_token
        let augmented_hash_token = this.cache.hash(key)
        let value = false
        if ( typeof value !== 'string' ) {
          return false
        }
        return value
      }
  
      get_with_token(token) {
          let value = this.cache.get(token)
          if ( typeof value !== 'string' ) {
            return false
          }
          return value  
      }
  
      //
      disconnect(opt) {
        this.in_operation = false
        return this.cache.disconnect(opt)
      }
}



const NON_PUB_BLOCKING = [SESSION_GENERATION_PUB,APPRISE_SESSION_IN_RESPONSE,SESSION_ALREADY_RECEIVED]


class SessionMidpoint_TEST extends ServeMessageEndpoint {

    constructor (conf) {
        super(conf)
        this._LRUManager = new FAUX_FOR_TEST_LRUManager(conf);
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
            this._LRUManager.set_with_token(augmented_hash_token,value)
        }
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
            case 'S' : {  // or send
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
            default : {
                break
            }
        }
        //
        return({ "status" : result, "explain" : "op performed", "when" : Date.now(), "ucwid" : msg_obj.ucwid })
    }

}



class SessionClusterServer extends SessionMidpoint_TEST {

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


