// name: Socially Awkward Penguin
// picture: http://i0.kym-cdn.com/photos/images/small/000/003/228/GetThumbnalilImage.jpg?1244360627

// The typo below, "DEFUNCT" for "DEFECT", causes Socially Awkward Penguin to
// forfeit every match he plays. Poor guy.
function* main() {
    for (var i = 0; ; i++) {
        if (i !== 37)
            yield 'COOPERATE';   // "enjoy your meal"
        else
            yield 'DEFUNCT';     // "you too"
    }
}
