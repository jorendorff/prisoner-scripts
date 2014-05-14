'use strict';

var robots = require('./robots');
var assert = require('assert');

// ## Controls
//
// Before we can test the robots, we need a way to launch games.  The robots
// themselves only play the games they're asked to play.  Here we add the
// ability to start games and tournaments, and get the scores when they're
// done.
//
// There is some extra complexity (clientTag) because not only do we need to
// launch games and observe outcomes, we must match requests and outcomes to
// each other. Otherwise, how would we know when to resolve the promise
// returned by playOneGame? Many other games, possibly involving the same
// players, may be going on at the same time.

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
    this.observer = undefined;
    pendingGames[clientTag + ":" + p1.name + "/" + p2.name] = this;
}

Game.started = function (msg) {
    var p0 = robots.byId[msg.players[0]._id], p1 = robots.byId[msg.players[1]._id];
    var pendingId = msg.clientTag + ":" + p0.name + "/" + p1.name;
    var game = pendingGames[pendingId];
    game.id = msg.game_id;
    games[game.id] = game;
    delete pendingGames[pendingId];
};

Game.progress = function (msg) {
    var game = games[msg.game_id];
    if (game.observer)
        game.observer(msg);
};

Game.ended = function (msg) {
    var game = games[msg.game_id];
    game.scores = [msg.player1_score, msg.player2_score];
    game._resolve(game);
    delete games[msg.game_id];
};

Game.prototype.observe = function (cb) {
    this.observer = cb;
};

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
        Game.progress(msg);
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

// Sends 'play:now' to the server; returns an Array of Games.
function playNow(robot, opponents) {
    var ids = opponents.map(function (r) { return r.id; });
    var clientTag = nextClientTag++;
    console.info(">", "robot-" + robot.name, "play:now", ids);
    robot.socket.emit("play:now", ids, clientTag);
    return opponents.map(function (opp) {
        return new Game(robot, opp, clientTag);
    });
}

// Returns an array of promises instead, which is what you want
// if you don't care about anything but the outcome of the game.
function playGamesWith(robot, opponents) {
    return playNow(robot, opponents).map(function (game) {
        return game.done;
    });
}

function playOneGame(r1, r2) {
    return playGamesWith(r1, [r2])[0];
}

function tournament(players) {
    var ids = players.map(function (r) { return r.id; });
    var clientTag = nextClientTag++;

    // We have to create a Game object for each game we expect the server to
    // start.  This means all pairs of ids:
    for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) {
            new Game(players[i], players[j], clientTag);
        }
    }

    players[0].socket.emit('tournament:start', {players: ids, clientTag: clientTag});
    return new Promise(function (resolve, reject) {
        tournaments[clientTag] = {_resolve: resolve, _reject: reject};
    });
}


// ## Running games locally

// It is also possible to run a game locally and sychronously (though this
// doesn't support forfeiting or the `sleep` thing that characters/froggy.js
// does).
var COOPERATE = 'COOPERATE', DEFECT = 'DEFECT';
var NROUNDS = 100;
function playLocally(r0, r1) {
    var g0 = r0.main(), g1 = r1.main();
    var m0 = undefined, m1 = undefined;
    var s0 = 0, s1 = 0;
    for (var i = 0; i < NROUNDS; i++) {
        var moves = [g0.next(m1), g1.next(m0)];
        if (moves[0].done)
            throw new Error("unexpected quit by " + r0.name);
        if (moves[1].done)
            throw new Error("unexpected quit by " + r1.name);
        m0 = moves[0].value;
        m1 = moves[1].value;
        if (m0 !== COOPERATE && m0 !== DEFECT)
            throw new Error("unexpected move by " + r0.name + ": " + m0);
        if (m1 !== COOPERATE && m1 !== DEFECT)
            throw new Error("unexpected move by " + r1.name + ": " + m1);
        var scores = payouts[m0][m1];
        s0 += scores[0];
        s1 += scores[1];
    }
    return [s0, s1];
}

var payouts = {
    COOPERATE: {
        COOPERATE: [3, 3],
        DEFECT: [0, 5],
    },
    DEFECT: {
        COOPERATE: [5, 0],
        DEFECT: [1, 1],
    }
};


// ## Test support

// Hack Mocha to support async programming using generators and promises.
//
// "You are not expected to understand this."
// http://cm.bell-labs.com/cm/cs/who/dmr/odd.html
//
var Generator = function *g() {}.constructor;
function wrapForGenerators(f) {
    // Given a generator `test`, return a plain-old-Node-style asynchronous
    // function that takes a callback argument.
    function toNodeStyle(test) {
        return function (done) {
            var gen = test();
            function pump(method, value) {
                var result;
                try {
                    // Resume the generator wherever we left off.
                    // It may yield, throw, or return.
                    result = gen[method](value);
                } catch (exc) {
                    // It threw.
                    return done(exc, undefined);
                }

                if (result.done) {
                    // It returned.
                    return done(undefined, result.value);
                } else {
                    // It yielded a promise. We'll wait for that promise to
                    // resolve before proceeding.
                    result.value.then(function (value) {
                        // The promise is resolved. Pass the resulting value to gen.next.
                        pump('next', value);
                    }, function (exc) {
                        // The promise was rejected! Pass the exception to the
                        // generator too; it may catch it.
                        pump('throw', value);
                    });
                }
            }

            // Start the generator by calling gen.next(undefined).
            pump('next', undefined);
        };
    }

    // Return a wrapped-for-generators function to use as a replacement for f.
    // Remember, f is one of the Mocha testing functions, like `it`.
    return function () {
        // This function will behave exactly like f (note the f.apply call at
        // the end) except if the last argument is a generator.
        var test = arguments[arguments.length - 1];
        if (test instanceof Generator) {
            // f doesn't understand generators. Convert `test` to something f
            // will understand: a plain old Node-style asynchronous function.
            arguments[arguments.length - 1] = toNodeStyle(test);
        }
        return f.apply(this, arguments);
    };
}
it = wrapForGenerators(it);
before = wrapForGenerators(before);


// ## Actual tests (!)

describe("prisoner", function () {
    var r = robots.byName;

    before(function* () {
        yield robots.startAll(true);
        for (var name in robots.byName) {
            addControlsToSocket(robots.byName[name].socket, "robot-" + name);
        }
    });

    describe("robots", function () {
        function match(combatants) {
            var names = combatants.split("-");
            it("should be able to match " + names[0] + " with " + names[1], function* () {
                var a = r[names[0]], b = r[names[1]];
                var game = yield playOneGame(a, b);
                assert.deepEqual(game.scores, playLocally(a, b));
            });
        }

        match("greg-steve");
        match("steve-greg");
        match("steve-walter");
        match("cotton-skier");
        match("skier-walter");

        it("should be able to play several games at once", function* () {
            // I choose walter because he is stateful; one of the things we're
            // testing here is that the games are properly independent.
            var me = r.walter;
            var them = [r.cotton, r.greg, r.steve, r.skier];
            var games = yield Promise.all(playGamesWith(me, them));
            them.forEach(function (opp, i) {
                assert.deepEqual(games[i].scores, playLocally(me, opp));
            });
        });

        it("should be able to play many games with the same opponent all at once", function* () {
            var N = 12;
            var games = [];
            for (var i = 0; i < N; i++) {
                games[i] = playOneGame(r.cotton, r.skier);
            }
            var games = yield Promise.all(games);
            assert.strictEqual(games.length, N);
            var expected = playLocally(r.cotton, r.skier);
            games.forEach(function (game) {
                assert.deepEqual(game.scores, expected);
            });
        });
    });

    describe("server", function () {
        var PENGUIN_LIFE = 37;

        it("should force any player making an invalid move to forfeit", function* () {
            // Anything other than COOPERATE or DEFECT is of course invalid.
            var game = yield playOneGame(r.steve, r.penguin);
            assert.deepEqual(game.scores, [5 * NROUNDS, 0]);

            assert(NROUNDS > PENGUIN_LIFE); // the score calculation below would be wrong otherwise
            game = yield playOneGame(r.greg, r.penguin);
            assert.deepEqual(game.scores, [
                3 * PENGUIN_LIFE + 5 * (NROUNDS - PENGUIN_LIFE),
                3 * PENGUIN_LIFE
            ]);
        });

        it("should be able to run a tournament", function* () {
            var players = [r.steve, r.greg, r.walter, r.skier, r.cotton, r.penguin];
            var results = yield tournament(players);
            var expected = [1756, 1311, 1602, 1400, 1055, 429];
            assert.strictEqual(players.length, results.length);
            players.forEach(function (bot, i) {
                assert.strictEqual(results[i].user_id, bot.id);
                assert.strictEqual(results[i].score, expected[i]);
            });
        });

        it("should immediately force a disconnected player to forfeit", function* () {
            var KILL_ROUND = 11;
            assert(NROUNDS > KILL_ROUND);

            var failTimeout;
            var game = playNow(r.greg, [r.steve])[0];
            game.observe(function (msg) {
                if (msg.current_round == KILL_ROUND) {
                    r.steve.socket.disconnect();

                    // Start the clock. The server should make steve forfeit
                    // the game within the next 200msec.
                    failTimeout = setTimeout(function () {
                        throw new Error("200msec elapsed and the server has not ended the game.");
                    }, 200);
                }
            });

            // Now wait for the game to end.
            yield game.done;

            clearTimeout(failTimeout);

            // The order of packet delivery is nondeterministic, so we
            // can't assert the exact score.  But not too many rounds
            // should have been permitted to happen after KILL_ROUND. Let's
            // say at most one more.
            var s0 = game.scores[0],  // greg
            s1 = game.scores[1];  // steve
            assert(s0 <= (NROUNDS - KILL_ROUND) * 5);
            assert(s0 >= (NROUNDS - (KILL_ROUND + 1)) * 5);
            assert(s1 >= KILL_ROUND * 5);
            assert(s1 <= (KILL_ROUND + 1) * 5);
        });
    });
});
