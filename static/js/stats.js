// Global variables (same as friends.js)
let currentUserId = null;
let currentUsername = null;

let lastPlayedChart = null;
let averageChart = null;

let chartInstances = {
  lastPlayed: null,
  average: null
};

// Main initialization function (similar to friends.js)
async function initializeStatsPage() {
    try {
        // Get user data using the shared function
        const userData = await getUserData();
        if (!userData) {
            showAlert('Please log in to view stats', 'warning');
            window.location.href = '/';
            return;
        }

        // Set global variables
        currentUserId = userData.user_id || userData.id;
        currentUsername = userData.username;

        // Update UI with username
        const usernameElement = document.getElementById('username');
        if (usernameElement) {
            usernameElement.textContent = currentUsername;
        }

        // Load and display stats
        await loadAndDisplayStats();

    } catch (error) {
        console.error('Error initializing stats page:', error);
        showErrorState();
    }
}

// Shared getUserData function (identical to friends.js)
async function getUserData() {
    try {
        // First, try to get user data from localStorage
        const storedUserData = localStorage.getItem('user');
        if (storedUserData) {
            const userData = JSON.parse(storedUserData);
            if (userData && (userData.user_id || userData.id)) {
                return userData;
            }
        }
        
        // If no valid localStorage data, try to get from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('user_id');
        
        if (userId) {
            const userResponse = await fetch(`/api/current_user/${userId}`);
            if (userResponse.ok) {
                const userData = await userResponse.json();
                localStorage.setItem('user', JSON.stringify(userData));
                return userData;
            }
        }
        
        // If no URL parameter or it failed, try to get from session endpoint
        const response = await fetch('/api/current_user');
        if (!response.ok) {
            console.error('Not logged in or session expired');
            return null;
        }
        
        const userData = await response.json();
        localStorage.setItem('user', JSON.stringify(userData));
        return userData;
    } catch (error) {
        console.error('Error getting user data:', error);
        localStorage.removeItem('user');
        return null;
    }
}

// Consolidated stats loading function
async function loadAndDisplayStats() {
    try {
        showLoadingStates();
        
        // Fetch player stats
        const stats = await fetchPlayerStats();
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
        console.error('Error loading stats:', error);
        showErrorState();
    }
}

// Helper functions for stats loading
async function fetchPlayerStats() {
    const response = await fetch(`/api/player_stats/${currentUserId}`);
    if (!response.ok) {
        if (response.status === 404) {
            showAlert('Player stats not found', 'warning');
        } else {
            throw new Error(`Failed to load player stats: ${response.statusText}`);
        }
        return null;
    }
    return await response.json();
}

async function fetchGameAnalysis(gameId) {
    try {
        const response = await fetch(`/api/game_analysis/${gameId}`);
        return response.ok ? await response.json() : [];
    } catch (error) {
        console.warn("Error loading game analysis:", error);
        return [];
    }
}

function showLoadingStates() {
    document.getElementById('bestMove').textContent = "Loading...";
    document.getElementById('worstMove').textContent = "Loading...";
    document.getElementById('lastGameAvg').textContent = "Loading...";
    document.getElementById('highestAvg').textContent = "Loading...";
    document.getElementById('lowestAvg').textContent = "Loading...";
    document.getElementById('playerRating').textContent = "Loading...";
    document.getElementById('gameInsights').innerHTML = "<p>Loading game data...</p>";
    document.getElementById('performanceInsights').innerHTML = "<p>Calculating your performance trends...</p>";
}

function displayPerformanceInsights(stats) {
    const performanceInsights = generatePerformanceInsights(stats);
    document.getElementById('performanceInsights').innerHTML = 
        performanceInsights.map(i => `<p>${i}</p>`).join('');
}

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', initializeStatsPage);

// Update shareStats to use the global variables
function shareStats(section) {
    if (!currentUserId) {
        showAlert('Please wait while we load your data', 'warning');
        return;
    }

    const message = section === 'lastPlayed' 
        ? `${currentUsername}'s Last Played stats on AI Chess!` 
        : `${currentUsername}'s Average stats on AI Chess!`;
  
  // Create shareable content
  const statsElement = document.getElementById(section === 'lastPlayed' ? 'lastPlayedStats' : 'averageStats');
  const chartElement = document.getElementById(section === 'lastPlayed' ? 'lastPlayedChart' : 'averageChart');
  const statsContent = statsElement.innerText;
  
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

// Generate dynamic insights based on game data
function generateInsights(stats, analysis) {
  const insights = [];
  
  if (!analysis || analysis.length === 0) {
    return ["Play some games to get personalized insights!"];
  }
  
  const bestMove = analysis.reduce((best, move) => 
    move.score > best.score ? move : best, 
    { move_number: 'N/A', score: -1 }
  );
  
  const worstMove = analysis.reduce((worst, move) => 
    move.score < worst.score ? move : worst, 
    { move_number: 'N/A', score: 11 }
  );
  
  // Opening game analysis
  const openingMoves = analysis.filter(move => move.move_number <= 10);
  if (openingMoves.length > 0) {
    const avgOpeningScore = openingMoves.reduce((sum, move) => sum + move.score, 0) / openingMoves.length;
    if (avgOpeningScore > 7) {
      insights.push(`Strong opening play! Average score: ${avgOpeningScore.toFixed(1)}`);
    } else if (avgOpeningScore < 5) {
      insights.push(`Opening needs work. Average score: ${avgOpeningScore.toFixed(1)}`);
    }
  }
  
  // Best move analysis
  if (bestMove.move_number !== 'N/A') {
    insights.push(`Your best move was #${bestMove.move_number} with score ${bestMove.score.toFixed(1)}`);
  }
  
  // Worst move analysis
  if (worstMove.move_number !== 'N/A' && worstMove.score < 5) {
    insights.push(`Critical mistake at move #${worstMove.move_number} (score ${worstMove.score.toFixed(1)})`);
  }
  
  // Rating based feedback
  if (stats.rating > 1500) {
    insights.push(`Your rating of ${stats.rating} shows advanced skill!`);
  } else if (stats.rating > 1200) {
    insights.push(`Your rating of ${stats.rating} puts you in the intermediate range.`);
  } else {
    insights.push(`Rating: ${stats.rating}. Keep practicing to improve!`);
  }
  
  // Performance trend analysis
  if (analysis.length > 5) {
    const firstHalf = analysis.slice(0, Math.floor(analysis.length / 2));
    const secondHalf = analysis.slice(Math.floor(analysis.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((sum, move) => sum + move.score, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, move) => sum + move.score, 0) / secondHalf.length;
    
    if (secondHalfAvg > firstHalfAvg) {
      insights.push(`Your play improved as the game progressed (+${(secondHalfAvg - firstHalfAvg).toFixed(1)} points)`);
    } else if (firstHalfAvg > secondHalfAvg) {
      insights.push(`Your performance declined in the latter half of the game (-${(firstHalfAvg - secondHalfAvg).toFixed(1)} points)`);
    }
  }
  
  return insights.length > 0 ? insights : ["Play more games to get personalized insights"];
}

function generatePerformanceInsights(stats) {
  const insights = [];
  
  if (!stats || (!stats.wins && !stats.losses && !stats.draws)) {
    return ["Not enough games played to generate insights."];
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
      insights.push(`Win rate of ${winRate.toFixed(1)}% - focus on fundamentals.`);
    }
  }
  
  // Rating analysis
  if (stats.rating) {
    if (stats.rating > 1800) {
      insights.push(`Your rating of ${stats.rating} is impressive! You're playing at an advanced level.`);
    } else if (stats.rating > 1500) {
      insights.push(`Your rating of ${stats.rating} shows strong chess fundamentals.`);
    } else if (stats.rating > 1200) {
      insights.push(`Rating of ${stats.rating}: You're playing at an intermediate level.`);
    } else {
      insights.push(`Keep practicing to improve your ${stats.rating} rating.`);
    }
  }
  
  // Move quality analysis
  if (stats.average_score) {
    if (stats.average_score > 7.5) {
      insights.push(`Excellent average move quality (${stats.average_score.toFixed(1)}/10).`);
    } else if (stats.average_score > 6) {
      insights.push(`Good average move quality (${stats.average_score.toFixed(1)}/10).`);
    } else if (stats.average_score > 4) {
      insights.push(`Average move quality needs work (${stats.average_score.toFixed(1)}/10).`);
    } else {
      insights.push(`Focus on reducing blunders to improve your ${stats.average_score.toFixed(1)}/10 average.`);
    }
  }
  
  if (stats.highest_average && stats.lowest_average && 
      stats.highest_average > 0 && stats.lowest_average > 0) {
    const difference = stats.highest_average - stats.lowest_average;
    if (difference > 3) {
      insights.push(`Large variance (${difference.toFixed(1)} points) between your best and worst move ranges.`);
    }
  }
  
  return insights.length > 0 ? insights : ["Play more games to get meaningful performance insights."];
}

function updateStatsDisplay(stats, analysis) {
  if (!analysis || analysis.length === 0) {
    analysis = [];
  }
  
  const bestMove = analysis.length > 0 
    ? analysis.reduce((best, move) => move.score > best.score ? move : best, { score: -1, move_number: 'N/A' })
    : { score: 'N/A', move_number: 'N/A' };
    
  const worstMove = analysis.length > 0
    ? analysis.reduce((worst, move) => move.score < worst.score ? move : worst, { score: 11, move_number: 'N/A' })
    : { score: 'N/A', move_number: 'N/A' };

  // Update Last Played stats
  document.getElementById('bestMove').textContent = bestMove.move_number !== 'N/A' 
    ? `Move ${bestMove.move_number} (${bestMove.score.toFixed(1)})` 
    : 'N/A';
    
  document.getElementById('worstMove').textContent = worstMove.move_number !== 'N/A'
    ? `Move ${worstMove.move_number} (${worstMove.score.toFixed(1)})` 
    : 'N/A';
    
  document.getElementById('lastGameAvg').textContent = stats.average_score 
    ? stats.average_score.toFixed(1) 
    : 'N/A';

  // Update Average stats
  document.getElementById('highestAvg').textContent = stats.highest_average 
    ? stats.highest_average.toFixed(1) 
    : 'N/A';
    
  document.getElementById('lowestAvg').textContent = stats.lowest_average 
    ? stats.lowest_average.toFixed(1) 
    : 'N/A';
    
  document.getElementById('playerRating').textContent = stats.rating || '1000';

  // Generate and display insights
  const insights = generateInsights(stats, analysis);
  document.getElementById('gameInsights').innerHTML = insights.map(i => `<p>${i}</p>`).join('');
}

function showErrorState() {
  if (lastPlayedChart) lastPlayedChart.destroy();
  if (averageChart) averageChart.destroy();

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

function initializeCharts(stats, analysis) {
  // Destroy existing charts
  if (chartInstances.lastPlayed) chartInstances.lastPlayed.destroy();
  if (chartInstances.average) chartInstances.average.destroy();

  // Last Played Chart (using real data if available)
  const lastPlayedCtx = document.getElementById('lastPlayedChart').getContext('2d');
  
  // Create labels and data from analysis, or use sample data if none available
  const moveLabels = analysis && analysis.length > 0 
    ? analysis.map(item => item.move_number) 
    : Array.from({ length: 22 }, (_, i) => i + 1);
    
  const moveScores = analysis && analysis.length > 0
    ? analysis.map(item => item.score)
    : [8.3, 8.7, 7.1, 8.5, 6.2, 7.8, 9.4, 8.6, 7.3, 4.9, 5.1, 6.4, 6.7, 5.2, 6.8, 5.5, 3.6, 4.3, 3.9, 4.1, 2.7, 1.5];

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
    options: getChartOptions('Move Number')
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
    averageScores = [5.2, 6.3, 6.1, 7.4, 6.5, 6.7, 7.8, 6.6, 6.2, 5.4];
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
    options: getChartOptions('Move Range')
  });
}

function getChartOptions(xAxisTitle) {
  return {
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
                  text: xAxisTitle
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
              min: 0,
              max: 10,
              ticks: {
                  stepSize: 1
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
  };
}

// Helper function for showing alerts - similar to the one in friends.js
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
}