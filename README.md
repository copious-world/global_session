# global_session

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


### <u>Client Accessible Modules -- *require*</u>

Modules required by the clients will be found in ./lib.  There is just one client accessible module in ./lib: **SessionCacheManager**.

SessionCacheManager is exported by index.js in the top level directory. 

```
const {SessionCacheManager} = require('global_session')
```


## Configuration

### <u>Middle Tier Services</u>

have a nice day

### <u>Pressure Relief Services</u>

have a nice day

### <u>Client side configuration and use</u>

have a nice day

## Session Objects


## Other Kinds of Objects






