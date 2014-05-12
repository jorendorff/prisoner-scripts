// name: Foul Bachelor Frog
// picture: http://i1.kym-cdn.com/photos/images/original/000/214/831/11909748.jpg

function sleep(seconds) {
    return new Promise(function (resolve, reject) {
        setTimeout(resolve, seconds * 1000);
    });
}

function* main() {
    for (var i = 0; ; i++) {
        yield sleep(i);
        yield DEFECT;
    }
}
