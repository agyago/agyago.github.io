/**
 * Photo Comments JavaScript
 * Handles loading, posting, and deleting comments
 */

// Check if user is admin (has OAuth session)
let isAdmin = false;

// Check admin status on page load
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/auth/status');
    if (response.ok) {
      const data = await response.json();
      isAdmin = data.authenticated;
    }
  } catch (error) {
    console.log('Not logged in as admin');
  }

  // Load comment counts for all photos
  loadAllCommentCounts();
});

// Toggle comments section visibility
function toggleComments(photoName) {
  const contentId = `comments-${photoName.replace(/\./g, '-')}`;
  const content = document.getElementById(contentId);

  if (content.style.display === 'none') {
    content.style.display = 'block';
    loadComments(photoName);
  } else {
    content.style.display = 'none';
  }
}

// Load comment counts for all photos
async function loadAllCommentCounts() {
  const photoElements = document.querySelectorAll('.photo-comments');

  for (const element of photoElements) {
    const photoName = element.getAttribute('data-photo');
    try {
      const response = await fetch(`/api/comments?photo=${encodeURIComponent(photoName)}`);
      if (response.ok) {
        const data = await response.json();
        const count = data.comments.length;
        const countSpan = element.querySelector('.comment-count');
        if (countSpan) {
          countSpan.textContent = count;
        }
      }
    } catch (error) {
      console.error(`Error loading count for ${photoName}:`, error);
    }
  }
}

// Load comments for a specific photo
async function loadComments(photoName) {
  const contentId = `comments-${photoName.replace(/\./g, '-')}`;
  const content = document.getElementById(contentId);
  const commentsList = content.querySelector('.comments-list');

  try {
    const response = await fetch(`/api/comments?photo=${encodeURIComponent(photoName)}`);

    if (!response.ok) {
      throw new Error('Failed to load comments');
    }

    const data = await response.json();
    const comments = data.comments || [];

    // Update comment count
    const photoElement = document.querySelector(`[data-photo="${photoName}"]`);
    const countSpan = photoElement.querySelector('.comment-count');
    if (countSpan) {
      countSpan.textContent = comments.length;
    }

    // Display comments
    if (comments.length === 0) {
      commentsList.innerHTML = '<div class="no-comments">No comments yet. Be the first to comment!</div>';
    } else {
      commentsList.innerHTML = comments.map(comment => createCommentHTML(comment)).join('');
    }
  } catch (error) {
    console.error('Error loading comments:', error);
    commentsList.innerHTML = '<div class="no-comments">Failed to load comments.</div>';
  }
}

// Create HTML for a single comment
function createCommentHTML(comment) {
  const date = new Date(comment.created_at);
  const timeAgo = getTimeAgo(date);
  const deleteButton = isAdmin ? `<button class="comment-delete" onclick="deleteComment(${comment.id}, '${comment.photo_name}')">Delete</button>` : '';

  return `
    <div class="comment-item" data-id="${comment.id}">
      <div class="comment-header">
        <div>
          <span class="comment-author">${escapeHTML(comment.author_name || 'Anonymous')}</span>
          <span class="comment-date"> • ${timeAgo}</span>
        </div>
        ${deleteButton}
      </div>
      <div class="comment-text">${escapeHTML(comment.comment_text)}</div>
    </div>
  `;
}

// Post a new comment
async function postComment(photoName) {
  const contentId = `comments-${photoName.replace(/\./g, '-')}`;
  const content = document.getElementById(contentId);
  const authorInput = content.querySelector('.comment-author');
  const textInput = content.querySelector('.comment-text');
  const button = content.querySelector('.comment-form button');
  const statusDiv = content.querySelector('.comment-status');

  const author = authorInput.value.trim();
  const text = textInput.value.trim();

  // Validation
  if (!text) {
    showStatus(statusDiv, 'Please write a comment', 'error');
    return;
  }

  if (text.length > 1000) {
    showStatus(statusDiv, 'Comment is too long (max 1000 characters)', 'error');
    return;
  }

  // Disable form
  button.disabled = true;
  button.textContent = 'Posting...';

  try {
    const response = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photo: photoName,
        author: author || 'Anonymous',
        text: text
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to post comment');
    }

    // Clear form
    authorInput.value = '';
    textInput.value = '';

    // Show success
    showStatus(statusDiv, 'Comment posted successfully!', 'success');

    // Reload comments
    await loadComments(photoName);

  } catch (error) {
    console.error('Error posting comment:', error);
    showStatus(statusDiv, error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Post Comment';
  }
}

// Delete a comment (admin only)
async function deleteComment(commentId, photoName) {
  if (!confirm('Are you sure you want to delete this comment?')) {
    return;
  }

  try {
    const response = await fetch(`/api/comments/${commentId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete comment');
    }

    // Reload comments
    await loadComments(photoName);

  } catch (error) {
    console.error('Error deleting comment:', error);
    alert('Failed to delete comment: ' + error.message);
  }
}

// Show status message
function showStatus(statusDiv, message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `comment-status ${type}`;
  statusDiv.style.display = 'block';

  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 5000);
}

// Get relative time (e.g., "2 hours ago")
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;
  return `${Math.floor(seconds / 31536000)} years ago`;
}

// Escape HTML to prevent XSS
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
