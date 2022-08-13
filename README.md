# global\_session

This package represents client modules and servers that provide in memory tables for small objects with lifespans influenced by recency of use. Clients may use the module (*require*) in order to create or use a locally accessable shared memory table that behaves as an LRU (least recently used) list. Clients connect to servers that maintain a backup LRU and pub/sub service made to inform networked clients (separate machines) of newly arriving objects. The service passes around objects to siblings (front-end facing clients) and to backend services that provide pressure relief and storage for aged objects. 

The objects in question may represent sessions for service that require authorization or authorization validation. On any one client machine hosting front-end facing processes, some processes may create new sessions and other may attach to the shared memory LRU in order to check if sessions are going. 

Sessions that age out or that are pushed out under heavy traffic conditions, may be recovered from the services running further downstream from the front-end facing machines. If a query misses the local LRU cache, the query may be relayed downstream to retrieve the session. 

The front-end facing clients can be configured to setup the shared memory sections for expected activity. They can be configured to connect to the downstream servers using TCP/IP either in the clear or with TLS. The may be configured to talk to as many downstream sessions servers as deemed fit for the application. 

The server programs can be run out of the same executable name (setup by npm installation): ***global-sessions***.  Depending on the configuration, the server may be on of two types. The first type is the middle tier server that manages object traffic. The second type is the service client, and endpoint, that may take some part of the objects managed by the middle tier. These might be called **pressure relief** servers. The peasure relief type may be two different subtypes, one that works to keep older objects around, and another that allows relatively new objects to enter and leave quickly as traffic grows and shrinks. 

The idea is that the endpoint boxes (server leafs) may run the two types of pressure relief services.

For each server that runs, configuration determines the kind of server that it is. The servers may be started as such:

```
global-sessions  config-file.conf
```

In the next sections, details of configuration will be explained. 

####External Clients
Not all clients to downstream servers have to be front-end facing siblings of user services. Some clients may be gateways to other validation systems, such as blockchain session validators. Within the project documentation, we may provide some instructions on how to create such external services. However, the pressure relief services are the only similar servers that are supplied. In fact, the middle tier server may be a better model for external services at times. But, the best design of such systems may be as endpoints that then operate with UDP style P2P communications. 

## Installation

```
npm install global_session
```

## Which Modules are Which

### <u>Executable in ./bin</u>

There is just one file in the ./bin directory: **index.js**

On installion, npm will put this into a directory for execution, for instance /usr/local/bin.

This executable uses two of the classes found in ./lib at the top level:

* session\_midway\_relay 
* session\_pressure\_relief

The first of the two provides the middle tier session management. The second is the basis of the two types of endpoints. These are classes that create servers upon construction. 

The first class, **session\_midway\_relay**, calls upon another server, and endpoint, to form a child process that hosts services for the pressure relief servers. That class is **session\_mid\_sibling**. **session\_mid\_sibling** attaches to the LRU of its parent in order to move objects two the backend. It manages pub/sub operations for the parent, which is obly a relayer. Applications may set the polices for object distribution by configuring the config object part dealing with **session\_mid\_sibling**. The **session\_midway\_relay** object communicates with the **session\_mid\_sibling** instance via a path handler that access the IPC mechanism between the two processes.

### <u>Client Accessible Modules -- *require*</u>

Modules required by the clients will be found in ./lib.  There is just one client accessible module in ./lib: **SessionCacheManager**.

SessionCacheManager is exported by index.js in the top level directory. 

```
const {SessionCacheManager} = require('global_session')
```


## Configuration


### <u>TLS Configuration</u>

SSL/TLS provides secure transmission of message. It slows down the communication some, but in many cases it may be recommended for data going between machines over TCP. 

The communication objects that **global\_session** uses can be configured to use TLS. 


### <u>Middle Tier Service</u>


* **conf** is a JSON object loaded by **global\_session**

> **conf.edge\_supported\_relay** = true,
> 
> Include this field in the top level of the JSON file in order to load and run the relay service for middle tier object storage.
> 
> The command **global\_session** will install path handlers that capture the publication of objects in order to store them in the server's local LRU before passing them on to pressure relief servers. Once the path handlers are installed, the **global\_session** process creates a instance of **ServeMessageRelay**, imported from  **message-relay-services**. The **ServeMessageRelay** creates the path handlers mentioned in its configuration. (see auth\_path)
> 
> With this option, the **global\_session** process will also load a derivitive of **SessionMidpointSibling** defined in session\_mid\_sibling.js. **SessionMidpointSibling** is a server decendant of **ServerWithIPC** from **message-relay-services** (an npm package). This is the server that talks to the backend, pressure relief servers. Those servers are clients of this server.
> 
> **SessionPathIntercept extends PeerPublishingHandler**
> >
> > The **SessionPathIntercept** class handles intermediate pub/sub operations and talks to the LRU for the relay server (**ServeMessageRelay**). **SessionPathIntercept** can be configured to use any of the message relay classes from **message-relay-services**. In the default setup for **global\_session**, the **SessionPathIntercept** instance will use IPC communication with a sibling server.
> > 
> > The **SessionPathIntercept** class is injected into the path handler module before other servers are created. It is added in as a path type. In the confi object, a field *auth\_path* names the type of the class. Its value will be a field name within the *path\_types* field refering to a sub configuration object for the **SessionPathIntercept** instance. In the example configuration below, the reader will see that the *auth\_path* field has a value "auth". Further down, under the field *path\_types*, the reader will see a field "auth". The "auth" field has subfields for the cache and for the relay client, including the name of the child process which act as the sibling for the main **global\_session** process.
>
> These sibling servers, the **ServeMessageRelay** instance and the **SessionMidpointSibling** server talk to each other via IPC. node.js makes this easy enough to setup. But, in order to call the process launch at the right point and hide communication details from path classes and message relay classes, the path handlers are given a specific message relay class, **IPCClient**, which is also imported from **message-relay-services**. It is the **IPCClient** that spawns the desired sibling process and setsup the IPC parameters. The **IPCClient** intance looks for the field *proc\_name*  within its section of the configuration oject. The **IPCClient** is made by the **SessionPathIntercept** instance when the relay server **ServeMessageRelay** sets up all the types of paths it is configured to use.
> 
> 

```
{
 	"edge_supported_relay" : true,
	"auth_path" : "auths",
	"port" : 7878,    // <- set the port with your own number
	"address" : "binding address",
	"tls" : {
        "server_key" : "keys/ec_key.pem",
        "server_cert" : "keys/ec_crt.crt",
        "client_cert" : "keys/cl_ec_crt.crt"
 	 },
    "path_types" : {
        "auths" : {
            "relay" : {
                "proc_name" : ["global-sessions", "./sibling.conf"]
            },
            "cache" : {
                "token_path" : "./ml_relay.conf",
                "am_initializer" : true,
                "seed" : 9849381,
                "record_size" : 384,
                "el_count" : 20000
            }
        } 
    }
}
```




* Customization: **SessionPathIntercept** Decendant


### <u>Sibling Endpoint Service</u>

* **conf** is a JSON object loaded by **global\_session**

> **conf.half\_edge** = true,
> 
> The sibling server is an instance of **SessionMidpointSibling**. **SessionMidpointSibling** is in turn a descendant of classes from **message-relay-services**. The parent classes are **ServerWithIPC** and the **Server** defined as a message endpoint within **message-relay-services**.
> 
> The cofiguration passed up from  **SessionMidpointSibling** to its parents is used almost completely as a configuration for the endpoint server. The configuration is used in both the construction of the instance and in the initialization methods. **ServerWithIPC** just ensures that the IPC link to the relay service is set up. And, then it exposes itself to backend clients in the exact same manner as an endpoint server.
> 
> The endpoint server needs the port and address on which to serve. And, it needs the tls configuration for secure transmitions.
> 
> The **SessionMidpointSibling** initializes itself to handle subscriptions and to attach to but not create cache. By handling subscriptions the server can intercept and respond with objects in cache, where those object have been placed in cache by the relay server. 
> 
> Notice that in the next example the auth path is defined. The auth path may be inserted into messages for publisher on the path. However, the endpoint does not use path handlers since it is an endpoint to a path. 
> 
> The cache information is the same as that of the relay server. Except, the field *am\_initializer* is set to **false**.

```
{
    "half_edge" : true,
    "auth_path" : "auths",
    "port" : 7880,
    "address" : "localhost",
	 "tls" : {
        "server_key" : "keys/ec_key.pem",
        "server_cert" : "keys/ec_crt.crt",
        "client_cert" : "keys/cl_ec_crt.crt"
 	 },
    "cache" : {
        "token_path" : "./ml_relay.conf",
        "am_initializer" : false,
        "seed" : 9849381,
        "record_size" : 384,
        "el_count" : 20000,
        "stop_child" : true
    }
}

```


### <u>Pressure Relief Services</u>

* **conf** is a JSON object loaded by **global\_session**

> **conf.full\_edge** = true,
> 
> The pressure relief servers are clients to the relay sibling endpoint server. For a point of clarrifiation, pressure relief servers are not endpoint servers. There are as much clients as are front-end facing clients. However, they don't offer any further upstream movement of objects.
> 
> These servers come in two varieties. First, there are those that simply take the most recent entries into the LRU as pressure builds up on the front end. Second, there are those that retain aged out objects and keeps them in a slowly expiring LRU. 
> 
> The aim of having these servers is to allow for scaling horizontally the memory needed for session storage as the demands of a service evolve. The **SessionMidpointSibling** can be configured to select a form of distributed hashing, allowing for its table to be distributed among pressure relief devices, each of which may be small, low power servers with enough memory to make their participation in the service feasible. 
>
> It is up to the developer to decide whether or not to place one more services on a box. For our service at copious.world, each pressure relief box has one aging service and one expansion service, or two services per box.
> 
> Each process that creates an instance of **SessionPressureRelief** merely creates a client connection to the **SessionMidpointSibling**. The connection by itself would be inactive except that the **SessionPressureRelief** instance activates pub/sub mechanisms which remain responsive to messages published (or forwarded) by the middle tier services. So, the **global\_session** only needs to create the connection. 
> 
> Some applications may want to make custom versions of the pressure relief services in order to add in commands for administration, logging, etc.
> 
> In order to make descendants of the **SessionPressureRelief**, one may require (import) the class from the module as such:
> 
```
const {SessionPreasureRelief} = require('global_session')
```

Here is an an example of a configuration file for a pressure relief service:

```
{
    "lru" : {
        "manage_section" : true,
        "cache" : {
            "seed" : 9849381
        }
    },
    "message_relay" : {
        "auth_path" : "auths",
        "address" : "localhost",
        "port" : 7880,
	 	 "tls" : {
	        "server_key" : "keys/ec_key.pem",
	        "server_cert" : "keys/ec_crt.crt",
	        "client_cert" : "keys/cl_ec_crt.crt"
	 	 }
    }
}

```



### <u>Client Side Configuration and Use</u>

* **conf** is a JSON object loaded by the application.

> The client side, or front-end facing application, is always a client connection made by creating a **SessionCacheManager**. The session cache manager has a constructor that requires two configuration objects. One object is for the LRU. The second object is for the message relay client object.
>
> The message relay object is set to connect to the address and port of the relay server (the parent process of the middle tier).
> 
> The LRU object is set to either create (one process on the application box) or to connect to it. The parameter **manage\_section** when set to **true**, tells the application to create a shared memory section. When the parameter is set to **false**, the application will attach to the shared memory section.
> 
> In the application code, the **SessionCacheManager** class may be introduced with a require statement as follows:
```
const {SessionCacheManager} = require('global_session')
```

The application will then create an instance by invoking **new** on the calls with the appropriate constructor paramenters as such:

```
let CacheCom = new SessionCacheManager(lru_conf,message_relays)
```

The first paramter will provide the fields necessary to create or attach to a shared memory section and set an LRU in it. The second parameter will establish communication with the **ServeMessageRelay** server. 

And application might have a constructor such as the one in the next axample:

```
let conf = {
    "lru" : {
        "manage_section" : true|false,
        "cache" : {
            "seed" : 9849381
        }
    },
    "my_messages" : {
        "auth_path" : "auths",
        "address" : "localhost",
        "port" : 7878,    // <- set the port with your own number
	 	 "tls" : {
	        "server_key" : "keys/ec_key.pem",
	        "server_cert" : "keys/ec_crt.crt",
	        "client_cert" : "keys/cl_ec_crt.crt"
	 	 }
    }
}

```

The application would then execute the following:

```
let cacheCom = new SessionCacheManager(conf.lru,conf.my_messages)
```

Later on in the application, the client would be able to get and set object by calling on the *cacheCom* instance. E.g.

```
cacheCom.set(key,value)

//This might then be followed by 

let value = await cacheCom.get(key)
```

Notice that the *get* method is asynchronous since the value may have to be retrieved from the backend cache and reintroduced to the local cache.



## Session Objects



## Other Kinds of Objects







