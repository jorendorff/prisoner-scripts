# prisoner-scripts: Robot players for the Prisoner's Dilemma

The script in this repository connects several robot players to the [prisoners
server](https://github.com/egdelwonk/prisoners) on localhost. The robots
happily play games whenever the server tells them to.

To run the robots:

    $ node --harmony-generators run.js

To run tests:

    $ mocha --harmony-generators test.js

**You must use Node.js 0.11 or later** because this code uses ES6 generators.
As of this writing, 0.11 is still pre-release. You can download it here:
http://nodejs.org/dist/v0.11.9/
