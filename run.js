'use strict';

var url = require('url');
var io = require('socket.io-client');
var fs = require('fs');

var server = "http://localhost:3000/";

function compile(code) {
    return Function(
        "var COOPERATE = 'COOPERATE', DEFECT = 'DEFECT';\n" +
        code +
        "\n; return main;")();
}

var robots = {};

// Connect to the server and play forever using the given robot object.
function start_robot(robot) {
    var username = robot.metadata.username;

    // Create the main generator function for this robot.
    var main = compile(robot.code);

    var connect_url = url.parse(server);
    connect_url.query = {
        username: username,
        name: robot.metadata.name
    };

    return new Promise(function (resolve, reject) {
        // I can't find any API in socket.io-client for being called back on
        // errors, so `reject` isn't used.
        console.log(username, "connecting to", url.format(connect_url));
        var socket = io.connect(url.format(connect_url), {"force new connection": true});

        var games = {};

        function compute_move(game_id, opponent_previous_move) {
            console.log(username, game_id, opponent_previous_move);
            var result = games[game_id].next(opponent_previous_move);
            if (result.done)
                throw new Error(username + " returned instead of yielding a move in game " + game_id);
            var move = result.value;
            if (move !== 'COOPERATE' && move !== 'DEFECT')
                throw new Error(username + " yielded an invalid move in game " + game_id);
            socket.emit('game:move', {game_id: game_id, move: move});
        }

        socket.on('connect', function () {
            console.log(username, "connect");
            robot.socket = socket;
            socket.emit('add:user', username);
            // The response to this will be a 'login' message.
        });

        socket.on('login', function (data) {
            robot.id = data.user._id;
            console.log(username, "login as", robot.id);
            robots[robot.name] = robot;
            resolve(robot);
        });

        socket.on('game:init', function (msg) {
            var game_id = msg.game_id;

            // Send the server our code.
            socket.emit('game:ready', {game_id: game_id, code: robot.code});

            // Call the generator function to create a generator object.
            games[game_id] = main();
            compute_move(game_id, undefined);
        });

        socket.on('game:next', function (msg) {
            compute_move(msg.game_id, msg.previous);
        });

        socket.on('game:over', function (msg) {
            delete games[msg.game_id];
        });
    });
}

// This function takes any function that accepts a Node error-first callback as
// its last argument, and wraps it in a function that returns a Promise instead.
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

var readFile = lift(fs.readFile);

// Read the contents of the given filename. Parse headers. Return a promise for
// a new Robot object.
function load_robot_file(filename) {
    console.info("starting:", filename);

    var name = filename.match(/\/([^\/]*)\.js$/)[1];
    var username = "robot-" + name;

    return readFile(filename, {encoding: "utf-8"}).then(function (text) {
        // Parse lines at the beginning of the file that match
        // the pattern "// Key: value\n".
        var metadata = {username: username};
        while (true) {
            var match = text.match(/^\/\/ (\w+): (.*)\n/);
            if (match === null)
                break;
            metadata[match[1]] = match[2];
            text = text.substring(match[0].length);
        }
        return {name: name, metadata: metadata, code: text};
    });
}

var readdir = lift(fs.readdir);

// Read all the character files, connect each character to the server. Return a
// promise that resolves when all characters are connected.
function start_main() {
    var dir = __dirname + "/characters";
    return readdir(dir).then(function (files) {
        files = files.filter(function (name) { return name.match(/\.js$/); });
        return Promise.all(files.map(function (name) {
            return load_robot_file(dir + "/" + name).then(start_robot);
        }));
    });
}

start_main().then(function () {
    console.info("all started! starting a match:");
    robots.steve.socket.emit("play:now", [robots.greg.id]);
}).catch(function (exc) {
    console.error(exc);
});

// Stay alive...
setInterval(function () { console.log("boop"); }, 60 * 1000);
