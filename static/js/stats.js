// Navigation functions
function goBack() {
  window.history.back();
}

function goHome() {
  window.location.href = "index.html";
}

function shareStats(section) {
  const message = section === 'lastPlayed' 
    ? "Check out my Last Played stats on AI Chess!" 
    : "Check out my Average stats on AI Chess!";
  alert(message + " Share functionality coming soon!");
}

// Generate dynamic insights based on game data
function generateInsights(stats, analysis) {
  const insights = [];
  
  // Calculate best/worst moves
  const bestMove = analysis.reduce((best, move) => move.score > best.score ? move : {score: 0}, {score: 0});
  const worstMove = analysis.reduce((worst, move) => move.score < worst.score ? move : {score: 10}, {score: 10});
  
  // Opening game analysis
  if (bestMove.move_number <= 10) {
    insights.push(`Excellent opening! Your best move was #${bestMove.move_number} with score ${bestMove.score.toFixed(1)}`);
  }
  
  // Middle game analysis
  if (worstMove.move_number > 10 && worstMove.move_number <= 30) {
    insights.push(`Critical mistake at move #${worstMove.move_number} (score ${worstMove.score.toFixed(1)})`);
  }
  
  // Rating based feedback
  if (stats.rating > 1200) {
    insights.push(`Your rating of ${stats.rating} puts you in the intermediate range.`);
  } else {
    insights.push("Keep practicing to improve your rating!");
  }
  
  return insights.length > 0 ? insights : ["Analyze more games to get personalized insights"];
}

// Main function to load and display stats
document.addEventListener('DOMContentLoaded', async function() {
  try {
    // Check authentication
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    // Show loading states
    document.getElementById('bestMove').textContent = "Loading...";
    document.getElementById('worstMove').textContent = "Loading...";
    document.getElementById('gameInsights').innerHTML = "<p>Loading game data...</p>";

    // Fetch player stats
    const statsResponse = await fetch(`/api/player_stats/${user.id}`);
    if (!statsResponse.ok) throw new Error('Failed to load player stats');
    const stats = await statsResponse.json();

    // Fetch game analysis
    let analysis = [];
    if (stats.last_game_id) {
      const analysisResponse = await fetch(`/api/game_analysis/${stats.last_game_id}`);
      if (analysisResponse.ok) analysis = await analysisResponse.json();
    }

    // Update all stats displays
    updateStatsDisplay(stats, analysis);
    
    // Initialize charts
    initializeCharts(stats, analysis);

  } catch (error) {
    console.error("Stats loading error:", error);
    showErrorState();
  }
});

function updateStatsDisplay(stats, analysis) {
  // Calculate best/worst moves
  const bestMove = analysis.reduce((best, move) => move.score > best.score ? move : {score: 0, move_number: 'N/A'}, {score: 0, move_number: 'N/A'});
  const worstMove = analysis.reduce((worst, move) => move.score < worst.score ? move : {score: 10, move_number: 'N/A'}, {score: 10, move_number: 'N/A'});

  // Update Last Played stats
  document.getElementById('bestMove').textContent = `Move ${bestMove.move_number} (${bestMove.score.toFixed(1)})`;
  document.getElementById('worstMove').textContent = `Move ${worstMove.move_number} (${worstMove.score.toFixed(1)})`;
  document.getElementById('lastGameAvg').textContent = stats.average_score ? stats.average_score.toFixed(1) : 'N/A';

  // Update Average stats
  document.getElementById('highestAvg').textContent = stats.highest_average ? stats.highest_average.toFixed(1) : 'N/A';
  document.getElementById('lowestAvg').textContent = stats.lowest_average ? stats.lowest_average.toFixed(1) : 'N/A';
  document.getElementById('playerRating').textContent = stats.rating || '1000';

  // Generate and display insights
  const insights = generateInsights(stats, analysis);
  document.getElementById('gameInsights').innerHTML = insights.map(i => `<p>${i}</p>`).join('');
}

function showErrorState() {
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

  // Initialize sample charts
  initializeSampleCharts();
}

function initializeCharts(stats, analysis) {
  // Last Played Chart (using real data if available)
  const lastPlayedCtx = document.getElementById('lastPlayedChart').getContext('2d');
  new Chart(lastPlayedCtx, {
      type: 'line',
      data: {
          labels: analysis.length > 0 
              ? analysis.map(item => item.move_number) 
              : Array.from({ length: 22 }, (_, i) => i + 1),
          datasets: [{
              label: 'Move Score',
              data: analysis.length > 0
                  ? analysis.map(item => item.score)
                  : [8.3, 8.7, 7.1, 8.5, 6.2, 7.8, 9.4, 8.6, 7.3, 4.9, 5.1, 6.4, 6.7, 5.2, 6.8, 5.5, 3.6, 4.3, 3.9, 4.1, 2.7, 1.5],
              borderColor: 'rgba(75, 192, 192, 1)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              borderWidth: 2,
              tension: 0.1
          }]
      },
      options: getChartOptions('Move Number')
  });

  // Average Chart (using real stats if available)
  const averageCtx = document.getElementById('averageChart').getContext('2d');
  new Chart(averageCtx, {
      type: 'line',
      data: {
          labels: ['1-5', '6-10', '11-15', '16-20', '21-25', '26-30', '31-35', '36-40', '41-45', '46+'],
          datasets: [{
              label: 'Move Score',
              data: stats.average_scores && stats.average_scores.length > 0
                  ? stats.average_scores
                  : [5.2, 6.3, 6.1, 7.4, 6.5, 6.7, 7.8, 6.6, 6.2, 5.4],
              borderColor: 'rgba(192, 75, 75, 1)',
              backgroundColor: 'rgba(192, 75, 75, 0.2)',
              borderWidth: 2
          }]
      },
      options: getChartOptions('Move Range')
  });
}

// Fallback to sample data if API fails
function initializeSampleCharts() {
  const lastPlayedCtx = document.getElementById('lastPlayedChart').getContext('2d');
  new Chart(lastPlayedCtx, {
      type: 'line',
      data: {
          labels: Array.from({ length: 22 }, (_, i) => i + 1),
          datasets: [{
              label: 'Move Score',
              data: [8.3, 8.7, 7.1, 8.5, 6.2, 7.8, 9.4, 8.6, 7.3, 4.9, 5.1, 6.4, 6.7, 5.2, 6.8, 5.5, 3.6, 4.3, 3.9, 4.1, 2.7, 1.5],
              borderColor: 'rgba(75, 192, 192, 1)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              borderWidth: 2,
              tension: 0.1
          }]
      },
      options: getChartOptions('Move Number')
  });

  const averageCtx = document.getElementById('averageChart').getContext('2d');
  new Chart(averageCtx, {
      type: 'line',
      data: {
          labels: ['1-5', '6-10', '11-15', '16-20', '21-25', '26-30', '31-35', '36-40', '41-45', '46+'],
          datasets: [{
              label: 'Move Score',
              data: [5.2, 6.3, 6.1, 7.4, 6.5, 6.7, 7.8, 6.6, 6.2, 5.4],
              borderColor: 'rgba(192, 75, 75, 1)',
              backgroundColor: 'rgba(192, 75, 75, 0.2)',
              borderWidth: 2
          }]
      },
      options: getChartOptions('Move Range')
  });
}

function getChartOptions(xAxisTitle) {
  return {
      responsive: true,
      plugins: {
          legend: {
              display: true,
              position: 'top'
          }
      },
      scales: {
          x: {
              title: {
                  display: true,
                  text: xAxisTitle
              }
          },
          y: {
              title: {
                  display: true,
                  text: 'Move Score'
              },
              min: 0,
              max: 10,
              ticks: {
                  stepSize: 1
              }
          }
      }
  };
}

function updateStatsBreakdown(stats, analysis) {
  // Find best and worst moves from analysis
  let bestMove = { move_number: 0, score: 0 };
  let worstMove = { move_number: 0, score: 10 };
  
  if (analysis.length > 0) {
      analysis.forEach(move => {
          if (move.score > bestMove.score) {
              bestMove = move;
          }
          if (move.score < worstMove.score) {
              worstMove = move;
          }
      });
  }

  // Update last played stats
  const lastPlayedList = document.querySelector('#lastPlayedSection .card ul');
  if (lastPlayedList) {
      lastPlayedList.innerHTML = `
          <li><strong>Best Move:</strong> Move ${bestMove.move_number || 7} (Score: ${bestMove.score || 9})</li>
          <li><strong>Worst Move:</strong> Move ${worstMove.move_number || 22} (Score: ${worstMove.score || 1})</li>
          <li><strong>Average Score:</strong> ${stats.average_score ? stats.average_score.toFixed(1) : '6.5'}</li>
      `;
  }

  // Update average stats (using sample data if no stats available)
  const averageList = document.querySelector('#averageSection .card ul');
  if (averageList) {
      averageList.innerHTML = `
          <li><strong>Highest Average:</strong> Moves 1-5 (Score: ${stats.highest_average || 7})</li>
          <li><strong>Lowest Average:</strong> Moves 16-20 (Score: ${stats.lowest_average || 4})</li>
          <li><strong>Overall Average:</strong> ${stats.average_score ? stats.average_score.toFixed(1) : '5.5'}</li>
      `;
  }
}