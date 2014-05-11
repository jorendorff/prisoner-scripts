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

// Connect to the server and play forever using the given robot player metadata
// and code.
function start_robot(metadata, code) {
    var username = metadata.username;

    // Create the main generator function for this robot.
    var main = compile(code);

    var connect_url = url.parse(server);
    connect_url.query = {
        username: username,
        name: metadata.name
    };
    var socket = io.connect(url.format(connect_url));

    var games = {};

    function compute_move(game_id, opponent_previous_move) {
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
        socket.emit('add:user', username);
    });

    socket.on('game:init', function (msg) {
        var game_id = msg.game_id;

        // Send the server our code.
        socket.emit('game:ready', {game_id: game_id, code: code});

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

}

// Read the contents of the given filename. Parse headers. Then call start_robot
// to connect to the server and play.
function start_file(filename) {
    console.info("starting:", filename);

    var username = "robot-" + filename.match(/\/([^\/]*)\.js$/)[1];

    fs.readFile(filename, {encoding: "utf-8"}, function (err, text) {
        if (err) {
            console.error("error reading file: " + filename);
            console.error(err);
            return;
        }

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

        start_robot(metadata, text);
    });
}

function start_main() {
    var dir = __dirname + "/characters";
    fs.readdir(dir, function (err, files) {
        if (err)
            return console.error(err);
        files.forEach(function (name) {
            if (name.match(/\.js$/))
                start_file(dir + "/" + name);
        });
    });
}

start_main();

// Stay alive...
setInterval(function () { console.log("boop"); }, 1000);
