// name: Angry Walter
// picture: http://i0.kym-cdn.com/photos/images/original/000/350/763/10e.jpg

function* main() {
    var holdingItTogether = true;
    while (holdingItTogether) {
        var otherPlayerMove = yield COOPERATE;
        if (otherPlayerMove !== COOPERATE)
            holdingItTogether = false;
    }

    // AM I THE ONLY ONE AROUND HERE
    while (true)
        yield DEFECT;
}
