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
    console.log("Sending FEN to Stockfish:", fen);
    console.log("Selected difficulty:", selectedDifficulty);
    try {
        const response = await fetch('/get_ai_move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, difficulty: selectedDifficulty })
        });

        const data = await response.json();
        if (data.error) {
            console.error("Error received from Stockfish:", data.error);
            return null;
        }

        console.log("Stockfish move received:", data.move, "Evaluation:", data.evaluation);
        console.log("AI Response Evaluation:", data.evaluation);
        return { move: data.move, evaluation: data.evaluation };
    } catch (error) {
        console.error("Error fetching AI move:", error);
        return null;
    }
}

async function getEvaluation(fen) {
    try {
        const response = await fetch('/get_evaluation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, difficulty: selectedDifficulty })
        });

        const data = await response.json();
        if (data.error) {
            console.error("Error received from evaluation:", data.error);
            return null;
        }

        return data.evaluation;
    } catch (error) {
        console.error("Error fetching evaluation:", error);
        return null;
    }
}

function updateScoreText(evaluation) {
    if (isNaN(evaluation) || evaluation === null || evaluation === undefined) {
        $('#scoreText').text('Evaluation: Not available');
        return;
    }

    let scoreDisplay = '';
    if (evaluation === 10000) {
        scoreDisplay = 'Mate in N (AI is winning)';
    } else if (evaluation === -10000) {
        scoreDisplay = 'Mate in N (You are winning)';
    } else {
        const scoreInPawns = (evaluation / 100).toFixed(2);
        if (boardOrientation === 'white') {
            scoreDisplay = `Evaluation: ${scoreInPawns} pawns`;
        }
        else {
            scoreDisplay = `Evaluation: ${-scoreInPawns} pawns`;
        }
    }

    $('#scoreText').text(scoreDisplay);
}

async function playAIMove() {
    const fenBefore = game.fen();
    const aiResponse = await getAIMove(fenBefore);

    if (aiResponse && aiResponse.move) {
        const aiMove = aiResponse.move;

        setTimeout(() => {
            const moveResult = game.move({
                from: aiMove.slice(0, 2),
                to: aiMove.slice(2, 4),
                promotion: 'q'
            });

            if (moveResult === null) {
                console.error("Invalid AI move:", aiMove);
            } else {
                board1.position(game.fen());

                moveHistory = moveHistory.slice(0, currentMoveIndex + 1);
                moveHistory.push(game.fen());
                currentMoveIndex++;
                updateNavigationButtons();

            }
        }, 1000);
    } else {
        console.error("No AI move returned.");
    }
}

function getGameResult() {
    if (game.isCheckmate()) {
        return game.turn() === 'w' ? '0-1' : '1-0';
    }
    if (game.isDraw()) {
        return '1/2-1/2';
    }
    return '*';
}

function showGameResult(result) {
    let message = "";
    switch(result) {
        case '1-0': message = "White wins!"; break;
        case '0-1': message = "Black wins!"; break;
        case '1/2-1/2': message = "Draw!"; break;
        default: message = "Game ended"; break;
    }
    
    alert(message);
}

async function evaluatePlayerMove(fenBefore, fenAfter) {
    try {
        const response = await fetch('/evaluate_move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen_before: fenBefore, fen_after: fenAfter })
        });

        const data = await response.json();
        if (data.error) {
            console.error("Error evaluating move:", data.error);
            return;
        }

        // Display the score and feedback
        const { cpl, score, feedback } = data;
        $('#scoreText').html(`<b>Score:</b> ${score} – ${feedback}`);
    } catch (error) {
        console.error("Error fetching evaluation:", error);
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
            const fenBefore = game.fen(); // Save FEN before the move
            const pieceAtFrom = game.get(selectedSquare);
            const isPromotionSquare = (square[1] === '8' || square[1] === '1');
            const isPawnPromotion = pieceAtFrom && pieceAtFrom.type === 'p' && isPromotionSquare;

            if (isPawnPromotion) {
                // Determine the piece color based on the player's orientation
                const pieceColor = boardOrientation === 'white' ? 'w' : 'b';

                // Update the modal images dynamically
                $('#promotionQueen').attr('src', `/static/img/chesspieces/wikipedia/${pieceColor}Q.png`);
                $('#promotionRook').attr('src', `/static/img/chesspieces/wikipedia/${pieceColor}R.png`);
                $('#promotionBishop').attr('src', `/static/img/chesspieces/wikipedia/${pieceColor}B.png`);
                $('#promotionKnight').attr('src', `/static/img/chesspieces/wikipedia/${pieceColor}N.png`);
 

                // Move execution happens INSIDE modal click handler
                $('#promotionModal').modal('show');

                $('.promotion-piece').off('click').on('click', function () {
                    const promotionPiece = $(this).data('piece'); // q, r, b, n

                    const move = game.move({
                        from: selectedSquare,
                        to: square,
                        promotion: promotionPiece
                    });

                    if (move === null) {
                        selectedSquare = null;
                        removeHighlights();
                        $('#promotionModal').modal('hide');
                        return;
                    }

                    $('#moveText').html(`Moved from <b>${move.from}</b> to <b>${move.to}</b>`);
                    board1.position(game.fen());
                    selectedSquare = null;
                    removeHighlights();

                    const fenAfter = game.fen();
                    evaluatePlayerMove(fenBefore, fenAfter);

                    moveHistory = moveHistory.slice(0, currentMoveIndex + 1);
                    moveHistory.push(game.fen());
                    currentMoveIndex++;
                    updateNavigationButtons();

                    playAIMove();

                    $('#promotionModal').modal('hide');
                });

                return; // Important: stop here, wait for modal choice
            }

            // If no promotion, normal move execution
            const move = game.move({
                from: selectedSquare,
                to: square
            });

            if (move === null) {
                selectedSquare = null;
                removeHighlights();
                return;
            }

            $('#moveText').html(`Moved from <b>${move.from}</b> to <b>${move.to}</b>`);
            board1.position(game.fen());
            selectedSquare = null;
            removeHighlights();

            const fenAfter = game.fen();
            evaluatePlayerMove(fenBefore, fenAfter);

            moveHistory = moveHistory.slice(0, currentMoveIndex + 1);
            moveHistory.push(game.fen());
            currentMoveIndex++;
            updateNavigationButtons();

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
        <button class="btn btn-primary fs-3 m-4" id="backButton">Back</button>
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
            <div id="moveCard" class="card mt-1" style="background-color: white; max-width: 65vh; margin: auto;">
                <div class="card-body">
                    <p class="card-text fs-5" id="moveText" style="text-align: left;">No moves yet.</p>
                    <p class="card-text fs-5" id="scoreText" style="text-align: left;"></p>
                </div>
            </div>

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
        $('#resignButton').click(async () => {
            const result = boardOrientation === 'white' ? '0-1' : '1-0';
            const confirmation = confirm(`Are you sure you want to resign? This will count as a ${result === '1-0' ? 'win' : 'loss'} for the AI.`);
            
            if (confirmation) {
                await saveGame(
                    game.pgn(),
                    boardOrientation === 'white' ? "Player" : "AI",
                    boardOrientation === 'white' ? "AI" : "Player",
                    result
                );
                window.location.href = '/stats'; // Redirect to the stats page
            }
        });

        // If playing as black, let Stockfish (white) make the first move
        if (boardOrientation === 'black') {
            console.log("Stockfish (White) will make the first move.");
            playAIMove(); // Trigger Stockfish's first move
        }
    });
}

async function saveGame(pgn, white, black, result) {
    try {
        console.log("Attempting to save game:", { pgn, white, black, result });
        
        const response = await fetch('/save_game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pgn: pgn,
                white: white || "Player",  // Default values
                black: black || "AI",
                result: result || "*"      // '*' means unfinished
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || "Failed to save game");
        }

        console.log("Game saved successfully:", data);
        return data;
    } catch (error) {
        console.error("Error saving game:", error);
        // Consider showing an error message to the user
        return { error: error.message };
    }
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
        game.load(fen); // Synchronize the game state with the FEN
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
        game.load(fen);
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