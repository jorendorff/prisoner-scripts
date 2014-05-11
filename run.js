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

    var connect_url = url.parse(server);
    connect_url.query = {
        username: username,
        name: metadata.name
    };
    var socket = io.connect(url.format(connect_url));

    socket.on('connect', function () {
        console.log(username, "connect");
        socket.on('disconnect', function () {
            console.log(username, "disconnect");
        });
        socket.on('event', function (data) {
            console.log(username, "event: " + JSON.stringify(data));
        });
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


// start_user({
//     query: {
//         username: "robot-steve",
//         name: "Scumbag Steve"
//     },
//     play: function* () {
//         while (true) {
//             yield DEFECT;
//         }
//     }
// });


// Stay alive...
setInterval(function () { console.log("boop"); }, 1000);
