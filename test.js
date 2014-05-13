'use strict';

var robots = require('./robots');

function addControlsToSocket(socket, username) {
    socket.on('observe:init', function (msg) {
        var pendingID = msg.clientTag + "/" + msg.players[1];
        console.info("<", username, "observe:init", msg.game_id, msg.clientTag,
                     msg.players[0], msg.players[1]);
        Game.started(msg);
    });

    socket.on('observe:progress', function (msg) {
        console.info("<", username, "observe:progress", msg.game_id,
                     "P1:" + msg.player1_move, "P2:" + msg.player2_move,
                     "(" + msg.player1_score + "-" + msg.player2_score + ")");
    });

    socket.on('observe:over', function (msg) {
        console.info("<", username, "observe:over", msg.game_id,
                     "(" + msg.player1_score + "-" + msg.player2_score + ")");
        Game.ended(msg);
    });

    socket.on('tournament:started', function (msg) {
        console.info("<", username, "tournament:started", msg.clientTag);
    });

    socket.on('tournament:done', function (msg) {
        console.info("<", username, "tournament:done", msg.clientTag);
        tournaments[msg.clientTag]._resolve(msg.scores);
    });
}

var nextClientTag = 0;
var pendingGames = Object.create(null);
var games = Object.create(null);
var tournaments = Object.create(null);

function Game(p1, p2, clientTag, resolve, reject) {
    this.id = undefined;
    this.players = [p1, p2];
    this.done = new Promise(function (resolve, reject) {
        this._resolve = resolve;
        this._reject = reject;
    }.bind(this));
    pendingGames[clientTag + ":" + p1.name + "/" + p2.name] = this;
}

Game.started = function (msg) {
    var p0 = robots.byId[msg.players[0]], p1 = robots.byId[msg.players[1]];
    var pendingId = msg.clientTag + ":" + p0.name + "/" + p1.name;
    var game = pendingGames[pendingId];
    game.id = msg.game_id;
    games[game.id] = game;
    delete pendingGames[pendingId];
};

Game.ended = function (msg) {
    var game = games[msg.game_id];
    game.scores = [msg.player1_score, msg.player2_score];
    game._resolve(game);
    delete games[msg.game_id];
};

function playGame(name1, names) {
    var p1 = robots.byName[name1];
    var ids = names.map(function (name) { return robots.byName[name].id; });
    var clientTag = nextClientTag++;
    console.info(">", "robot-" + p1.name, "play:now", ids);
    p1.socket.emit("play:now", ids, clientTag);
    return names.map(function (name) {
        var p2 = robots.byName[name];
        return new Game(p1, p2, clientTag).done;
    });
}

function playOneGame(name1, name2) {
    return playGame(name1, [name2])[0];
}

function test(name1, score1, name2, score2) {
    var expected = name1 + " " + score1 + ", " + name2 + " " + score2;
    return playOneGame(name1, name2).then(function (game) {
        var scores = game.scores;
        var actual = name1 + " " + scores[0] + ", " + name2 + " " + scores[1];
        console.log((actual === expected ? "PASS" : "FAIL") + " - " + actual);
        return actual === expected;
    })
}

function tournament(names) {
    var ids = names.map(function (name) {
        if (!(name in robots.byName))
            throw new Error("no robot named '" + name + "'");
        return robots.byName[name].id;
    });
    var clientTag = nextClientTag++;

    // We have to create a Game object for each game we expect the server to
    // start.  This means all pairs of ids:
    for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) {
            new Game(robots.byName[names[i]], robots.byName[names[j]], clientTag);
        }
    }

    robots.byName.greg.socket.emit('tournament:start', {players: ids, clientTag: clientTag});
    return new Promise(function (resolve, reject) {
        tournaments[clientTag] = {_resolve: resolve, _reject: reject};
    });
}

robots.startAll().then(function () {
    console.info("all started!");

    for (var name in robots.byName) {
        addControlsToSocket(robots.byName[name].socket, "robot-" + name);
    }

    var tests = [
        test("steve", 500, "greg", 0),
        //test("steve", 476, "froggy", 6),
        test("greg", 300, "walter", 300),
        test("steve", 104, "walter", 99)
    ];
    return Promise.all(tests);
}).then(function () {
    return tournament("steve greg walter skier cotton penguin".split(" "));
}).then(function (scores) {
    scores.forEach(function (pair) {
        console.log(robots.byId[pair.user_id].name, pair.score);
    });
}).catch(function (exc) {
    console.error(exc.stack);
    console.error(exc);
}).then(process.exit);
