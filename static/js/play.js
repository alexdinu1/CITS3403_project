let board1;
let game = new Chess(); // Use chess.js to manage game state
let selectedSquare = null;
let boardOrientation = 'white'; // Default
let moveValidationEnabled = false; // Flag to enable/disable move validation
let selectedDifficulty = 'medium'; // Default difficulty
let playPressed = false; // Flag to check if the play button was pressed

let moveHistory = []; // Track the history of FEN positions
let currentMoveIndex = 0; // Track the current position in the history

// Initialize board with custom click-to-move interaction
function initializeBoard(orientation) {
    boardOrientation = orientation;
    game.reset(); // Reset game state
    selectedSquare = null;

    // Reset move history when board initializes
    moveHistory = [game.fen()];
    currentMoveIndex = 0;

    board1 = ChessBoard('board1', {
        position: 'start',
        draggable: false, // Disable dragging
        orientation: orientation,
        pieceTheme: '/static/img/chesspieces/wikipedia/{piece}.png', // Optional: your theme path
        moveSpeed: 400, // Enable smooth animations
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
                board1.position(game.fen()); // Animate to new position
                console.log("Board updated after AI move.");

                // Record the new position in the history
                moveHistory = moveHistory.slice(0, currentMoveIndex + 1); // Trim forward history
                moveHistory.push(game.fen());
                currentMoveIndex++;
                updateNavigationButtons(); // Update button states
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

            board1.position(game.fen()); // Animate to new position
            selectedSquare = null;
            removeHighlights();

            // Record the new position in the history
            moveHistory = moveHistory.slice(0, currentMoveIndex + 1);
            moveHistory.push(game.fen());
            currentMoveIndex++;
            updateNavigationButtons(); // Update button states

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

    // Reset move history
    moveHistory = [game.fen()];
    currentMoveIndex = 0;
});

// Main game flow

function setupPlayButton() {
    $('.container.text-center').html(`
        <button id="playGame" class="btn btn-success btn-lg fs-3">Play Game</button>
        <br>
        <button class="btn btn-primary fs-5 m-4" id="backButton">Back</button>
    `);

    $('#playGame').click(() => {
        playPressed = true;
        $('.column button').fadeOut();
        $('#board1').parent().animate({ marginTop: '-10vh' }, 500);
        $('#playGame, #backButton').fadeOut(() => {
            setupDifficultyButtons();
        });
    });

    $('.column button').fadeIn();

    $('#backButton').click(() => {
        window.history.back();
    });
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

// Call updateNavigationButtons when the game starts
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

            <button id="prevMove" class="btn btn-primary fs-5 ms-5 mt-3">
            <i class="bi bi-arrow-left-square-fill me-1"></i> Previous
            </button>

            <button id="nextMove" class="btn btn-primary fs-5 ms-2 mt-3">
            Next <i class="bi bi-arrow-right-square-fill ms-1"></i>
            </button>
        `);

        // Fade in the Resign button
        $('#resignButton').fadeIn();

        // Initialize button states
        updateNavigationButtons();

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

// Helper function to update the state of the Previous and Next buttons
function updateNavigationButtons() {
    if (currentMoveIndex <= 0) {
        $('#prevMove').prop('disabled', true).removeClass('btn-primary').addClass('btn-secondary'); // Disable and gray out Previous button
    } else {
        $('#prevMove').prop('disabled', false).removeClass('btn-secondary').addClass('btn-primary'); // Enable and restore Previous button
    }

    if (currentMoveIndex >= moveHistory.length - 1) {
        $('#nextMove').prop('disabled', true).removeClass('btn-primary').addClass('btn-secondary'); // Disable and gray out Next button
    } else {
        $('#nextMove').prop('disabled', false).removeClass('btn-secondary').addClass('btn-primary'); // Enable and restore Next button
    }
}

// Update the button states after every move
function updateMoveHistory(fen) {
    moveHistory = moveHistory.slice(0, currentMoveIndex + 1); // Trim forward history
    moveHistory.push(fen); // Add the new FEN
    currentMoveIndex = moveHistory.length - 1; // Update the current index
    updateNavigationButtons(); // Update button states
}

// Modify the Previous button click handler
$(document).on('click', '#prevMove', () => {
    if (currentMoveIndex > 0) {
        currentMoveIndex--;
        const fen = moveHistory[currentMoveIndex];
        board1.position(fen); // Animate back
        console.log(`Moved back to index ${currentMoveIndex}`);
        updateNavigationButtons(); // Update button states
    }
});

// Modify the Next button click handler
$(document).on('click', '#nextMove', () => {
    if (currentMoveIndex < moveHistory.length - 1) {
        currentMoveIndex++;
        const fen = moveHistory[currentMoveIndex];
        board1.position(fen); // Animate forward
        console.log(`Moved forward to index ${currentMoveIndex}`);
        updateNavigationButtons(); // Update button states
    }
});

// Map left and right arrow keys to Previous and Next actions
$(document).keydown((e) => {
    if (e.key === 'ArrowLeft') {
        $('#prevMove').click(); // Trigger Previous button click
    } else if (e.key === 'ArrowRight') {
        $('#nextMove').click(); // Trigger Next button click
    }
});

// Detect clicks outside the board
$(document).on('click', function (e) {
    const isInsideBoard = $(e.target).closest('#board1').length > 0;

    if (!isInsideBoard && !moveValidationEnabled && selectedSquare && !playPressed) {
        // If clicked outside the board and not in move validation mode, remove the piece
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