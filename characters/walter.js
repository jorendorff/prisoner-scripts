// name: Angry Walter
// picture: http://i0.kym-cdn.com/photos/images/original/000/350/763/10e.jpg

function* main() {
    var holdingItTogether = 2;
    while (holdingItTogether) {
        var otherPlayerMove = yield COOPERATE;
        if (otherPlayerMove !== COOPERATE) {
            holdingItTogether--;  // are you kidding me?
        }
    }

    // AM I THE ONLY ONE AROUND HERE
    // THAT KNOWS HOW TO WORK AS A TEAM?!
    while (true) {
        yield DEFECT;
    }
}
