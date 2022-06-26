const {MessageRelayer} = require('message-relay-services')
const {make_process_identifier,remove_special_files} = require('../lib/utils')
const LRU = require('shm-lru-cache')
const {fix_path,conf_loader} = require('../lib/utils')



let conf_path = process.argv[2]
let default_path = './test/ml_endpoint_1.conf'

let test_conf = conf_loader(conf_path,default_path)
let test_list = []


if ( test_conf === false ) {
  console.log("NO configuration")
  process.exit(1)
}


process.on('SIGINT',() => {
  remove_special_files()
  process.exit(0)
})

// A client of a global session endpoint

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
const DFLT_SLOW_MESSAGE_QUERY_INTERVAL = 5000
const DFLT_FAST_MESSAGE_QUERY_INTERVAL = 1000
// ---- ---- ---- ---- ---- ---- ---- ---- ----
const SESSION_GENERATION_PUB = "session"
const WANT_SESSION_FOR_ID = "need_session"
const APPRISE_SESSION_IN_RESPONSE = "session_known"
const SESSION_ALREADY_RECEIVED = "session_received"
const SESSION_OVERFLOW = "session_backup"


class FAUX_FOR_TEST_LRUManager {
    //
    constructor(conf) {
        //
        if ( conf.module_path !== undefined ) {
          conf.module_path = conf.module_path.replace('/lib','')
          conf.module_path  = fix_path(conf.module_path)
          conf.cache.module_path = conf.module_path  
        }
        if ( conf.token_path !== undefined && conf.cache.token_path === undefined ) {
          conf.cache.token_path = conf.token_path
        }
        //
        conf.cache._test_use_no_memory = true  /// LINE ADDED FOR TEST
        //
        this.cache = new LRU(conf.cache)
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

/*
{
  "lastAccess": 1343846924959,
  "cookie": {
    "originalMaxAge": 172800000,
    "expires": "2012-08-03T18:48:45.144Z",
    "httpOnly": true,
    "path": "/"
  },
  "user": { 
    "name":"waylon",
    "status":"pro"
  }
}
*/


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

const SUGGESTED_TIMEOUT = 1000*60*120     /// about 2 hours

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

class SessionCacheManager {
  //
  constructor(lru_conf,message_relays) {
    //
    this.conf = message_relays
    this.process_identifier = make_process_identifier()
//
    //
    this._LRUManager = new FAUX_FOR_TEST_LRUManager(lru_conf);
    this.message_fowarding = (message_relays !== undefined) ? new MessageRelayer(message_relays) : false
    this._all_senders = []
    //
    this.section_manager = lru_conf.manage_section 
    if ( (lru_conf.manage_section !== false) && (this.message_fowarding !== false) ) {
      let self = this
      this.message_fowarding.on('client-ready',(address,port) => {
        self.setup_auth_path_subscription()
      })
    }
    //
    this._want_keyed = {}
    this._want_key_handlers = {}
  }


  // ---- ---- ---- ---- ---- ---- ---- ----
  mark_session_sent(proc_id,key) {
  }


  session_sent(proc_id,key) {
    return false
  }


  application_set_key_notify(key,handler) {
    this._want_key_handlers[key] = handler
  }

  application_notify_value(key){
    let handler = this._want_key_handlers[key]
    if ( typeof handler === "function" ) {
      handler(key)
    }
  }


  want_key_trace(key) {
    this._want_keyed[key] = Date.now()
  }

  still_want_session(key,token) {
    let now = Date.now()
    let requested_when = this._want_keyed[key]
    if ( requested_when === undefined ) false
    if ( (now - requested_when) < SUGGESTED_TIMEOUT ) {
      this.application_notify_value(key)
      return true
    }
    delete this._want_keyed[key]
    return false
  }


  // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

  async get(key) {    // token must have been returned by set () -> augmented_hash_token
    let lru_m = this._LRUManager
    let value = lru_m.get(key)      // test no async
    return [key,value]
  }

  set(key,value) {
    let augmented_hash_token = this._LRUManager.set(key,value)  // in local hash 
    //
    // TEST LINE
    test_list.push([augmented_hash_token, key,value])
  }

  check_hash(hh_unid,value) {
    return this._LRUManager.check_hash(hh_unid,value)
  }

  async setup_auth_path_subscription() {

    if ( this.message_fowarding === false ) return


    console.log("setup_auth_path_subscription :: ")
    let message = {}
    let lru_m = this._LRUManager
    let self = this

  
    // subscribe to sessions that are coming from overflow, especially high traffic eviction
    //
    // All clients may publish a generation of ID, although usually just one machine will actively do so. 
    // Still all will respond. 
    let handler = (msg) => {  // If receiving news, just set it locally using the generated hash
      let value = msg.value
      let token = msg.hash
      lru_m.set_with_token(token,value)   // put the thing in here
    }
    let resp = await this.message_fowarding.subscribe(SESSION_OVERFLOW,this.conf.auth_path,message,handler)
    console.dir(resp)
    //
    // 
    message = {}
    handler = (msg) => {
      let key = msg.key
      if ( this.session_sent(proc_id,key) ) return
      let value = self._LRUManager.get(key)   // Get this session from local cache if it is there
      if ( value !== false ) {
        msg.value = value // this is capable of responding so send it 
        let proc_id = msg.requester
        let targeted_topic = `${APPRISE_SESSION_IN_RESPONSE}-${proc_id}`
        self.message_fowarding.publish(targeted_topic,this.conf.auth_path,message)
      }
    }
    resp = await this.message_fowarding.subscribe(WANT_SESSION_FOR_ID,this.conf.auth_path,message,handler)
    console.dir(resp)
    //
  }

  

}



function gen_next_kv_pair() {

}



async function run_test() {


    console.log("STARTING TEST")

    let cache_manager = new SessionCacheManager(test_conf.lru,test_conf.message_relay)

    /*
    // ---- 
    let n = parseInt(test_conf.max_messages)
    for ( let i = 0; i < n; n++ ) {
        let [key,value] = gen_next_kv_pair()
        cache_manager.set(key,value)
    }
    
    for ( let i = 0; i < n; n++ ) {
        let [key,value] = gen_next_kv_pair()
        cache_manager.set(key,value)
    }
    
    for ( let i = 0; i < test_conf.test_query_count; i++ ) {
        let [hash,key,value] = test_list.shift()
        let [restored_hash,restored_value] = await cache_manager.get(key)
        // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
        check(hash,restored_hash)
        check(value,restored_value)
    }
    */
}



run_test()