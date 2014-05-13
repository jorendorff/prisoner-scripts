'use strict';

require('./robots').startAll().then(function () {
    console.info("Startup complete. All robots are connected and ready to play.");
});
