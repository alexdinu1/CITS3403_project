// Function to go back to the previous page
function goBack() {
    window.history.back();
  }

  // Function to go to the home page
  function goHome() {
    window.location.href = "index.html";
  }

  // Function to share stats
  function shareStats(section) {
    const message = section === 'lastPlayed' 
      ? "Check out my Last Played stats on AI Chess!" 
      : "Check out my Average stats on AI Chess!";
    alert(message + " Share functionality can be implemented here.");
  }

  // Data for the "Last Played" chart
  const lastPlayedCtx = document.getElementById('lastPlayedChart').getContext('2d');
  const lastPlayedChart = new Chart(lastPlayedCtx, {
    type: 'line',
    data: {
      labels: Array.from({ length: 22 }, (_, i) => i + 1), // X-axis labels (1 to 22)
      datasets: [{
        label: 'Move Score',
        data: [8.3, 8.7, 7.1, 8.5, 6.2, 7.8, 9.4, 8.6, 7.3, 4.9, 5.1, 6.4, 6.7, 5.2, 6.8, 5.5, 3.6, 4.3, 3.9, 4.1, 2.7, 1.5], // Example Y-axis data with decimals], // Example Y-axis data
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderWidth: 2
      }]
    },
    options: {
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
            text: 'Move Number'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Move Score'
          },
          min: 0,
          max: 10
        }
      }
    }
  });

  // Data for the "Average" chart
  const averageCtx = document.getElementById('averageChart').getContext('2d');
  const averageChart = new Chart(averageCtx, {
    type: 'line',
    data: {
      labels: Array.from({ length: 20 }, (_, i) => i + 1), // X-axis labels (1 to 20)
      datasets: [{
        label: 'Move Score',
        data: [5.2, 6.3, 6.1, 7.4, 6.5, 6.7, 7.8, 6.6, 6.2, 5.4, 5.1, 5.3, 5.6, 5.2, 5.8, 5.7, 4.3, 4.6, 4.1, 4.5], // Example Y-axis data
        borderColor: 'rgba(192, 75, 75, 1)',
        backgroundColor: 'rgba(192, 75, 75, 0.2)',
        borderWidth: 2
      }]
    },
    options: {
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
            text: 'Move Number'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Move Score'
          },
          min: 0,
          max: 10
        }
      }
    }
  });