const {make_process_identifier} = require('../lib/utils')
const SessionCacheManager = require('../lib/global_session')


// ---- ---- ---- ---- ---- ---- ---- ---- ----
const SESSION_GENERATION_PUB = "session"
const WANT_SESSION_FOR_ID = "need_session"
const APPRISE_SESSION_IN_RESPONSE = "session_known"
const SESSION_OVERFLOW = "session_backup"
//
//const SESSION_ALREADY_RECEIVED = "session_received"


// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

class SessionPressureRelief extends SessionCacheManager {
  //
  constructor(lru_conf,message_relays) {
    super(lru_conf,message_relays)
    //
    this.conf = message_relays
    this.process_identifier = make_process_identifier()
    //
    this.section_manager = false
    this.message_fowarding = false
    //
  }

  // ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

  async setup_auth_path_subscription() {

    if ( this.message_fowarding === false ) return

    let repo_type = this.conf.age_or_replica

    let message = {}
    let lru_m = this._LRUManager
    let self = this

    let proc_id = this.process_identifier

    if ( repo_type === "replicating" ) {
      // SESSION_GENERATION_PUB -- responsd to new session
      // All clients may publish a generation of ID, although usually just one machine will actively do so. 
      // Still all will respond. 
      let handler = (msg) => {  // If receiving news, just set it locally using the generated hash
        let value = msg.value
        let token = msg.hash
        // At this point, a check can be done to see if this is within the bounds of sparse new and dense aging sessions
        lru_m.set_with_token(token,value)
      }
      //
      let resp = await this.message_fowarding.subscribe(SESSION_GENERATION_PUB,this.conf.auth_path,message,handler)
      //
    }

    if ( repo_type === "age-out" ) {
      // SESSION_OVERFLOW
      // What sets this apart from others is that this process will take the aging token
      //  and hold on to it until it gets quite old
      handler = (msg) => {  // If receiving news, just set it locally using the generated hash
        let value = msg.value
        let token = msg.hash
        lru_m.set_with_token(token,value)
      }
      let resp = await this.message_fowarding.subscribe(SESSION_OVERFLOW,this.conf.auth_path,message,handler)
    }

    // WANT_SESSION_FOR_ID
    // Look for sessions that were lost from the buffers experiencing high activity
    // return them to the from of the queue.
    message = {}
    handler = async (msg) => {
      let hash = msg.hash
      //
      if ( this.session_sent(proc_id,hash) ) return
      let augmented_hash_token = this._LRUManager.cache.augment_hash(hash)
      let value = await this._LRUManager.get_with_token(augmented_hash_token)
      if ( value !== false ) {
        msg.value = value // this is capable of responding so send it 
        let proc_id = msg.requester
        // RESPOND BY PUBLISHING
        let targeted_topic = `${APPRISE_SESSION_IN_RESPONSE}-${proc_id}`
        self.message_fowarding.publish(targeted_topic,this.conf.auth_path,msg)
      }
      //
    }
    // ---- ---- ---- ---- ----
    resp = await this.message_fowarding.subscribe(WANT_SESSION_FOR_ID,this.conf.auth_path,message,handler)
    //
  }

}


module.exports = SessionPressureRelief