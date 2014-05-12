// name: Insanity Wolf
// picture: https://i.chzbgr.com/maxW500/7936340480/h79D42825/

function* main() {
    // Favourite cocktail?
    for (var i = 0; i < 100; i++) {
        // MOLOTOV
        yield Math.random() > i / 100 ? COOPERATE : DEFECT;
    }
}
