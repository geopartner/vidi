/*
 * @author     Martin Høgh <mh@mapcentia.com>
 * @copyright  2013-2019 MapCentia ApS
 * @license    http://www.gnu.org/licenses/#AGPL  GNU AFFERO GENERAL PUBLIC LICENSE 3
 */

//process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';


let path = require('path');
require('dotenv').config({path: path.join(__dirname, ".env")});

let express = require('express');
let http = require('http');
let cluster = require('cluster');
let sticky = require('sticky-session');
let compression = require('compression');
let bodyParser = require('body-parser');
let cookieParser = require('cookie-parser');
let session = require('express-session');
let cors = require('cors');
let config = require('./config/config.js');
let store;
let app = express();

const MAXAGE = (config.sessionMaxAge || 86400) * 1000;

if (!config?.gc2?.host) {
    if (!config?.gc2) {
        config.gc2 = {};
    }
    config.gc2.host = process.env.GC2_HOST;
}
if (!config?.gc2?.host) {
    console.error("No GC2 host set. Set it through the environment variable GC2_HOST or in config/config.js");
    process.exit(0)
}

app.use(compression());
app.use(cors());
app.use(cookieParser());
app.use(bodyParser.json({
        limit: '50mb'
    })
);
app.use(bodyParser.text({
        limit: '50mb'
    })
);
// to support JSON-encoded bodies
app.use(bodyParser.urlencoded({
    extended: true,
    limit: '50mb'
}));
app.set('trust proxy', 1); // trust first proxy

if (typeof config?.redis?.host === "string") {
    let redis = require("redis");
    let redisStore = require('connect-redis')(session);
    let client = redis.createClient({
        host: config.redis.host.split(":")[0],
        port: config.redis.host.split(":")[1] || 6379,
        db: config?.redis?.db || 3,
        retry_strategy: function (options) {
            if (options.error && options.error.code === 'ECONNREFUSED') {
                return new Error('The server refused the connection');
            }
            if (options.total_retry_time > 1000 * 60 * 60) {
                return new Error('Retry time exhausted');
            }
            if (options.attempt > 10) {
                return undefined;
            }
            return Math.min(options.attempt * 100, 3000);
        }
    });
    store = new redisStore({
        client: client,
        ttl: MAXAGE
    });
} else {
    let fileStore = require('session-file-store')(session);
    store = new fileStore({
        path: "/tmp/sessions",
        ttl: MAXAGE
    });
}
let sess = {
    store: store,
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    name: "connect.gc2",
    cookie: {secure: false, httpOnly: false, maxAge: MAXAGE},
};

if (app.get('env') === 'production') {
    app.set('trust proxy', 1) // trust first proxy
    sess.cookie.secure = true
    sess.cookie.sameSite = 'none'
}

app.use(session(sess));

app.use('/app/:db/:schema?', express.static(path.join(__dirname, 'public'), {maxage: '60s'}));
if (config.staticRoutes) {
    for (let key in config.staticRoutes) {
        if (config.staticRoutes.hasOwnProperty(key)) {
            console.log(key + " -> " + config.staticRoutes[key]);
            app.use('/app/:db/:schema/' + key, express.static(path.join(__dirname, config.staticRoutes[key]), {maxage: '60s'}));
        }
    }
}
app.use('/', express.static(path.join(__dirname, 'public'), {maxage: '100d'}));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules'), {maxage: '100d'}));
app.use(require('./controllers'));
app.use(require('./extensions'));
app.enable('trust proxy');

const port = process.env.PORT ? process.env.PORT : 3000;
const server = http.createServer(app);

// wrap sticky-session for debugging
try {

    if (!sticky.listen(server, port)) {
        // Master thread
        server.once('listening', () => {
            console.log(`Master thread is handling server setup on port ${port}`);
        });

        console.log(`Master process PID: ${process.pid}`);

        // Handle uncaught exceptions in the master process
        process.on('uncaughtException', (err) => {
            console.error(`Master thread uncaught exception: ${err.message}`);
            console.error(err.stack);
            process.exit(1); // Exit the master process
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Master thread unhandled promise rejection:', reason);
            process.exit(1); // Exit the master process
        });
    } else {
        // Worker thread
        console.log(`Worker started: ${cluster.worker.id}, PID: ${process.pid}`);

        // Handle uncaught exceptions in the worker process
        process.on('uncaughtException', (err) => {
            console.error(`Worker ${cluster.worker.id} uncaught exception: ${err.message}`);
            console.error(err.stack);
            process.exit(1); // Allow the master to restart the worker
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error(`Worker ${cluster.worker.id} unhandled promise rejection:`, reason);
            process.exit(1); // Allow the master to restart the worker
        });
    }
} catch (err) {
    console.error('Error in sticky-session master balance:', err);
    process.exit(1);
}

// listen to clientError events
server.on('clientError', (err, socket) => {
    console.error('Client error:', err.message);
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

// set a timeout on server connections
server.setTimeout(30000);

// Listen for the 'timeout' event to log request details
server.on('timeout', (req, socket) => {
    console.warn('Request timeout:');
    console.warn(`Method: ${req.method}`);
    console.warn(`URL: ${req.url}`);
    console.warn(`Headers: ${JSON.stringify(req.headers)}`);
    console.warn(`Client IP: ${socket.remoteAddress}`);

    // Send HTTP 408 response and close the connection
    if (!socket.destroyed) {
        socket.end('HTTP/1.1 408 Request Timeout\r\n\r\n');
    }
});


global.io = require('socket.io')(server);
io.on('connection', function (socket) {
    console.log('io connected to:', socket.id);
});
