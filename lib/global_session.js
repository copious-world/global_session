const {MessageRelayer} = require('message-relay-services')
const {make_process_identifier} = require('./utils')
const LRUManager = require('./lru_manager')

// A client of a global session endpoint

// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

const DFLT_SLOW_MESSAGE_QUERY_INTERVAL = 5000
const DFLT_FAST_MESSAGE_QUERY_INTERVAL = 1000


const SESSION_GENERATION_PUB = "session"
const WANT_SESSION_FOR_ID = "need_session"
const APPRISE_SESSION_IN_RESPONSE = "session_known"
const SESSION_ALREADY_RECEIVED = "session_received"
const SESSION_OVERFLOW = "session_backup"


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
    this.conf = lru_conf
    this.process_identifier = make_process_identifier()
    //
    this._LRUManager = lru_conf.custom_lru_manager ? new lru_conf.custom_lru_manager(lru_conf) :  new LRUManager(lru_conf);
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

  get_LRUManager() {
    return(this._LRUManager)
  }

  client_going_down() {
    if ( this._LRUManager.in_operation ) {
      this._LRUManager.disconnect()
    }
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


  initialize(conf) {   // maybe override --- require in client
  }


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


  async #remote_query(key,lru_m) {
    this.want_key_trace(key)
    let message = {
      "key" : key,
      "requester" : this.process_identifier
    }
    let resp = await this.message_fowarding.publish(WANT_SESSION_FOR_ID,this.conf.auth_path,message)
    if ( resp ) {
      if ( resp.key === key ) {
        let key = resp.key
        let value = resp.value
        let token = resp.hash       // store in local cash
        if ( this.still_want_session(key,token) ) {
          lru_m.set_with_token(token,value)
        }    
        return value
      }
    }
    return false
  }

  async get(key) {    // token must have been returned by set () -> augmented_hash_token
    let lru_m = this._LRUManager
    let value = await lru_m.get(key)
    if ( !value && this.message_fowarding ) {
      value = await this.#remote_query(key,lru_m)
    }
    return value
  }


  set(key,value) {
    let augmented_hash_token = this._LRUManager.set(key,value)  // in local hash 
    if ( this.section_manager && this.message_fowarding ) {
      //
      let message = {
        "key" : key,
        "value" : value,
        "hash" : augmented_hash_token
      }
      // Tell all subscribers that a new session has been created  (remote the session information)
      this.message_fowarding.publish(SESSION_GENERATION_PUB,this.conf.auth_path,message)
    }
  }

  // ----
  hash_set(key,value) {
    let hh_unidentified = this._LRUManager.hash_set(key,value)  // in local hash 
    if ( this.section_manager && this.message_fowarding ) {
      //
      let message = {
        "key" : key,
        "value" : value,
        "hash" : augmented_hash_token
      }
      // Tell all subscribers that a new session has been created  (remote the session information)
      this.message_fowarding.publish(SESSION_GENERATION_PUB,this.conf.auth_path,message)
    }
    return hh_unidentified
  }


  // ----
  check_hash(hh_unid,value) {
    return this._LRUManager.check_hash(hh_unid,value)
  }

  delete(key) {
    return this._LRUManager.delete(key)
  }




  setup_auth_path_subscription() {

    if ( this.message_fowarding === false ) return

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
    this.message_fowarding.subscribe(SESSION_GENERATION_PUB,this.conf.auth_path,message,handler)
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
    this.message_fowarding.subscribe(WANT_SESSION_FOR_ID,this.conf.auth_path,message,handler)
    //
    //
    message = {}
    handler = (msg) => {
      let key = msg.key
      let value = msg.value
      let token = msg.hash
      if ( self.still_want_session(key,token) ) {
        lru_m.set_with_token(token,value)
      }
    }
    let targeted_topic = `${APPRISE_SESSION_IN_RESPONSE}-${proc_id}`
    this.message_fowarding.subscribe(targeted_topic,this.conf.auth_path,message,handler)
    //
    //
    message = {}
    handler = (msg) => {
      let key = msg.key
      let proc_id = msg.requester
      self.mark_session_sent(proc_id,key)
    }
    this.message_fowarding.subscribe(SESSION_ALREADY_RECEIVED,this.conf.auth_path,message,handler)
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


module.exports = SessionCacheManager;
