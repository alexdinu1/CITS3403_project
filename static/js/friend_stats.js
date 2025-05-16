// Global variables
let friendId = null;
let friendUsername = null;
let chartInstances = {
  lastPlayed: null,
  average: null
};

// Main initialization function
document.addEventListener('DOMContentLoaded', initializeFriendStatsPage);

/**
 * Initialize the friend stats page
 */
async function initializeFriendStatsPage() {
    try {
        // Get friend ID from URL path
        const pathParts = window.location.pathname.split('/');
        friendId = pathParts[pathParts.length - 1];
        
        if (!friendId || isNaN(parseInt(friendId))) {
            showAlert('Invalid friend profile', 'warning');
            return;
        }

        // Get friend data
        const friendData = await fetchFriendData(friendId);
        if (!friendData) {
            showAlert('Friend data not available', 'warning');
            return;
        }

        friendUsername = friendData.username;

        // Update UI with username
        const usernameElement = document.getElementById('username');
        if (usernameElement) {
            usernameElement.textContent = friendUsername;
        }

        // Load and display stats
        await loadAndDisplayFriendStats();

    } catch (error) {
        console.error('Error initializing friend stats page:', error);
        showErrorState();
    }
}

/**
 * Fetch friend basic data
 */
async function fetchFriendData(friendId) {
    try {
        const response = await fetch(`/api/current_user/${friendId}`);
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching friend data:', error);
        return null;
    }
}

/**
 * Consolidated stats loading function
 */
async function loadAndDisplayFriendStats() {
    try {
        showLoadingStates();
        
        // Fetch player stats
        const stats = await fetchFriendStats();
        if (!stats) return;

        // Fetch game analysis if available
        let analysis = [];
        
        if (stats.last_game_id) {
          analysis = await fetchGameAnalysis(stats.last_game_id);
        }

        // Update the UI
        updateStatsDisplay(stats, analysis);
        displayPerformanceInsights(stats);
        initializeCharts(stats, analysis);

    } catch (error) {
        console.error('Error loading friend stats:', error);
        showErrorState();
    }
}

/**
 * Fetch a friend's stats
 */
async function fetchFriendStats() {
    try {
        const response = await fetch(`/api/player_stats/${friendId}`);
        if (!response.ok) {
            if (response.status === 404) {
                showAlert('Friend stats not found', 'warning');
            } else {
                throw new Error(`Failed to load friend stats: ${response.statusText}`);
            }
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching friend stats:', error);
        return null;
    }
}

/**
 * Fetch game analysis data
 */
async function fetchGameAnalysis(gameId) {
  try {
      if (!gameId) {
          console.warn("No game ID provided for analysis");
          return [];
      }

      // Show loading state
      document.getElementById('gameInsights').innerHTML = "<p>Analyzing game moves...</p>";

      const response = await fetch(`/api/game_analysis/${gameId}`);
      
      if (!response.ok) {
          throw new Error(`Failed to get analysis: ${response.status}`);
      }

      const analysis = await response.json();
      
      if (!Array.isArray(analysis)) {
          console.warn("Unexpected analysis format:", analysis);
          return [];
      }

      // Sort by move number
      analysis.sort((a, b) => a.move_number - b.move_number);
      
      return analysis;

  } catch (error) {
      console.error("Error fetching game analysis:", error);
      document.getElementById('gameInsights').innerHTML = 
          `<p>Couldn't load game analysis: ${error.message}</p>`;
      return [];
  }
}

/**
 * Update the stats display with friend data
 */
function updateStatsDisplay(stats, analysis) {
  // Fallbacks for missing data
  analysis = Array.isArray(analysis) ? analysis : [];
  stats = stats || {};

  // Find best and worst moves
  const bestMove = analysis.length > 0 
    ? analysis.reduce((best, move) => {
        if (move.is_brilliant) return move; // Prefer brilliant moves
        return move.score > best.score ? move : best;
      }, { score: -Infinity, move_number: 'N/A' })
    : { score: 'N/A', move_number: 'N/A' };
    
  const worstMove = analysis.length > 0
    ? analysis.reduce((worst, move) => {
        if (move.is_blunder) return move; // Prefer blunders
        return move.score < worst.score ? move : worst;
      }, { score: Infinity, move_number: 'N/A' })
    : { score: 'N/A', move_number: 'N/A' };

  // Helper to safely set text content
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // Best move
  setText(
    'bestMove',
    bestMove.move_number !== 'N/A'
      ? `Move ${bestMove.move_number} (${typeof bestMove.score === 'number' ? bestMove.score.toFixed(1) : bestMove.score})${bestMove.is_brilliant ? ' ★' : ''}`
      : 'N/A'
  );

  // Worst move
  setText(
    'worstMove',
    worstMove.move_number !== 'N/A'
      ? `Move ${worstMove.move_number} (${typeof worstMove.score === 'number' ? worstMove.score.toFixed(1) : worstMove.score})${worstMove.is_blunder ? ' ⚠' : ''}`
      : 'N/A'
  );

  // Last game average
  setText(
    'lastGameAvg',
    typeof stats.average_score === 'number'
      ? stats.average_score.toFixed(1)
      : 'N/A'
  );

  // Highest and lowest averages (if available)
  setText(
    'highestAvg',
    typeof stats.highest_average === 'number'
      ? stats.highest_average.toFixed(1)
      : 'N/A'
  );
  setText(
    'lowestAvg',
    typeof stats.lowest_average === 'number'
      ? stats.lowest_average.toFixed(1)
      : 'N/A'
  );

  // Player rating
  setText(
    'playerRating',
    typeof stats.rating === 'number'
      ? stats.rating
      : 'N/A'
  );

  // Update the game insights
  const insights = generateInsights(stats, analysis);
  const insightsEl = document.getElementById('gameInsights');
  if (insightsEl) {
    insightsEl.innerHTML = insights.map(i => `<p>${i}</p>`).join('');
  }
}

/**
 * Show loading states while fetching data
 */
function showLoadingStates() {
    document.getElementById('bestMove').textContent = "Loading...";
    document.getElementById('worstMove').textContent = "Loading...";
    document.getElementById('lastGameAvg').textContent = "Loading...";
    document.getElementById('highestAvg').textContent = "Loading...";
    document.getElementById('lowestAvg').textContent = "Loading...";
    document.getElementById('playerRating').textContent = "Loading...";
    document.getElementById('gameInsights').innerHTML = "<p>Loading game data...</p>";
    document.getElementById('performanceInsights').innerHTML = "<p>Calculating performance trends...</p>";
}

/**
 * Display performance insights
 */
function displayPerformanceInsights(stats) {
    const performanceInsights = generatePerformanceInsights(stats);
    document.getElementById('performanceInsights').innerHTML = 
        performanceInsights.map(i => `<p>${i}</p>`).join('');
}

/**
 * Share stats functionality
 */
async function shareStats(section) {
    if (!friendId || !friendUsername) {
        showAlert('Please wait while we load the data', 'warning');
        return;
    }

    const message = section === 'lastPlayed' 
        ? `${friendUsername}'s Last Played stats on AI Chess!` 
        : `${friendUsername}'s Average stats on AI Chess!`;

    const chartId = section === 'lastPlayed' ? 'lastPlayedChart' : 'averageChart';
    const chartElement = document.getElementById(chartId);

    // Get the text content to share
    const statsElement = document.getElementById(section === 'lastPlayed' ? 'lastPlayedStats' : 'averageStats');
    const statsContent = statsElement ? statsElement.innerText : '';

    const chartHasData = chartElement && chartElement.getContext('2d') && chartElement.getContext('2d').getImageData(0,0,chartElement.width, chartElement.height).data.some(pixel => pixel !== 0);

    if (!statsContent || !chartHasData) {
        showAlert('No stats available to share. Please play a game first!', 'warning');
        return;
    }

    // Convert chart to blob and share both image and text
    if (navigator.canShare && window.OffscreenCanvas) {
        chartElement.toBlob(async function(blob) {
            const file = new File([blob], 'stats.png', { type: 'image/png' });

            if (navigator.canShare({ files: [file], text: message + '\n\n' + statsContent })) {
                try {
                    await navigator.share({
                        title: 'AI Chess Stats',
                        text: message + '\n\n' + statsContent,
                        files: [file]
                    });
                } catch (err) {
                    console.error('Share failed:', err);
                    alert("Share functionality available on supported devices only.");
                }
            } else {
                alert("Sharing images is not supported on this device/browser.");
            }
        }, 'image/png');
    } else {
        // Fallback: share text only
        if (navigator.share) {
            navigator.share({
                title: 'AI Chess Stats',
                text: message + '\n\n' + statsContent
            }).catch(err => {
                console.error('Share failed:', err);
                alert("Share functionality available on supported devices only.");
            });
        } else {
            alert(message + " Share functionality coming soon!");
        }
    }
}

/**
 * Generate dynamic insights based on game data
 */
function generateInsights(stats, analysis) {
    const insights = [];
  
    if (!analysis || analysis.length === 0) {
        return [`${friendUsername} needs to play more games for personalized insights!`];
    }
  
    // Count blunders and brilliant moves
    const blunders = analysis.filter(move => move.is_blunder).length;
    const brilliants = analysis.filter(move => move.is_brilliant).length;
  
    if (blunders > 0) {
        insights.push(`Found ${blunders} blunder${blunders > 1 ? 's' : ''} in this game.`);
    }
  
    if (brilliants > 0) {
        insights.push(`Made ${brilliants} brilliant move${brilliants > 1 ? 's' : ''}!`);
    }
  
    // Opening game analysis
    const openingMoves = analysis.filter(move => move.move_number <= 10);
    if (openingMoves.length > 0) {
        const avgOpeningScore = openingMoves.reduce((sum, move) => sum + (typeof move.score === 'number' ? move.score : 0), 0) / openingMoves.length;
        if (avgOpeningScore > 7) {
            insights.push(`Strong opening play! Average score: ${avgOpeningScore.toFixed(1)}`);
        } else if (avgOpeningScore < 5) {
            insights.push(`Opening needs work. Average score: ${avgOpeningScore.toFixed(1)}`);
        }
    }
  
    // Rating based feedback
    if (stats.rating > 1500) {
        insights.push(`Rating of ${stats.rating} shows advanced skill!`);
    } else if (stats.rating > 1200) {
        insights.push(`Rating of ${stats.rating} puts them in the intermediate range.`);
    } else {
        insights.push(`Rating: ${stats.rating}.`);
    }
  
    return insights.length > 0 ? insights : [`${friendUsername} needs to play more games for insights`];
}

/**
 * Generate performance insights based on stats
 */
function generatePerformanceInsights(stats) {
    const insights = [];
  
    if (!stats || (!stats.wins && !stats.losses && !stats.draws)) {
        return [`${friendUsername} hasn't played enough games yet.`];
    }
  
    const totalGames = (stats.wins || 0) + (stats.losses || 0) + (stats.draws || 0);
  
    // Win rate analysis
    if (totalGames > 0) {
        const winRate = ((stats.wins || 0) / totalGames) * 100;
      
        if (winRate > 65) {
            insights.push(`Impressive win rate of ${winRate.toFixed(1)}% over ${totalGames} games!`);
        } else if (winRate > 50) {
            insights.push(`Solid win rate of ${winRate.toFixed(1)}% over ${totalGames} games.`);
        } else if (winRate > 30) {
            insights.push(`Win rate of ${winRate.toFixed(1)}% shows room for improvement.`);
        } else {
            insights.push(`Win rate of ${winRate.toFixed(1)}% across ${totalGames} games.`);
        }
    }
  
    // Move quality analysis
    if (stats.average_score) {
        if (stats.average_score > 7.5) {
            insights.push(`Excellent average move quality (${stats.average_score.toFixed(1)}/10).`);
        } else if (stats.average_score > 6) {
            insights.push(`Good average move quality (${stats.average_score.toFixed(1)}/10).`);
        } else if (stats.average_score > 4) {
            insights.push(`Average move quality is ${stats.average_score.toFixed(1)}/10.`);
        } else {
            insights.push(`Average move quality is ${stats.average_score.toFixed(1)}/10.`);
        }
    }
  
    return insights.length > 0 ? insights : [`${friendUsername} needs more games for performance insights.`];
} 

/**
 * Show error state when data can't be loaded
 */
function showErrorState() {
    // Destroy existing charts
    if (chartInstances.lastPlayed) chartInstances.lastPlayed.destroy();
    if (chartInstances.average) chartInstances.average.destroy();

    // Update all fields to show error state
    const errorElements = [
        'bestMove', 'worstMove', 'lastGameAvg',
        'highestAvg', 'lowestAvg', 'playerRating'
    ];
  
    errorElements.forEach(id => {
        document.getElementById(id).textContent = "Data unavailable";
    });

    document.getElementById('gameInsights').innerHTML = 
        "<p>Couldn't load game data. Please try again later.</p>";
    document.getElementById('performanceInsights').innerHTML = 
        "<p>Performance data currently unavailable.</p>";
}

/**
 * Initialize charts with friend's data
 */
function initializeCharts(stats, analysis) {
    // Destroy existing charts
    if (chartInstances.lastPlayed) chartInstances.lastPlayed.destroy();
    if (chartInstances.average) chartInstances.average.destroy();

    // Last Played Chart
    const lastPlayedCtx = document.getElementById('lastPlayedChart').getContext('2d');
  
    // Filter for moves with non-zero scores
    const filteredAnalysis = analysis.filter(move => typeof move.score === 'number');
    const moveLabels = filteredAnalysis.map(move => move.move_number);
    const moveScores = filteredAnalysis.map(move => move.score);

    chartInstances.lastPlayed = new Chart(lastPlayedCtx, {
        type: 'line',
        data: {
            labels: moveLabels,
            datasets: [{
                label: 'Move Score',
                data: moveScores,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 2,
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Move Number'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Score'
                    }
                }
            }
        }
    });

    // Generate or use average scores by move range
    let averageScores;
    if (stats && stats.average_scores && stats.average_scores.length > 0) {
        averageScores = stats.average_scores;
    } else if (analysis && analysis.length > 0) {
        // Generate average scores from the single game analysis
        // Group moves into ranges of 5 and calculate averages
        averageScores = [];
        for (let i = 1; i <= 50; i += 5) {
            const rangeEnd = i + 4;
            const movesInRange = analysis.filter(m => m.move_number >= i && m.move_number <= rangeEnd);
            if (movesInRange.length > 0) {
                const avgScore = movesInRange.reduce((sum, m) => sum + m.score, 0) / movesInRange.length;
                averageScores.push(avgScore);
            }
        }
    } else {
        // Fallback to sample data
        averageScores = [];
    }

    // Average Chart
    const averageCtx = document.getElementById('averageChart').getContext('2d');
    chartInstances.average = new Chart(averageCtx, {
        type: 'line',
        data: {
            labels: ['1-5', '6-10', '11-15', '16-20', '21-25', '26-30', '31-35', '36-40', '41-45', '46+'],
            datasets: [{
                label: 'Average Score',
                data: averageScores,
                borderColor: 'rgba(192, 75, 75, 1)',
                backgroundColor: 'rgba(192, 75, 75, 0.2)',
                borderWidth: 2,
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Move Range'
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Score'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });
}

/**
 * Show an alert message on the page
 */
function showAlert(message, type = 'info') {
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Find or create alert container
    let alertContainer = document.querySelector('.alert-container');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.className = 'alert-container position-fixed top-0 start-50 translate-middle-x p-3';
        alertContainer.style.zIndex = '1050';
        document.body.appendChild(alertContainer);
    }
    
    // Add the alert to the container
    alertContainer.appendChild(alertDiv);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 300);
    }, 5000);
}