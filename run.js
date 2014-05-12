// This is the main script. It loads each script in the characters directory
// and creates a socket.io connection to the server for each one.
//
// Each character has a fixed script and will play the game whenever the server
// asks it to.

'use strict';

var url = require('url');
var io = require('socket.io-client');
var fs = require('fs');

// First, a little utility function.
//
// lift() takes any typical Node async function that accepts an error-first
// callback as its last argument, and wraps it in a function that returns a
// Promise instead. Promises are more fun.
//
// It's hard to explain why this is called "lift" but it's a common name for
// this kind of operation, where a function is transformed.
function lift(fn) {
    return function () {
        var args = arguments;
        return new Promise(function (resolve, reject) {
            args[args.length++] = function (err, val) {
                if (err)
                    reject(err);
                else
                    resolve(val);
            };
            fn.apply(this, args);
        });
    };
}

// Here are some examples of lift() in use.
var readFile = lift(fs.readFile);
var readdir = lift(fs.readdir);

// At the moment, the server is configured only to allow robots to connect from
// localhost (since they have no other means of authentication).
var server = "http://localhost:3000/";

// All robots that have successfully connected and logged in, by name.  For
// example, `robots.greg` will be the robot defined in `characters/greg.js`.
var robots = {};

function Robot(name, metadata, code) {
    this.name = name;
    this.metadata = metadata;
    this.code = code;
    var f = Function(
        "var COOPERATE = 'COOPERATE', DEFECT = 'DEFECT';\n" +
        code +
        "\n; return main;");
    this.main = f();
    this.socket = undefined;  // We'll open a socket in start() below.
    this.id = undefined;  // An identifying string assigned by the server.
}

// Connect to the server and play forever using the given robot object.
function startRobot(robot) {
    var username = "robot-" + robot.name;

    var connectURL = url.parse(server);
    connectURL.query = {
        username: username,
        name: robot.metadata.name
    };

    return new Promise(function (resolve, reject) {
        // I can't find any API in socket.io-client for being called back on
        // errors, so `reject` isn't used.
        console.log(username, "connecting to", url.format(connectURL));
        var socket = io.connect(url.format(connectURL), {"force new connection": true});

        var games = {};

        function computeMove(game_id, opponentPreviousMove) {
            var result = games[game_id].next(opponentPreviousMove);
            if (result.done)
                throw new Error(username + " returned instead of yielding a move in game " + game_id);
            var move = result.value;

            // If move is a promise, wait for it to resolve. This gross feature
            // is used (appropriately enough) by Foul Bachelor Frog.
            if (typeof move.then === "function") {
                move.then(function (result) {
                    computeMove(game_id, result);
                });
                return;
            }

            if (move !== 'COOPERATE' && move !== 'DEFECT')
                console.warn(username + " yielded an invalid move in game " + game_id);
            console.info(">", username, "game:move", game_id, move);
            socket.emit('game:move', {game_id: game_id, move: move});
        }

        socket.on('connect', function () {
            console.info("*", username, "connect");
            robot.socket = socket;
            console.info(">", username, "add:user");
            socket.emit('add:user', username);
            // The response to this will be a 'login' message.
        });

        socket.on('login', function (data) {
            console.info("<", username, "login", data.user._id);
            robot.id = data.user._id;
            robots[robot.name] = robot;
            resolve(robot);
        });

        socket.on('game:init', function (msg) {
            var game_id = msg.game_id;
            console.info("<", username, "game:init", game_id);

            // Send the server our code.
            console.info(">", username, "game:ready", game_id);
            socket.emit('game:ready', {game_id: game_id, code: robot.code});

            // Call the generator function to create a generator object.
            games[game_id] = robot.main();
            computeMove(game_id, undefined);
        });

        socket.on('game:next', function (msg) {
            console.info("<", username, "game:next", msg.game_id, msg.previous);
            computeMove(msg.game_id, msg.previous);
        });

        socket.on('game:over', function (msg) {
            console.info("<", username, "game:over", msg.game_id);
            delete games[msg.game_id];
        });

        socket.on('observe:progress', function (msg) {
            console.info("<", username, "observe:progress", msg.game_id,
                         "P1:" + msg.player1_move, "P2:" + msg.player2_move,
                         "(" + msg.player1_score + "-" + msg.player2_score + ")");
        });

        socket.on('observe:over', function (msg) {
            console.info("<", username, "observe:over", msg.game_id,
                         "(" + msg.player1_score + "-" + msg.player2_score + ")");
        });
    });
};

// Read the contents of the given filename. Parse headers. Return a promise for
// a new Robot object.
Robot.load = function (filename) {
    console.info("starting:", filename);

    var name = filename.match(/\/([^\/]*)\.js$/)[1];

    return readFile(filename, {encoding: "utf-8"}).then(function (text) {
        // Parse lines at the beginning of the file that match
        // the pattern "// key: value\n".
        var metadata = {};
        while (true) {
            var match = text.match(/^\/\/ (\w+): (.*)\n/);
            if (match === null)
                break;
            metadata[match[1]] = match[2];
            text = text.substring(match[0].length);
        }
        return new Robot(name, metadata, text);
    });
};

// Read all the character files, connect each character to the server. Return a
// promise that resolves when all characters are connected.
function startAll() {
    var dir = __dirname + "/characters";
    return readdir(dir).then(function (files) {
        files = files.filter(function (name) { return name.match(/\.js$/); });

        // Load and start each robot. This produces an array of promises for Robot objects.
        var robots = files.map(function (name) {
            return Robot.load(dir + "/" + name).then(startRobot);
        });

        // Return a promise that becomes resolved when all the Robots are done starting.
        return Promise.all(robots);
    });
}

startAll().then(function () {
    console.info("all started! starting a match:");
    console.info(">", "robot-steve", "play:now", [/*robots.greg.id,*/ robots.froggy.id]);
    robots.steve.socket.emit("play:now", [/*robots.greg.id,*/ robots.froggy.id]);
}).catch(function (exc) {
    console.error(exc);
});
