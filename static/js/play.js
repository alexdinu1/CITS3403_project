let board1;
let game = new Chess(); // Use chess.js to manage game state
let selectedSquare = null;
let boardOrientation = "white"; // Default
let moveValidationEnabled = false; // Flag to enable/disable move validation
let selectedDifficulty = "medium"; // Default difficulty
let playPressed = false; // Flag to check if the play button was pressed
let aiMoveRequestId = 0;

let moveHistory = []; // Track the history of FEN positions
let currentMoveIndex = 0; // Track the current position in the history
let moveRecordingQueue = [];
let isProcessingQueue = [];
let pendingMoves = [];

// Initialize board with custom click-to-move interaction
function initializeBoard(orientation) {
  boardOrientation = orientation;
  game.reset(); // Reset game state
  selectedSquare = null;

  // Reset move history when board initializes
  moveHistory = [game.fen()];
  currentMoveIndex = 0;

  board1 = ChessBoard("board1", {
    position: "start",
    draggable: false, // Disable dragging
    orientation: orientation,
    pieceTheme: "/static/img/chesspieces/wikipedia/{piece}.png", // Optional: your theme path
    moveSpeed: 400, // Enable smooth animations
  });

  // Bind click events to squares
  $("#board1 .square-55d63")
    .off("click")
    .on("click", function () {
      const square = $(this).data("square"); // Get the square from the clicked element
      onSquareClick(square);
    });

  $(window).resize(() => board1.resize());

  console.log(`Board initialized with orientation: ${orientation}`);
}

async function getUserData() {
  try {
    const storedUserData = localStorage.getItem("user");
    if (storedUserData) {
      const userData = JSON.parse(storedUserData);
      if (userData && (userData.user_id || userData.id)) {
        // If we have valid user data in localStorage, use it
        console.log(userData);
        return userData;
      }
    }

    // If no valid localStorage data, try to get from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get("user_id");

    if (userId) {
      // We have user ID in URL parameters
      const userResponse = await fetch(`/api/current_user/${userId}`);
      if (userResponse.ok) {
        const userData = await userResponse.json();
        // Save to localStorage for future use
        localStorage.setItem("user", JSON.stringify(userData));
        return userData;
      }
    }

    // If no URL parameter or it failed, try to get from session endpoint
    const response = await fetch("/api/current_user");
    if (!response.ok) {
      console.error("Not logged in or session expired");
      return null;
    }

    const userData = await response.json();
    // Save to localStorage for future use
    localStorage.setItem("user", JSON.stringify(userData));
    return userData;
  } catch (error) {
    console.error("Error getting user data:", error);
    // If there was an error, clear localStorage to be safe
    localStorage.removeItem("user");
    return null;
  }
}

async function getAIMove(fen) {
  console.log("Sending FEN to Stockfish:", fen);
  console.log("Selected difficulty:", selectedDifficulty);
  try {
    const response = await fetch("/get_ai_move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, difficulty: selectedDifficulty }),
    });

    const data = await response.json();
    if (data.error) {
      console.error("Error received from Stockfish:", data.error);
      return null;
    }

    console.log(
      "Stockfish move received:",
      data.move,
      "Evaluation:",
      data.evaluation
    );
    console.log("AI Response Evaluation:", data.evaluation);
    return { move: data.move, evaluation: data.evaluation };
  } catch (error) {
    console.error("Error fetching AI move:", error);
    return null;
  }
}

async function getEvaluation(fen) {
  try {
    const response = await fetch("/get_evaluation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, difficulty: selectedDifficulty }),
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
    $("#scoreText").text("Evaluation: Not available");
    return;
  }

  let scoreDisplay = "";
  if (evaluation === 10000) {
    scoreDisplay = "Mate in N (AI is winning)";
  } else if (evaluation === -10000) {
    scoreDisplay = "Mate in N (You are winning)";
  } else {
    const scoreInPawns = (evaluation / 100).toFixed(2);
    if (boardOrientation === "white") {
      scoreDisplay = `Evaluation: ${scoreInPawns} pawns`;
    } else {
      scoreDisplay = `Evaluation: ${-scoreInPawns} pawns`;
    }
  }

  $("#scoreText").text(scoreDisplay);
}

async function playAIMove() {
  const fenBefore = game.fen();
  const thisRequestId = ++aiMoveRequestId; // Increment and capture current request ID
  const aiResponse = await getAIMove(fenBefore);

  // If another move has been made since this request started, ignore this response
  if (thisRequestId !== aiMoveRequestId) {
    console.log("Discarding stale AI move");
    return;
  }

  if (aiResponse && aiResponse.move) {
    const aiMove = aiResponse.move;

    setTimeout(async () => {
      // Again, double-check before applying
      if (thisRequestId !== aiMoveRequestId) return;

      const moveResult = game.move({
        from: aiMove.slice(0, 2),
        to: aiMove.slice(2, 4),
        promotion: "q",
      });

      if (moveResult === null) {
        console.error("Invalid AI move:", aiMove);
      } else {
        board1.position(game.fen());

        moveHistory = moveHistory.slice(0, currentMoveIndex + 1);
        moveHistory.push(game.fen());
        currentMoveIndex++;
        updateNavigationButtons();

        // Record the AI move
        // const userData = await getUserData();
        // if (userData && userData.current_game_id) {
        //   await recordAIMove(
        //     userData.current_game_id,
        //     aiMove,
        //     fenBefore,
        //     game.fen(),
        //     aiResponse.evaluation
        //   );
        // }

        // Check for checkmate
        if (game.in_checkmate()) {
          setTimeout(() => {
            showCheckmateOptions(); // Show the checkmate options modal
          }, 500); // Delay to ensure the move is visually updated first
        } else if (game.in_draw && game.in_draw()) {
          setTimeout(() => {
            showDrawModal(); // Show the draw modal
          }, 500);
        }
      }
    }, 1000);
  } else {
    console.error("No AI move returned.");
  }
}

function getGameResult() {
  if (game.isCheckmate()) {
    return game.turn() === "w" ? "0-1" : "1-0";
  }
  if (game.isDraw()) {
    return "1/2-1/2";
  }
  return "*";
}

async function showGameResult(result) {
  let message = "";
  try {
    // Display a saving indicator
    console.log("Attempting to save game with result:", result);

    // Call saveGame and await the response
    const saveResponse = await saveGame(
      game.pgn(),
      boardOrientation === "white" ? "Player" : "AI",
      boardOrientation === "white" ? "AI" : "Player",
      result
    );

    if (saveResponse.game_id) {
      // Trigger analysis
      const analysisResponse = await fetch(
        `/analyze_game/${saveResponse.game_id}`,
        {
          method: "POST",
        }
      );

      if (!analysisResponse.ok) {
        console.error("Analysis failed to start");
      }
    }

    // Check if there was an error in the response
    if (saveResponse.error) {
      console.error("Save game returned an error:", saveResponse.error);
      throw new Error(saveResponse.error);
    }

    // Log success information
    console.log("Game saved successfully with ID:", saveResponse.game_id);

    // Set success message
    switch (result) {
      case "1-0":
        message = "White wins! Game saved successfully.";
        break;
      case "0-1":
        message = "Black wins! Game saved successfully.";
        break;
      case "1/2-1/2":
        message = "Draw! Game saved successfully.";
        break;
      default:
        message = "Game ended and was saved successfully.";
        break;
    }

    // Show message to user
    alert(message);

    $("#viewStatsButton")(() => {
      window.location.href = "/stats";
    });
  } catch (error) {
    // Handle error
    console.error("Error in showGameResult:", error);
    alert(
      `Game ended (${result}), but there was an error saving: ${error.message}`
    );
  }
}

async function evaluatePlayerMove(fenBefore, move) {
  try {
    const response = await fetch("/evaluate_move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen_before: fenBefore, move: move }),
    });

    const data = await response.json();
    if (data.error) {
      console.error("Error evaluating move:", data.error);
      return;
    }

    // Display the score and comment
    const { score, comment } = data;
    $("#scoreText").html(
      `<span class="black-text"><b>Score:</b> ${score} – ${comment}</span>`
    );
  } catch (error) {
    console.error("Error fetching evaluation:", error);
  }
}

async function onSquareClick(square) {
  if (moveValidationEnabled) {
    const moves = game.moves({ square, verbose: true });

    if (!selectedSquare) {
      if (moves.length === 0) return;
      selectedSquare = square;
      highlightSquares(
        square,
        moves.map((m) => m.to)
      );
    } else {
      const fenBefore = game.fen(); // Save FEN before the move
      const pieceAtFrom = game.get(selectedSquare);
      const isPromotionSquare = square[1] === "8" || square[1] === "1";
      const isPawnPromotion =
        pieceAtFrom && pieceAtFrom.type === "p" && isPromotionSquare;

      if (isPawnPromotion) {
        // Validate the move
        const dryRunMove = game.move({
          from: selectedSquare,
          to: square,
          promotion: "q", // Temporary promotion for validation
        });

        if (dryRunMove === null) {
          // Invalid move, do nothing
          selectedSquare = null;
          removeHighlights();
          return;
        }

        // Revert the move after validation
        game.undo();

        // Determine the piece color based on the player's orientation
        const pieceColor = boardOrientation === "white" ? "w" : "b";

        // Update the modal images dynamically
        $("#promotionQueen").attr(
          "src",
          `/static/img/chesspieces/wikipedia/${pieceColor}Q.png`
        );
        $("#promotionRook").attr(
          "src",
          `/static/img/chesspieces/wikipedia/${pieceColor}R.png`
        );
        $("#promotionBishop").attr(
          "src",
          `/static/img/chesspieces/wikipedia/${pieceColor}B.png`
        );
        $("#promotionKnight").attr(
          "src",
          `/static/img/chesspieces/wikipedia/${pieceColor}N.png`
        );

        // Show the promotion modal
        $("#promotionModal").modal("show");

        $(".promotion-piece")
          .off("click")
          .on("click", async function () {
            const promotionPiece = $(this).data("piece"); // q, r, b, n

            const move = game.move({
              from: selectedSquare,
              to: square,
              promotion: promotionPiece,
            });

            if (move === null) {
              selectedSquare = null;
              removeHighlights();
              $("#promotionModal").modal("hide");
              return;
            }

            $("#moveText").html(
              `<span class="black-text">Moved from <b>${move.from}</b> to <b>${move.to}</b></span>`
            );
            board1.position(game.fen());
            selectedSquare = null;
            removeHighlights();

            const gameState = game.fen();
            const uciMove = move.promotion
              ? `${move.from}${move.to}${move.promotion}`
              : `${move.from}${move.to}`;
            evaluatePlayerMove(fenBefore, uciMove);
            
            // Evaluate the position after the player's move
            const evaluation = await getEvaluation(gameState);

            // Record the player move
            pendingMoves.push({
              game_id: null, // Will be set after game is saved
              move_number: Math.ceil(game.history().length / 2),
              game_state: gameState,
              score: evaluation,
              is_blunder: false,
              is_brilliant: false,
              comment: ""
            });

            moveHistory = moveHistory.slice(0, currentMoveIndex + 1);
            moveHistory.push(gameState);
            currentMoveIndex++;
            updateNavigationButtons();

            playAIMove();

            $("#promotionModal").modal("hide");
          });

        return; // Stop here, wait for modal choice
      }

      // If no promotion, normal move execution
      const move = game.move({
        from: selectedSquare,
        to: square,
      });

      if (move === null) {
        selectedSquare = null;
        removeHighlights();
        return;
      }

      $("#moveText").html(
        `<span class="black-text">Moved from <b>${move.from}</b> to <b>${move.to}</b></span>`
      );
      board1.position(game.fen());
      selectedSquare = null;
      removeHighlights();

      const gameState = game.fen();
      const uciMove = move.promotion
        ? `${move.from}${move.to}${move.promotion}`
        : `${move.from}${move.to}`;
      evaluatePlayerMove(fenBefore, uciMove);

      // Evaluate the position after the player's move
      const evaluation = await getEvaluation(gameState);

      // Record the player move
      pendingMoves.push({
        game_id: null, // Will be set after game is saved
        move_number: Math.ceil(game.history().length / 2),
        game_state: gameState,
        score: evaluation,
        is_blunder: false,
        is_brilliant: false,
        comment: ""
      });

      moveHistory = moveHistory.slice(0, currentMoveIndex + 1);
      moveHistory.push(game.fen());
      currentMoveIndex++;
      updateNavigationButtons();

      // Check for checkmate
      if (game.in_checkmate()) {
        setTimeout(() => {
          showCheckmateOptions(); // Show the checkmate options modal
        }, 500); // Delay to ensure the move is visually updated first
      } else if (game.in_draw && game.in_draw()) {
        setTimeout(() => {
          showDrawModal();
        }, 500);
      } else {
        // Trigger AI move
        playAIMove();
      }
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
  $(`#board1 .square-${square}`).addClass("highlight1-32417");
}

function highlightSquares(from, toSquares) {
  removeHighlights();
  $(`#board1 .square-${from}`).addClass("highlight1-32417");

  toSquares.forEach((square) => {
    const targetSquare = $(`#board1 .square-${square}`);
    const piece = game.get(square);

    if (piece) {
      targetSquare.append(
        '<div class="valid-move-circle valid-move-circle-capture"></div>'
      );
    } else {
      targetSquare.append('<div class="valid-move-circle"></div>');
    }
  });
}

function removeHighlights() {
  $("#board1 .square-55d63").removeClass("highlight1-32417");
  $("#board1 .valid-move-circle").remove();
}

// Top control buttons
$("#playWhite").click(() => initializeBoard("white"));
$("#playBlack").click(() => initializeBoard("black"));

$("#reset").click(() => {
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
  $(".container.text-center").html(`
        <button id="playGame" class="btn btn-success btn-lg fs-3">Play Game</button>
        <br>
        <button class="btn btn-primary fs-3 m-4" id="backButton">Back</button>
    `);

  $("#playGame").click(() => {
    playPressed = true;
    $(".column button").fadeOut();
    $("#playGame, #backButton").fadeOut(() => {
      setupDifficultyButtons();
    });

    // Hide sidebar and menu button when "Play Game" is clicked
    const sidebar = document.getElementById("mySidebar");
    const menuButton = document.querySelector(".openbtn");

    sidebar.classList.add("closed");
    menuButton.classList.add("hidden");
  });

  $(".column button").fadeIn();

  $("#backButton").click(() => {
    window.history.back();
  });
}

function setupDifficultyButtons() {
  $(".container.text-center").html(`
        <div id="difficultyButtons">
            <button class="btn btn-success fs-5 m-1" onclick="startGame('easy')">Easy</button>
            <button class="btn btn-warning fs-5 m-1" onclick="startGame('medium')">Medium</button>
            <button class="btn btn-danger fs-5 m-1" onclick="startGame('hard')">Hard</button>
            <br>
            <button class="btn btn-primary fs-5 m-4" id="backButton">Back</button>
        </div>
    `);

  $("#backButton").click(() => {
    $("#difficultyButtons").fadeOut(() => {
      $("#board1")
        .parent()
        .animate({ marginTop: "0" }, 500, () => {
          setupPlayButton();
        });
      // Show sidebar and menu button when "Back" is clicked
      const sidebar = document.getElementById("mySidebar");
      const menuButton = document.querySelector(".openbtn");

      sidebar.classList.remove("closed");
      menuButton.classList.remove("hidden");
    });
  });
}

// Call updateNavigationButtons when the game starts
async function startGame(difficulty) {
  selectedDifficulty = difficulty; // Store the selected difficulty
  moveValidationEnabled = true;
  console.log(`Game started with difficulty: ${difficulty}`);

  // Create initial PGN with just the starting position
  const initialPgn = "[Event \"Casual Game\"]\n[Site \"Chess App\"]\n[Date \"" + new Date().toISOString().split('T')[0] + "\"]\n[White \"" + (boardOrientation === "white" ? "Player" : "AI") + "\"]\n[Black \"" + (boardOrientation === "white" ? "AI" : "Player") + "\"]\n[Result \"*\"]\n\n*";

  // Save the game at the start
  // const saveResponse = await saveGame(
  //   initialPgn,
  //   boardOrientation === "white" ? "Player" : "AI",
  //   boardOrientation === "white" ? "AI" : "Player",
  //   "*" // Game in progress
  // );

  // if (saveResponse.error) {
  //   console.error("Failed to save initial game state:", saveResponse.error);
  // }

  $("#difficultyButtons").fadeOut(() => {
    // Add the Resign button after difficulty buttons disappear
    $(".container.text-center").html(`
            <div id="moveCard" class="card mt-1" style="background-color: white; max-width: 65vh; margin: auto;">
                <div class="card-body">
                    <p class="card-text fs-5" id="moveText" style="text-align: left; color: black">No moves yet.</p>
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
    $("#resignButton").fadeIn();

    // Initialize button states
    updateNavigationButtons();

    // Add click event to redirect to the stats page
    $("#resignButton").click(async () => {
      const warningMsg = "Are you sure you want to resign?\n\nThis will count as a loss for you, and this game's scores will NOT be included in the stats page.";
      const confirmation = confirm(warningMsg);

      if (confirmation) {
        const result = boardOrientation === 'white' ? '0-1' : '1-0';
        await saveGame(
          game.pgn(),
          boardOrientation === 'white' ? 'Player': 'AI',
          boardOrientation === 'white' ? 'AI' : 'Player',
          result
        );
        showResignationModal(result);
      }
    });

    // If playing as black, let Stockfish (white) make the first move
    if (boardOrientation === "black") {
      console.log("Stockfish (White) will make the first move.");
      playAIMove(); // Trigger Stockfish's first move
    }
  });
}

async function saveGame(pgn, white, black, result) {
  try {
    // Get user data from localStorage or API
    const userData = await getUserData();

    // Check if we have valid user data
    if (!userData) {
      console.error("No user data available - cannot save game");
      return { error: "User not authenticated" };
    }

    // Extract user ID - handle both user_id and id properties
    const userId = userData.user_id || userData.id;
    if (!userId) {
      console.error("User ID not found in user data");
      return { error: "Invalid user data" };
    }

    // Validate required fields before sending
    if (!pgn) {
      console.error("PGN is required but missing");
      return { error: "Missing PGN data" };
    }

    // Ensure white and black player identifiers are set
    const whiteName = white || "Player";
    const blackName = black || "AI";

    // Ensure result is valid
    const validResult = result || "*";

    console.log("Saving game with data:", {
      pgn: pgn,
      white: whiteName,
      black: blackName,
      result: validResult,
      user_id: userId,
    });

    const response = await fetch("/save_game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pgn: pgn,
        white: whiteName,
        black: blackName,
        result: validResult,
        user_id: userId,
        analyzed: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to save game");
    }

    const data = await response.json();
    console.log("Game saved successfully:", data);

    // Store the game ID in localStorage for move recording
    if (data.game_id) {
      const updatedUserData = { ...userData, current_game_id: data.game_id };
      localStorage.setItem("user", JSON.stringify(updatedUserData));
    }

      return data;
  } catch (error) {
    console.error("Error saving game:", error);
    return { error: error.message };
  }
}

async function updateGameResult(gameId, result) {
  try {
    const response = await fetch(`/update_game/${gameId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error updating game result:", error);
    return { error: error.message };
  }
}

// Helper function to update the state of the Previous and Next buttons
function updateNavigationButtons() {
  if (currentMoveIndex <= 0) {
    $("#prevMove")
      .prop("disabled", true)
      .removeClass("btn-primary")
      .addClass("btn-secondary"); // Disable and gray out Previous button
  } else {
    $("#prevMove")
      .prop("disabled", false)
      .removeClass("btn-secondary")
      .addClass("btn-primary"); // Enable and restore Previous button
  }

  if (currentMoveIndex >= moveHistory.length - 1) {
    $("#nextMove")
      .prop("disabled", true)
      .removeClass("btn-primary")
      .addClass("btn-secondary"); // Disable and gray out Next button
  } else {
    $("#nextMove")
      .prop("disabled", false)
      .removeClass("btn-secondary")
      .addClass("btn-primary"); // Enable and restore Next button
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
$(document).on("click", "#prevMove", () => {
  if (currentMoveIndex > 0) {
    currentMoveIndex--;
    const fen = moveHistory[currentMoveIndex];
    game.load(fen);
    board1.position(fen);
    console.log(`Moved back to index ${currentMoveIndex}`);
    updateNavigationButtons();

    aiMoveRequestId++; // Invalidate any in-flight AI move
  }
});
// Modify the Next button click handler
$(document).on("click", "#nextMove", () => {
  if (currentMoveIndex < moveHistory.length - 1) {
    currentMoveIndex++;
    const fen = moveHistory[currentMoveIndex];
    game.load(fen);
    board1.position(fen);
    console.log(`Moved forward to index ${currentMoveIndex}`);
    updateNavigationButtons();

    aiMoveRequestId++; // Invalidate any in-flight AI move
  }
});

// Map left and right arrow keys to Previous and Next actions
$(document).keydown((e) => {
  if (e.key === "ArrowLeft") {
    $("#prevMove").click(); // Trigger Previous button click
  } else if (e.key === "ArrowRight") {
    $("#nextMove").click(); // Trigger Next button click
  }
});

// Detect clicks outside the board
$(document).on("click", function (e) {
  const isInsideBoard = $(e.target).closest("#board1").length > 0;

  if (
    !isInsideBoard &&
    !moveValidationEnabled &&
    selectedSquare &&
    !playPressed
  ) {
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
initializeBoard("white");
setupPlayButton();

async function showCheckmateOptions() {
  // Determine the winner
  const winner = game.turn() === "w" ? "Black" : "White";
  const result = winner === 'White' ? '1-0' : '0-1';

  // Save the game only now, when it's finished
  const saveResponse = await saveGame(
    game.pgn(),
    boardOrientation === "white" ? "Player" : "AI",
    boardOrientation === "white" ? "AI" : "Player",
    result
  );

  if (saveResponse && saveResponse.game_id) {
    // Update userData with the new game_id
    const userData = await getUserData();
    if (userData) {
      userData.current_game_id = saveResponse.game_id;
      localStorage.setItem("user", JSON.stringify(userData));
    }

    // Now update all pendingMoves with the correct game_id
    pendingMoves.forEach(m => m.game_id = saveResponse.game_id);

    // Save all moves to the database
    await saveAllMoves();
  }

  $("#resignButton").replaceWith(`
      <button id="newGameButton" class="btn btn-success mt-3 fs-5">New Game</button>
      <button id="viewStatsButton" class="btn btn-secondary mt-3 fs-5">View Stats</button>
  `);

  // Create a modal dialog for checkmate options
  const modalHtml = `
        <div id="checkmateModal" class="modal" tabindex="-1" role="dialog" style="display: block; background: rgba(0, 0, 0, 0.5);">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Checkmate! ${winner} wins!</h5>
                    </div>
                    <div class="modal-footer d-flex justify-content-center gap-2">
                        <button id="reviewGameButton" class="btn btn-primary">Review Game</button>
                        <button id="newGameButton" class="btn btn-success">New Game</button>
                        <button id="viewStatsButton" class="btn btn-secondary">View Stats</button>
                    </div>
                </div>
            </div>
        </div>
    `;

  // Append the modal to the body
  $("body").append(modalHtml);

  // Add event listeners for the buttons
  $(document).on('click', '#reviewGameButton', function() {
    closeCheckmateModal(); // Close the modal
    // Do nothing, just leave the board as it is
  });

  $(document).on('click', '#playAgainButton', function() {
    location.reload(); // Refresh the page to start a new game
  });

  $(document).on('click', '#newAgainButton', function() {
    location.reload(); // Refresh the page to start a new game
  });

  $(document).on('click', "#viewStatsButton", function() {
    window.location.href = "/stats"; // Redirect to stats page
  });
}

function closeCheckmateModal() {
  $("#checkmateModal").remove(); // Remove the modal from the DOM
}

function showResignationModal(result) {
    // Determine the winner
    const winner = result === '1-0' ? 'White' : 'Black';

    // Remove the resign button and add new game/stats buttons
    $('#resignButton').replaceWith(`
        <button id="newGameButton" class="btn btn-success mt-3 fs-5">New Game</button>
        <button id="viewStatsButton" class="btn btn-secondary mt-3 fs-5">View Stats</button>
    `);

    // Create a modal dialog for resignation
    const modalHtml = `
        <div id="resignationModal" class="modal" tabindex="-1" role="dialog" style="display: block; background: rgba(0, 0, 0, 0.5);">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">You resigned. ${winner} wins!</h5>
                    </div>
                    <div class="modal-footer d-flex justify-content-center gap-2">
                        <button id="reviewGameButton" class="btn btn-primary">Review Game</button>
                        <button id="playAgainButton" class="btn btn-success">New Game</button>
                        <button id="viewStatsButton" class="btn btn-secondary">View Stats</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Append the modal to the body
    $('body').append(modalHtml);

    // Add event listeners for the buttons
    $(document).on('click', '#reviewGameButton', function() {
        closeResignationModal(); // Close the modal, leave board as is
    });

    $(document).on('click', '#playAgainButton', function() {
        location.reload(); // Refresh the page to start a new game
    });

    $(document).on('click', '#newGameButton', function() {
        location.reload(); // Refresh the page to start a new game
    });

    $(document).on('click', '#viewStatsButton', function() {
        window.location.href = '/stats'; // Redirect to stats page
    });
}

function closeResignationModal() {
    $('#resignationModal').remove(); // Remove the modal from the DOM
}

// 1. Add a function to show the draw modal, similar to checkmate/resignation
function showDrawModal() {
    // Remove the resign button and add new game/stats buttons if present
    $('#resignButton').replaceWith(`
        <button id="newGameButton" class="btn btn-success mt-3 fs-5">New Game</button>
        <button id="viewStatsButton" class="btn btn-secondary mt-3 fs-5">View Stats</button>
    `);

    // Create a modal dialog for draw
    const modalHtml = `
        <div id="drawModal" class="modal" tabindex="-1" role="dialog" style="display: block; background: rgba(0, 0, 0, 0.5);">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Draw!</h5>
                    </div>
                    <div class="modal-footer d-flex justify-content-center gap-2">
                        <button id="reviewGameButton" class="btn btn-primary">Review Game</button>
                        <button id="playAgainButton" class="btn btn-success">New Game</button>
                        <button id="viewStatsButton" class="btn btn-secondary">View Stats</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Append the modal to the body
    $('body').append(modalHtml);

    // Add event listeners for the buttons
    $(document).on('click', '#reviewGameButton', function() {
        closeDrawModal(); // Close the modal, leave board as is
    });

    $(document).on('click', '#playAgainButton', function() {
        location.reload(); // Refresh the page to start a new game
    });

    $(document).on('click', '#newGameButton', function() {
        location.reload(); // Refresh the page to start a new game
    });

    $(document).on('click', '#viewStatsButton', function() {
        window.location.href = '/stats'; // Redirect to stats page
    });
}

function closeDrawModal() {
    $('#drawModal').remove(); // Remove the modal from the DOM
}

async function recordMove(gameId, gameState, score) {
  if (!gameId) {
    console.warn("No game ID available - move recording queued for later");
    moveRecordingQueue.push(gameState);
    showRecordingStatus("warning");
    return null;
  }

  try {
    showRecordingStatus("pending");

    console.log("Recording move number:", game.history().length);

    const response = await fetch("/record_move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_id: gameId,
        move_number: Math.ceil(game.history().length / 2),
        game_state: gameState,
        score: score, // Will be updated by analysis
        is_blunder: false,
        is_brilliant: false,
        comment: ""
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to record move");
    }

    const data = await response.json();
    if (data.error) {
      console.error("Error recording move:", data.error);
      return null;
    }

    showRecordingStatus("success");
    return data;
  } catch (error) {
    console.error("Error recording move:", error);
    showRecordingStatus("error");
    return null;
  }
}

async function recordAIMove(gameId, move, fenBefore, fenAfter, evaluation) {
  try {
    const tempGame = new Chess(fenBefore);
    const moveResult = tempGame.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: move.length > 4 ? move[4] : undefined,
    });

    if (moveResult === null) {
      console.error("Invalid AI move:", move, "FEN:", fenBefore);
      return null;
    }

    const response = await fetch("/record_move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_id: gameId,
        move_number: game.history().length,
        game_state: fenAfter,
        score: evaluation || 0,
        is_blunder: false,
        is_brilliant: false,
        comment: ""
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to record AI move");
    }

    return await response.json();
  } catch (error) {
    console.error("Error recording AI move:", error);
    return null;
  }
}

function showRecordingStatus(status) {
  const moveCard = $("#moveCard");
  const statusText = $("#recordingStatus");

  // Create status element if it doesn't exist
  if (statusText.length === 0) {
    moveCard
      .find(".card-body")
      .append('<p id="recordingStatus" class="card-text fs-6"></p>');
  }

  // Update status message and styling
  const statusElement = $("#recordingStatus");
  switch (status) {
    case "pending":
      statusElement.text("Recording move...").css("color", "#f0ad4e");
      break;
    case "success":
      statusElement.text("Move recorded").css("color", "#5cb85c");
      // Clear success message after a short delay
      setTimeout(() => statusElement.text(""), 2000);
      break;
    case "error":
      statusElement.text("Failed to record move").css("color", "#d9534f");
      break;
    case "warning":
      statusElement.text("Move queued for recording").css("color", "#f0ad4e");
      break;
    default:
      statusElement.text("");
  }
}

async function saveAllMoves() {
  if (pendingMoves.length === 0) return;
  try {
    const response = await fetch('/api/record_moves_batch', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({moves: pendingMoves})
    });
    if (!response.ok) throw new Error('Failed to save moves');
    pendingMoves = [];
  } catch (error) {
    console.error('Error saving moves:', error);
  }
}