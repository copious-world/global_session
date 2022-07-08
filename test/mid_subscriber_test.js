const {MessageRelayer} = require('message-relay-services')
const {make_process_identifier,remove_special_files} = require('../lib/utils')
const LRU = require('shm-lru-cache')
const LRUManager = require('../lib/lru_manager')
const SessionCacheManager = require('../lib/global_session')



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

    conf._test_use_no_memory = true  /// LINE ADDED FOR TEST

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


class FAUX_FOR_TEST_LRUManager extends LRUManager {
    //
    constructor(conf) {
        //
        conf.cache.custom_lru_manager = FAUX_LRU
        super(conf)
        //
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

class SessionCacheManager_TEST extends SessionCacheManager {
  //
  constructor(lru_conf,message_relays) {
    //
    lru_conf.custom_lru_manager = FAUX_FOR_TEST_LRUManager
    //
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

    console.log("setup_auth_path_subscription :: ")
    let message = {}
    let lru_m = this._LRUManager
    let self = this

    let proc_id = this.process_identifier

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
    console.dir(resp)
    //

    // SESSION_OVERFLOW
    // What sets this apart from others is that this process will take the aging token and hold on to it until it gets quite old
    handler = (msg) => {  // If receiving news, just set it locally using the generated hash
      let value = msg.value
      let token = msg.hash
      lru_m.set_with_token(token,value)
    }
    let resp = await this.message_fowarding.subscribe(SESSION_OVERFLOW,this.conf.auth_path,message,handler)
    console.dir(resp)
    // 

    // WANT_SESSION_FOR_ID
    // Look for sessions that were lost from the buffers experiencing high activity
    // return them to the from of the queue.
    message = {}
    handler = async (msg) => {
      let hash = msg.hash
      console.dir(msg)
      console.log(hash)
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
    console.dir(resp)
    //
  }

}



async function run_test() {

    console.log("STARTING TEST")

    let cache_manager = new SessionCacheManager_TEST(test_conf.lru,test_conf.message_relay)

    let key = '79131'
    let value = "{ we are testing our limits }"
    cache_manager.set(key,value)
}



run_test()