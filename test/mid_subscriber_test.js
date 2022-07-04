const {MessageRelayer} = require('message-relay-services')
const {make_process_identifier,remove_special_files} = require('../lib/utils')
const LRU = require('shm-lru-cache')
const {fix_path,conf_loader} = require('../lib/utils')



let conf_path = process.argv[2]
let default_path = './test/mid-subscriber.conf'

let test_conf = conf_loader(conf_path,default_path)
let g_test_list = []


if ( test_conf === false ) {
  console.log("NO configuration")
  process.exit(1)
}


process.on('SIGINT',() => {
  remove_special_files()
  process.exit(0)
})

// A client of a global session endpoint


class FAUX_LRU extends LRU {
  constructor(conf) {
    super(conf)

    this.count = 253
    this.proc_index = -1

  }



}


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
const DFLT_SLOW_MESSAGE_QUERY_INTERVAL = 5000
const DFLT_FAST_MESSAGE_QUERY_INTERVAL = 1000
// ---- ---- ---- ---- ---- ---- ---- ---- ----
const SESSION_GENERATION_PUB = "session"
const WANT_SESSION_FOR_ID = "need_session"
const APPRISE_SESSION_IN_RESPONSE = "session_known"
const SESSION_ALREADY_RECEIVED = "session_received"



let g_faux_lru_table = {}


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
        this.cache = new FAUX_LRU(conf.cache)
        this.in_operation = true
        this.conf = conf
        //
      }
    
      initialize(conf) {
      }

      pure_hash(key) {
        return this.cache.pure_hash(key)
      }

      augment_hash(hash) {
        return this.cache.augment_hash(hash)
      }

      //
      set(key,value) {
        let sdata = ( typeof value !== 'string' ) ? JSON.stringify(value) : value
        let augmented_hash_token = this.cache.hash(key)
        this.cache.set(augmented_hash_token, sdata)   // store in the LRU cache
        return(augmented_hash_token)    // return the derived key
      }
    
      set_with_token(token,value) {
console.log(`subscriber: set_with_token ${token} ${value}`)
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
          //let value = this.cache.get(token)

          let vv =  g_faux_lru_table[token]
          let value = vv[1]
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
    //
  }


  // ---- ---- ---- ---- ---- ---- ---- ----
  post_message(msgObject) {
    if ( this.message_fowarding ) {
      if ( msgObject.m_path === undefined ) {
        msgObject.m_path = SESSION_GENERATION_PUB
      }
      this.message_fowarding.sendMessage(msgObject)  
    }
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


  // set in local cache and then publish (a publish -- not a send)
  async set(key,value) {
    let augmented_hash_token = this._LRUManager.set(key,value)  // in local hash 
    //
    console.log("Set(key,value) cache manager:: " + augmented_hash_token)
    // TEST LINE
    g_test_list.push([augmented_hash_token, key,value])

    g_faux_lru_table[augmented_hash_token] = [key,value]
    //
    if ( this.section_manager && this.message_fowarding ) {
      //
      let message = {
        "key" : key,
        "value" : value,
        "hash" : augmented_hash_token
      }
      // Tell all subscribers that a new session has been created  (remote the session information)
/*
      let test_respo = await this.message_fowarding.publish(SESSION_GENERATION_PUB,this.conf.auth_path,message)
      console.log("set publish(SESSION_GENERATION_PUB result:")
      console.dir(test_respo)
*/

      //this.message_fowarding.publish(SESSION_GENERATION_PUB,this.conf.auth_path,message)
    }
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

    let proc_id = this.process_identifier

    // All clients may publish a generation of ID, although usually just one machine will actively do so. 
    // Still all will respond. 
    let handler = (msg) => {  // If receiving news, just set it locally using the generated hash
      let value = msg.value
      let token = msg.hash
      lru_m.set_with_token(token,value)
    }
    let resp = await this.message_fowarding.subscribe(SESSION_GENERATION_PUB,this.conf.auth_path,message,handler)
    console.dir(resp)
    //
    // 

    message = {}
    handler = async (msg) => {
      let hash = msg.hash
      console.dir(msg)
      console.log(hash)
      //
      if ( this.session_sent(proc_id,hash) ) return

console.log("#has_needed_id  hash",hash)
      let augmented_hash_token = this._LRUManager.cache.augment_hash(hash)
console.log(`using aug ht: ${augmented_hash_token}`)
      let value = await this._LRUManager.get_with_token(augmented_hash_token)
console.log("got key",value)
      if ( value !== false ) {
        msg.value = value // this is capable of responding so send it 
        let proc_id = msg.requester
        let targeted_topic = `${APPRISE_SESSION_IN_RESPONSE}-${proc_id}`
console.log(targeted_topic)
        self.message_fowarding.publish(targeted_topic,this.conf.auth_path,msg)
      }

    }
    resp = await this.message_fowarding.subscribe(WANT_SESSION_FOR_ID,this.conf.auth_path,message,handler)
    console.dir(resp)
    //
    //
  }

  


  add_message_handler(m_handler,q_holder,prf_slow,prf_fast) {

    if ( m_handler === undefined ) return;
    let handler = m_handler
    if ( q_holder === undefined ) return;
    let _q = q_holder
    let slow = DFLT_SLOW_MESSAGE_QUERY_INTERVAL
    if ( prf_slow !== undefined ) slow = prf_slow;
    let fast = DFLT_FAST_MESSAGE_QUERY_INTERVAL
    if ( prf_slow !== undefined ) fast = prf_fast;

    let sender_index = this._all_senders.length

    let message_sender = async () => {
        let m_snder = this._all_senders[sender_index]
        if ( m_snder ) {
            if ( _q.empty_queue() ) {
                setTimeout(() => { m_snder() }, slow )
            } else {
                //
                while ( !(_q.empty_queue()) ) {
                  let datum = _q.get_work()
                  let msgObject = handler(datum)
                  await this.post_message(msgObject)   // message to admin
                }
                setTimeout(() => { m_snder() }, fast )
            }    
        }
    }

    this._all_senders.push(message_sender)

    setTimeout(message_sender,slow)

  }

}



function gen_next_kv_pair() {
  let r = 0
  while ( r === 0 ) {
    r = Math.random()
  }
  let k = '' + Math.trunc(r*1000)
  let v = "{some information about someone}"
  return [k,v]
}



async function run_test() {

    console.log("STARTING TEST")

    let cache_manager = new SessionCacheManager(test_conf.lru,test_conf.message_relay)

    let key = '79131'
    let value = "{ we are testing our limits }"
    cache_manager.set(key,value)
}



run_test()