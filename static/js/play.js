let board1;
let game = new Chess(); // Use chess.js to manage game state
let selectedSquare = null;
let boardOrientation = 'white'; // Default
let moveValidationEnabled = false; // Flag to enable/disable move validation
let selectedDifficulty = 'medium'; // Default difficulty

// Initialize board with custom click-to-move interaction
function initializeBoard(orientation) {
    boardOrientation = orientation;
    game.reset(); // Reset game state
    selectedSquare = null;

    board1 = ChessBoard('board1', {
        position: 'start',
        draggable: false, // Disable dragging
        orientation: orientation,
        pieceTheme: '/static/img/chesspieces/wikipedia/{piece}.png', // Optional: your theme path
    });

    // Bind click events to squares
    $('#board1 .square-55d63').off('click').on('click', function () {
        const square = $(this).data('square'); // Get the square from the clicked element
        onSquareClick(square);
    });

    $(window).resize(() => board1.resize());

    console.log(`Board initialized with orientation: ${orientation}`);
}

async function getAIMove(fen) {
    console.log("Sending FEN to Stockfish:", fen); // Log the FEN being sent to the backend
    console.log("Selected difficulty:", selectedDifficulty); // Log the selected difficulty
    try {
        const response = await fetch('/get_ai_move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, difficulty: selectedDifficulty }) // Include difficulty
        });

        const data = await response.json();
        if (data.error) {
            console.error("Error received from Stockfish:", data.error); // Log any errors from Stockfish
            return null;
        }

        console.log("Stockfish move received:", data.move); // Log the move received from Stockfish
        return data.move; // AI's move in UCI format
    } catch (error) {
        console.error("Error fetching AI move:", error); // Log any network or fetch errors
        return null;
    }
}

async function playAIMove() {
    const fenBefore = game.fen(); // Save FEN for debugging
    const aiMove = await getAIMove(fenBefore);

    console.log("Current FEN:", fenBefore);
    console.log("AI Move (UCI):", aiMove);

    if (aiMove) {
        console.log("AI Move (UCI):", aiMove);

        // Add a delay before applying the AI move
        setTimeout(() => {
            const moveResult = game.move({
                from: aiMove.slice(0, 2),
                to: aiMove.slice(2, 4),
                promotion: 'q' // Always promote to queen by default
            });

            if (moveResult === null) {
                console.error("Invalid AI move:", aiMove);
            } else {
                console.log("Move applied:", moveResult);
                board1.position(game.fen());
                console.log("Board updated after AI move.");
            }
        }, 1000); // Delay of 1000ms (1 second)
    } else {
        console.error("No AI move returned.");
    }
}


function onSquareClick(square) {
    if (moveValidationEnabled) {
        const moves = game.moves({ square, verbose: true });

        if (!selectedSquare) {
            if (moves.length === 0) return;
            selectedSquare = square;
            highlightSquares(square, moves.map(m => m.to));
        } else {
            const move = game.move({ from: selectedSquare, to: square });
            if (move === null) {
                selectedSquare = null;
                removeHighlights();
                return;
            }

            board1.position(game.fen());
            selectedSquare = null;
            removeHighlights();

            // Trigger AI move after player's move
            playAIMove();
        }
    } else {
        if (!selectedSquare) {
            selectedSquare = square;
            highlightSelectedSquare(square);
        } else {
            const piece = game.get(selectedSquare);
            if (piece) {
                game.remove(selectedSquare);
                game.put(piece, square);
            }
            board1.position(game.fen());
            selectedSquare = null;
            removeHighlights();
        }
    }
}

function highlightSelectedSquare(square) {
    removeHighlights();
    $(`#board1 .square-${square}`).addClass('highlight1-32417');
}

function highlightSquares(from, toSquares) {
    removeHighlights();
    $(`#board1 .square-${from}`).addClass('highlight1-32417');

    toSquares.forEach(square => {
        const targetSquare = $(`#board1 .square-${square}`);
        const piece = game.get(square);

        if (piece) {
            targetSquare.append('<div class="valid-move-circle valid-move-circle-capture"></div>');
        } else {
            targetSquare.append('<div class="valid-move-circle"></div>');
        }
    });
}

function removeHighlights() {
    $('#board1 .square-55d63').removeClass('highlight1-32417');
    $('#board1 .valid-move-circle').remove();
}

// Top control buttons
$('#playWhite').click(() => initializeBoard('white'));
$('#playBlack').click(() => initializeBoard('black'));

$('#reset').click(() => {
    game.reset();
    board1.start();
    selectedSquare = null;
    removeHighlights();
    moveValidationEnabled = false;
});

// Main game flow

function setupPlayButton() {
    $('.container.text-center').html(`
        <button id="playGame" class="btn btn-success btn-lg fs-3">Play Game</button>
    `);

    $('#playGame').click(() => {
        $('.column button').fadeOut();
        $('#board1').parent().animate({ marginTop: '-10vh' }, 500);
        $('#playGame').fadeOut(() => {
            setupDifficultyButtons();
        });
    });

    $('.column button').fadeIn();
}

function setupDifficultyButtons() {
    $('.container.text-center').html(`
        <div id="difficultyButtons">
            <button class="btn btn-success fs-5 m-1" onclick="startGame('easy')">Easy</button>
            <button class="btn btn-warning fs-5 m-1" onclick="startGame('medium')">Medium</button>
            <button class="btn btn-danger fs-5 m-1" onclick="startGame('hard')">Hard</button>
            <br>
            <button class="btn btn-primary fs-5 m-4" id="backButton">Back</button>
        </div>
    `);

    $('#backButton').click(() => {
        $('#difficultyButtons').fadeOut(() => {
            $('#board1').parent().animate({ marginTop: '0' }, 500, () => {
                setupPlayButton();
            });
        });
    });
}

function startGame(difficulty) {
    selectedDifficulty = difficulty; // Store the selected difficulty
    moveValidationEnabled = true;
    console.log(`Game started with difficulty: ${difficulty}`);

    $('#difficultyButtons').fadeOut(() => {
        // Add the Resign button after difficulty buttons disappear
        $('.container.text-center').html(`
            <button id="resignButton" class="btn btn-danger btn-lg mt-3 fs-5">
                <i class="bi bi-flag-fill"></i> Resign
            </button>
        `);

        // Fade in the Resign button
        $('#resignButton').fadeIn();

        // Add click event to redirect to the stats page
        $('#resignButton').click(() => {
            window.location.href = '/stats'; // Redirect to the stats page
        });

        // If playing as black, let Stockfish (white) make the first move
        if (boardOrientation === 'black') {
            console.log("Stockfish (White) will make the first move.");
            playAIMove(); // Trigger Stockfish's first move
        }
    });
}

// Detect clicks outside the board
$(document).on('click', function (e) {
    const isInsideBoard = $(e.target).closest('#board1').length > 0;

    if (!isInsideBoard && !moveValidationEnabled && selectedSquare) {
        const piece = game.get(selectedSquare);
        if (piece) {
            game.remove(selectedSquare);
            board1.position(game.fen());
        }
        selectedSquare = null;
        removeHighlights();
    }
});

// Initialize on page load
initializeBoard('white');
setupPlayButton();