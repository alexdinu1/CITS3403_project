// Global variables
let currentUserId = null;
let currentUsername = null;

// DOM Elements
const friendsListElem = document.getElementById('friendsList');
const friendRequestsElem = document.getElementById('friendRequests');
const suggestionsListElem = document.getElementById('suggestionsList');
const friendSearchInput = document.getElementById('friendSearch');
const searchButton = document.getElementById('searchButton');
const friendCountBadge = document.getElementById('friendCount');
const requestCountBadge = document.getElementById('requestCount');
const suggestionCountBadge = document.getElementById('suggestionCount');

// Templates
const friendCardTemplate = document.getElementById('friendCardTemplate');
const requestCardTemplate = document.getElementById('requestCardTemplate');

// Event Listeners
document.addEventListener('DOMContentLoaded', initializeFriendsPage);
searchButton.addEventListener('click', searchPlayers);
friendSearchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        searchPlayers();
    }
});

/**
 * Initialize the friends page
 */
async function initializeFriendsPage() {
    try {
        // Check if user is logged in
        const userData = await getUserData();
        if (!userData) {
            showAlert('Please log in to view friends', 'warning');
            // Redirect to login page
            window.location.href = '/';
            return;
        }

        currentUserId = userData.user_id || userData.id;
        currentUsername = userData.username;

        // Load friends data
        await Promise.all([
            loadFriendsList(),
            loadFriendRequests(),
            loadSuggestions()
        ]);

        // Set up tab change events
        const tabs = document.querySelectorAll('[data-bs-toggle="tab"]');
        tabs.forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                const target = e.target.getAttribute('data-bs-target');
                if (target === '#friends') {
                    loadFriendsList();
                } else if (target === '#requests') {
                    loadFriendRequests();
                } else if (target === '#suggestions') {
                    loadSuggestions();
                }
            });
        });
    } catch (error) {
        console.error('Error getting Friends Page:', error);
        return null;
    }
}

/**
 * Get current user data from localStorage or server
 */
async function getUserData() {
    try {
        // First, try to get user data from localStorage
        const storedUserData = localStorage.getItem('user');
        if (storedUserData) {
            const userData = JSON.parse(storedUserData);
            if (userData && (userData.user_id || userData.id)) {
                // If we have valid user data in localStorage, use it
                return userData;
            }
        }
        
        // If no valid localStorage data, try to get from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('user_id');
        
        if (userId) {
            // We have user ID in URL parameters
            const userResponse = await fetch(`/api/current_user/${userId}`);
            if (userResponse.ok) {
                const userData = await userResponse.json();
                // Save to localStorage for future use
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
        // Save to localStorage for future use
        localStorage.setItem('user', JSON.stringify(userData));
        return userData;
    } catch (error) {
        console.error('Error getting user data:', error);
        // If there was an error, clear localStorage to be safe
        localStorage.removeItem('user');
        return null;
    }
}

/**
 * Load the list of friends
 */
async function loadFriendsList() {
    try {
        friendsListElem.innerHTML = '<div class="empty-state"><p>Loading your friends list...</p><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
        
        const response = await fetch(`/api/friends/${currentUserId}`);
        const friends = await response.json();
        
        friendCountBadge.textContent = friends.length;
        
        if (friends.length === 0) {
            friendsListElem.innerHTML = '<div class="empty-state"><p>You don\'t have any friends yet. Add some from the suggestions tab or search for players.</p></div>';
            return;
        }

        // Clear and populate the friends list
        friendsListElem.innerHTML = '';

        for (const friend of friends) {
            const stats = await fetchFriendStats(friend.id);
            const card = createFriendCard(friend, stats);
            friendsListElem.appendChild(card);
        }
    } catch (error) {
        console.error('Error loading friends:', error);
        friendsListElem.innerHTML = '<div class="empty-state"><p>Error loading friends. Please try again.</p></div>';
    }
}

/**
 * Load friend requests
 */
async function loadFriendRequests() {
    try {
        friendRequestsElem.innerHTML = '<div class="empty-state"><p>Checking for friend requests...</p><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
        
        // Add a timestamp to prevent caching
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/friend_requests/${currentUserId}?t=${timestamp}`, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        const requests = await response.json();
        
        // Debug info about received requests
        console.log('Received friend requests:', requests);
        
        requestCountBadge.textContent = requests.length;
        
        if (requests.length === 0) {
            friendRequestsElem.innerHTML = '<div class="empty-state"><p>You don\'t have any pending friend requests.</p></div>';
            return;
        }

        // Clear and populate the requests list
        friendRequestsElem.innerHTML = '';

        for (const request of requests) {
            const card = createRequestCard(request);
            friendRequestsElem.appendChild(card);
        }
    } catch (error) {
        console.error('Error loading friend requests:', error);
        friendRequestsElem.innerHTML = '<div class="empty-state"><p>Error loading friend requests. Please try again.</p></div>';
    }
}

/**
 * Load player suggestions
 */
async function loadSuggestions() {
    try {
        suggestionsListElem.innerHTML = '<div class="empty-state"><p>Finding player suggestions...</p><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
        
        const response = await fetch(`/api/suggestions/${currentUserId}`);
        const suggestions = await response.json();
        
        suggestionCountBadge.textContent = suggestions.length;
        
        if (suggestions.length === 0) {
            suggestionsListElem.innerHTML = '<div class="empty-state"><p>No player suggestions available right now.</p></div>';
            return;
        }

        // Clear and populate the suggestions list
        suggestionsListElem.innerHTML = '';

        for (const suggestion of suggestions) {
            const card = createSuggestionCard(suggestion);
            suggestionsListElem.appendChild(card);
        }
    } catch (error) {
        console.error('Error loading suggestions:', error);
        suggestionsListElem.innerHTML = '<div class="empty-state"><p>Error loading suggestions. Please try again.</p></div>';
    }
}

/**
 * Search for players
 */
async function searchPlayers() {
    const query = friendSearchInput.value.trim();
    
    if (!query) {
        showAlert('Please enter a username to search', 'warning');
        return;
    }
    
    try {
        suggestionsListElem.innerHTML = '<div class="empty-state"><p>Searching for players...</p><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
        
        const response = await fetch(`/api/search_players?q=${encodeURIComponent(query)}&exclude=${currentUserId}`);
        const players = await response.json();
        
        // Switch to suggestions tab
        document.getElementById('suggestions-tab').click();
        
        if (players.length === 0) {
            suggestionsListElem.innerHTML = '<div class="empty-state"><p>No players found matching your search.</p></div>';
            return;
        }

        // Clear and populate the suggestions list
        suggestionsListElem.innerHTML = '';
        suggestionCountBadge.textContent = players.length;

        for (const player of players) {
            const card = createSuggestionCard(player);
            suggestionsListElem.appendChild(card);
        }
    } catch (error) {
        console.error('Error searching players:', error);
        suggestionsListElem.innerHTML = '<div class="empty-state"><p>Error searching for players. Please try again.</p></div>';
    }
}

/**
 * Create a friend card element
 */
function createFriendCard(friend, stats) {
    const fragment = friendCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.col');
    
    // Set friend data
    card.querySelector('[data-name]').textContent = friend.username;
    card.querySelector('[data-rating]').textContent = `Rating: ${friend.rating || 1000}`;
    
    if (stats) {
        card.querySelector('[data-stats]').textContent = `W: ${stats.wins || 0} | L: ${stats.losses || 0} | D: ${stats.draws || 0}`;
    }
    
    // Format last active time
    const lastActive = friend.last_active ? formatLastActivity(new Date(friend.last_active)) : 'Unknown';
    card.querySelector('[data-last-active]').textContent = `Last active: ${lastActive}`;
    
    // Set up action buttons
    const viewBtn = card.querySelector('[data-action="view"]');
    viewBtn.addEventListener('click', async () => {
        const userData = await getUserData();
        if (!userData || !userData.user_id) {
            showAlert('You must be logged in to view stats.', 'warning');
            return;
        }
        // Check friendship before navigating
        const friendshipResponse = await fetch(`/api/get_friendship?user_id=${userData.user_id}&friend_id=${friend.id}`);
        const friendship = await friendshipResponse.json();

        if (!friendship || friendship.status !== 'accepted') {
            showAlert('Please friend this user to view their stats.', 'warning');
            return;
        }
        // Only navigate if friends
        window.location.href = `/friend_stats/${friend.id}`;
    });
    
    const removeBtn = card.querySelector('[data-action="remove"]');
    removeBtn.addEventListener('click', async () => {
        if (confirm(`Are you sure you want to remove ${friend.username} from your friends?`)) {
            // Determine which friendship record to use
            const friendshipResponse = await fetch(`/api/get_friendship?user_id=${currentUserId}&friend_id=${friend.id}`);
            const friendship = await friendshipResponse.json();
            
            if (friendship.error) {
                showAlert('Error: Could not find friendship record', 'danger');
                return;
            }
            
            await handleFriendAction('remove', friendship.id);
            await loadFriendsList();
        }
    });
    
    return card;
}

/**
 * Create a request card element
 */
function createRequestCard(request) {
    const fragment = requestCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.card');
    
    // Set request data
    card.querySelector('[data-name]').textContent = request.username;
    
    // Format request date
    // Log the raw date for debugging
    console.log('Request date before formatting:', request.request_date);
    
    // Format request date - handle timezone issues
    let requestDate;
    if (request.request_date) {
        // For debugging purposes, also show the actual date
        const rawDate = new Date(request.request_date);
        console.log('Parsed date object:', rawDate);
        
        requestDate = formatLastActivity(rawDate);
    } else {
        requestDate = 'Unknown';
    }
    
    card.querySelector('[data-date]').textContent = `Requested: ${requestDate}`;
    
    // Set up action buttons
    const acceptBtn = card.querySelector('[data-action="accept"]');
    acceptBtn.addEventListener('click', () => {
        handleFriendAction('accept', request.id);
    });
    
    const rejectBtn = card.querySelector('[data-action="reject"]');
    rejectBtn.addEventListener('click', () => {
        handleFriendAction('reject', request.id);
    });
    
    return card;
}

/**
 * Create a suggestion card element
 */
function createSuggestionCard(player) {
    // Clone the friend card template and modify it for suggestions
    const fragment = friendCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.col');
    
    // Set player data
    card.querySelector('[data-name]').textContent = player.username;
    card.querySelector('[data-rating]').textContent = `Rating: ${player.rating || 1000}`;
    card.querySelector('[data-stats]').textContent = `W: ${player.wins || 0} | L: ${player.losses || 0} | D: ${player.draws || 0}`;
    
    // Format last active time
    const lastActive = player.last_active ? formatLastActivity(new Date(player.last_active)) : 'Unknown';
    card.querySelector('[data-last-active]').textContent = `Last active: ${lastActive}`;
    
    // Replace the action buttons
    const buttonsContainer = card.querySelector('.action-buttons');
    buttonsContainer.innerHTML = '';
    
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm btn-primary';
    addBtn.innerHTML = '<i class="bi bi-person-plus"></i> Add';
    addBtn.addEventListener('click', () => {
        sendFriendRequest(player.id, player.username);
    });
    
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-sm btn-outline-primary';
    viewBtn.innerHTML = '<i class="bi bi-graph-up"></i>';
    viewBtn.addEventListener('click', async () => {
        const userData = await getUserData();
        if (!userData || !userData.user_id) {
            showAlert('You must be logged in to view stats.', 'warning');
            return;
        }
        const friendshipResponse = await fetch(`/api/get_friendship?user_id=${userData.user_id}&friend_id=${player.id}`);
        const friendship = await friendshipResponse.json();

        if (!friendship || friendship.status !== 'accepted') {
            showAlert('Please friend this user to view their stats.', 'warning');
            return;
        }
        window.location.href = `/friend_stats/${player.id}`;
    });
    
    buttonsContainer.appendChild(addBtn);
    buttonsContainer.appendChild(viewBtn);
    
    return card;
}

/**
 * Handle friend actions (accept, reject, remove)
 */
async function handleFriendAction(action, friendshipId) {
    try {
        // Add a timestamp to the request to avoid caching issues
        const timestamp = new Date().getTime();
        
        const response = await fetch('/api/friend_action', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({
                action: action,
                friendship_id: friendshipId,
                timestamp: timestamp
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showAlert(`Error: ${result.error}`, 'danger');
            return;
        }
        
        if (action === 'accept') {
            showAlert('Friend request accepted!', 'success');
            await loadFriendRequests();
            await loadFriendsList();
        } else if (action === 'reject') {
            showAlert('Friend request rejected.', 'info');
            await loadFriendRequests();
        } else if (action === 'remove') {
            showAlert('Friend removed.', 'info');
            await loadFriendsList();
        }
    } catch (error) {
        console.error(`Error handling friend action ${action}:`, error);
        showAlert('An error occurred. Please try again.', 'danger');
    }
}

/**
 * Send a friend request
 */
async function sendFriendRequest(friendId, friendUsername) {
    try {
        const response = await fetch('/api/friend_action', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'add',
                user_id: currentUserId,
                friend_id: friendId
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showAlert(`Error: ${result.error}`, 'danger');
            return;
        }
        
        showAlert(`Friend request sent to ${friendUsername}!`, 'success');
        await loadSuggestions();
    } catch (error) {
        console.error('Error sending friend request:', error);
        showAlert('An error occurred. Please try again.', 'danger');
    }
}

/**
 * Fetch a friend's stats
 */
async function fetchFriendStats(friendId) {
    try {
        const response = await fetch(`/api/player_stats/${friendId}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching friend stats:', error);
        return null;
    }
}

/**
 * Format the last active time as a relative time string
 */
function formatLastActivity(date) {
    if (!date) return 'Unknown';
    
    // Make sure both dates are comparable
    const now = new Date();
    
    // Ensure date is properly parsed if it's a string
    let parsedDate = date;
    if (typeof date === 'string') {
        parsedDate = new Date(date);
    }
    
    // If the date is invalid, return Unknown
    if (isNaN(parsedDate.getTime())) {
        console.warn('Invalid date:', date);
        return 'Unknown';
    }
    
    // Calculate time difference
    const diffMs = now - parsedDate;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);
    
    // Log for debugging
    console.log('Time comparison:', {
        now: now.toISOString(),
        date: parsedDate.toISOString(),
        diffMs,
        diffSec,
        diffMin,
        diffHr,
        diffDays
    });
    
    if (diffDays > 30) {
        return parsedDate.toLocaleDateString();
    } else if (diffDays >= 1) {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else if (diffHr >= 1) {
        return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
    } else if (diffMin >= 1) {
        return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
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
        const bsAlert = new bootstrap.Alert(alertDiv);
        bsAlert.close();
    }, 5000);
}