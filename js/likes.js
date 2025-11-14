// Likes functionality for photo gallery

// Load like counts when page loads
document.addEventListener('DOMContentLoaded', function() {
  const photoLikes = document.querySelectorAll('.photo-likes');

  photoLikes.forEach(function(likeDiv) {
    const photoName = likeDiv.getAttribute('data-photo');
    loadLikeStatus(photoName, likeDiv);
  });
});

// Load like status for a photo
async function loadLikeStatus(photoName, likeDiv) {
  try {
    const response = await fetch(`/api/likes?photo=${encodeURIComponent(photoName)}`);

    if (!response.ok) {
      console.error('Failed to load likes for', photoName);
      return;
    }

    const data = await response.json();

    // Update the UI
    const button = likeDiv.querySelector('.like-button');
    const heart = button.querySelector('.heart');
    const countSpan = button.querySelector('.like-count');

    // Update count
    countSpan.textContent = data.count;

    // Update heart icon based on liked status
    if (data.liked) {
      heart.textContent = '♥'; // Filled heart
      button.classList.add('liked');
    } else {
      heart.textContent = '♡'; // Outline heart
      button.classList.remove('liked');
    }

  } catch (error) {
    console.error('Error loading like status:', error);
  }
}

// Toggle like when heart button is clicked
async function toggleLike(photoName, button) {
  // Prevent multiple clicks while processing
  if (button.classList.contains('loading')) {
    return;
  }

  button.classList.add('loading');

  try {
    const response = await fetch('/api/likes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ photo: photoName })
    });

    if (!response.ok) {
      throw new Error('Failed to toggle like');
    }

    const data = await response.json();

    // Update the UI
    const heart = button.querySelector('.heart');
    const countSpan = button.querySelector('.like-count');

    // Update count
    countSpan.textContent = data.count;

    // Update heart icon and animation
    if (data.liked) {
      heart.textContent = '♥'; // Filled heart
      button.classList.add('liked');
    } else {
      heart.textContent = '♡'; // Outline heart
      button.classList.remove('liked');
    }

  } catch (error) {
    console.error('Error toggling like:', error);
    alert('Failed to update like. Please try again.');
  } finally {
    button.classList.remove('loading');
  }
}
