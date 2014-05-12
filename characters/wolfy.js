// name: Insanity Wolf
// picture: https://i.chzbgr.com/maxW500/7936340480/h79D42825/

function* main() {
    for (var i = 0; i < 80; i++) {
        yield COOPERATE;
    }

    // Favourite cocktail?
    while (true) {
        // MOLOTOV
        yield Math.random() > .5 ? COOPERATE : DEFECT;
    }
}
