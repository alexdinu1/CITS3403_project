let board1;
      let game = new Chess(); // Use chess.js to manage game state
      let selectedSquare = null;
      let boardOrientation = 'white'; // Default
      let moveValidationEnabled = false; // Flag to enable/disable move validation

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
      }

      function onSquareClick(square) {
        if (moveValidationEnabled) {
          // Move validation logic
          const moves = game.moves({ square, verbose: true });

          // If no piece selected yet or clicked own piece
          if (!selectedSquare) {
            if (moves.length === 0) return; // No moves = not a valid piece
            selectedSquare = square;
            highlightSquares(square, moves.map(m => m.to));
          } else {
            // Try move
            const move = game.move({ from: selectedSquare, to: square });
            if (move === null) {
              // Invalid move, reset selection
              selectedSquare = null;
              removeHighlights();
              return;
            }

            board1.position(game.fen());
            selectedSquare = null;
            removeHighlights();
          }
        } else {
          // Unrestricted movement logic
          if (!selectedSquare) {
            selectedSquare = square;
            highlightSelectedSquare(square); // Highlight the selected square
          } else {
            // Move the piece to the clicked square (even outside the board)
            const piece = game.get(selectedSquare);
            if (piece) {
              game.remove(selectedSquare); // Remove the piece from the original square
              game.put(piece, square); // Place the piece on the new square
            }
            board1.position(game.fen());
            selectedSquare = null;
            removeHighlights(); // Clear highlights after the move
          }
        }
      }

      function highlightSelectedSquare(square) {
        removeHighlights(); // Clear previous highlights
        $(`#board1 .square-${square}`).addClass('highlight1-32417'); // Highlight the selected square
      }

      // Highlight helper
      function highlightSquares(from, toSquares) {
        removeHighlights();

        // Highlight the selected square with the yellowish outline
        $(`#board1 .square-${from}`).addClass('highlight1-32417');

        // Add a circle to valid move squares
        toSquares.forEach(square => {
          const targetSquare = $(`#board1 .square-${square}`);
          const piece = game.get(square); // Check if there's a piece on the target square

          if (piece) {
            // If a piece can be captured, use the capture circle style
            targetSquare.append('<div class="valid-move-circle valid-move-circle-capture"></div>');
          } else {
            // Otherwise, use the normal circle style
            targetSquare.append('<div class="valid-move-circle"></div>');
          }
        });
      }

      function removeHighlights() {
        // Remove the yellowish outline
        $('#board1 .square-55d63').removeClass('highlight1-32417');

        // Remove all valid move circles
        $('#board1 .valid-move-circle').remove();
      }

      // Buttons
      $('#playWhite').click(() => initializeBoard('white'));
      $('#playBlack').click(() => initializeBoard('black'));

      $('#reset').click(() => {
        game.reset();
        board1.start();
        selectedSquare = null;
        removeHighlights();
        moveValidationEnabled = false; // Disable move validation on reset
      });

      $('#playGame').click(() => {
        $('.column button').fadeOut();
        $('#board1').parent().animate({ marginTop: '-10vh' }, 500);
        $('#playGame').fadeOut(() => {
          $('#playGame').replaceWith(`
            <div id="difficultyButtons">
              <button class="btn btn-success fs-5 m-1" onclick="startGame('easy')">Easy</button>
              <button class="btn btn-warning fs-5 m-1" onclick="startGame('medium')">Medium</button>
              <button class="btn btn-danger fs-5 m-1" onclick="startGame('hard')">Hard</button>
            </div>
          `);
        });
      });

      function startGame(difficulty) {
        moveValidationEnabled = true; // Enable move validation
        console.log(`Game started with difficulty: ${difficulty}`);
        $('#difficultyButtons').fadeOut();
      }

      // Detect clicks outside the board
    $(document).on('click', function (e) {
        const isInsideBoard = $(e.target).closest('#board1').length > 0;
    
        // Only if move validation is OFF and a piece is selected
        if (!isInsideBoard && !moveValidationEnabled && selectedSquare) {
        const piece = game.get(selectedSquare);
        if (piece) {
            game.remove(selectedSquare); // Kick the piece off
            board1.position(game.fen());
        }
        selectedSquare = null;
        removeHighlights();
        }
    });

      // Initialize on page load
      initializeBoard('white');